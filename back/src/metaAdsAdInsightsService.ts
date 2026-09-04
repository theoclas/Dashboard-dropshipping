import {
  fetchJsonWithRetry,
  metaApiVersion,
  metaTimezone,
  todayYmdInTimezone,
  toMetaActAccountId,
  type MetaInsightApiRow,
} from "./metaAdsInsightsService";
import { resolveMetaAccessToken } from "./metaAdsTokenResolver";

/**
 * Insights a nivel `ad` con `time_increment=1`: Meta devuelve una fila por anuncio y por día
 * en **una sola llamada** por cuenta (más paginación), en vez de una llamada por día como en
 * el import de campañas. A nivel anuncio las filas se multiplican, así que evitar N llamadas
 * es lo que hace viable un rango largo sin chocar con el rate limit.
 */
const AD_INSIGHT_FIELDS = [
  "account_id",
  "account_name",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "action_values",
  "cost_per_action_type",
  "purchase_roas",
  "date_start",
  "date_stop",
].join(",");

/**
 * Ventanas de atribución fijas. Sin esto Meta usa el default de la cuenta, que puede cambiar,
 * y entonces comparar un día contra otro deja de ser válido.
 */
const ATTRIBUTION_WINDOWS = JSON.stringify(["7d_click", "1d_view"]);

/** Un trimestre. El límite real no es la API sino cuántas filas quieres traer de golpe. */
export const AD_API_MAX_RANGE_DAYS = 92;

/** Tope de páginas por cuenta; evita bucles infinitos si `paging.next` se comporta raro. */
const MAX_PAGES = 60;

export type FetchAdInsightsResult = {
  rows: MetaInsightApiRow[];
  desde: string;
  hasta: string;
  accountId: string;
  pagesFetched: number;
  /**
   * `true` si se alcanzó el tope de páginas y quedaron filas sin traer.
   *
   * Importa más de lo que parece: un rango truncado se escribe como si estuviera
   * completo y el gasto del dashboard baja sin que nadie lo note. Quien llame debe
   * tratarlo como fallo de esa cuenta, no como un aviso.
   */
  truncated: boolean;
  errors: string[];
};

function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export type AdRangeValidation =
  | { ok: true; desde: string; hasta: string; days: number }
  | { ok: false; message: string };

export function validateAdApiDateRange(desde: string, hasta: string): AdRangeValidation {
  const d0 = parseYmd(desde);
  const d1 = parseYmd(hasta);
  if (!d0 || !d1) return { ok: false, message: "Fechas inválidas. Usa formato YYYY-MM-DD." };

  const start = d0 <= d1 ? desde : hasta;
  const end = d0 <= d1 ? hasta : desde;
  const startDt = d0 <= d1 ? d0 : d1;
  const endDt = d0 <= d1 ? d1 : d0;

  const hoy = todayYmdInTimezone(metaTimezone());
  if (start > hoy) {
    return { ok: false, message: "No se puede consultar un rango que empieza en el futuro." };
  }

  const days = Math.floor((endDt.getTime() - startDt.getTime()) / 86_400_000) + 1;
  if (days > AD_API_MAX_RANGE_DAYS) {
    return { ok: false, message: `Máximo ${AD_API_MAX_RANGE_DAYS} días por consulta.` };
  }

  // Recortar el futuro: Meta devuelve vacío y solo confunde la vista previa.
  return { ok: true, desde: start, hasta: end > hoy ? hoy : end, days };
}

function buildAdInsightsUrl(actId: string, desde: string, hasta: string): string {
  const base = `https://graph.facebook.com/${metaApiVersion()}/${actId}/insights`;
  const params = new URLSearchParams({
    level: "ad",
    time_range: JSON.stringify({ since: desde, until: hasta }),
    time_increment: "1",
    action_attribution_windows: ATTRIBUTION_WINDOWS,
    fields: AD_INSIGHT_FIELDS,
    limit: "500",
  });
  return `${base}?${params.toString()}`;
}

/** Trae todas las filas anuncio × día del rango para una cuenta Meta. */
export async function fetchAdInsightsForAccountRange(
  metaAccountId: string,
  opts: {
    companyId: string;
    desde: string;
    hasta: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
  },
): Promise<FetchAdInsightsResult> {
  const v = validateAdApiDateRange(opts.desde, opts.hasta);
  if (!v.ok) throw new Error(v.message);

  const actId = toMetaActAccountId(metaAccountId);
  const accessToken = await resolveMetaAccessToken({
    companyId: opts.companyId,
    metaAdsAppId: opts.metaAdsAppId,
    metaAdsSystemUserId: opts.metaAdsSystemUserId,
  });

  const errors: string[] = [];
  const rows: MetaInsightApiRow[] = [];

  let url: string | null = buildAdInsightsUrl(actId, v.desde, v.hasta);
  let pagesFetched = 0;

  while (url && pagesFetched < MAX_PAGES) {
    pagesFetched += 1;
    const page = await fetchJsonWithRetry(url, accessToken);
    rows.push(...(page.data ?? []));
    url = page.paging?.next ?? null;
  }

  const truncated = url !== null;
  if (truncated) {
    errors.push(
      `La cuenta ${actId} devolvió más de ${MAX_PAGES} páginas entre ${v.desde} y ${v.hasta}; ` +
        `los datos están incompletos. Reduce el rango.`,
    );
  }
  if (rows.length === 0) {
    errors.push(`Sin filas de anuncios para ${actId} entre ${v.desde} y ${v.hasta}.`);
  }

  return { rows, desde: v.desde, hasta: v.hasta, accountId: actId, pagesFetched, truncated, errors };
}

/** Ancho de la miniatura que pedimos a Meta; suficiente para reconocer el creativo en una tabla. */
const THUMBNAIL_SIZE = 256;

type AdCreativeRaw = {
  id?: string;
  thumbnail_url?: string;
  image_url?: string;
  object_type?: string;
};

type AdMetaResponse = {
  data?: Array<{
    id?: string;
    effective_status?: string;
    creative?: AdCreativeRaw;
  }>;
  paging?: { next?: string };
  error?: { message?: string; code?: number };
};

export type AdMetadata = {
  effectiveStatus: string | null;
  creativeId: string | null;
  creativeThumbUrl: string | null;
  creativeImageUrl: string | null;
  creativeObjectType: string | null;
};

/**
 * Estado actual y creativo de cada anuncio. Nada de esto viene en `/insights`, así que va en
 * una llamada aparte al edge `/ads` — pero es **una sola** por cuenta, no una por anuncio.
 *
 * Las URLs de imagen son del CDN de Meta y llevan firma que caduca; por eso se refrescan en
 * cada import y la UI tiene que tolerar que una miniatura no cargue.
 *
 * Si esta llamada falla, el import sigue: el creativo es contexto, no un dato de negocio.
 */
export async function fetchAdMetadata(
  metaAccountId: string,
  opts: {
    companyId: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
  },
): Promise<{ byAdId: Map<string, AdMetadata>; error: string | null }> {
  const byAdId = new Map<string, AdMetadata>();
  try {
    const actId = toMetaActAccountId(metaAccountId);
    const accessToken = await resolveMetaAccessToken({
      companyId: opts.companyId,
      metaAdsAppId: opts.metaAdsAppId,
      metaAdsSystemUserId: opts.metaAdsSystemUserId,
    });

    const fields = [
      "id",
      "effective_status",
      `creative{id,object_type,image_url,thumbnail_url.width(${THUMBNAIL_SIZE}).height(${THUMBNAIL_SIZE})}`,
    ].join(",");

    let url: string | null =
      `https://graph.facebook.com/${metaApiVersion()}/${actId}/ads?` +
      new URLSearchParams({ fields, limit: "500" }).toString();

    let pages = 0;
    while (url && pages < MAX_PAGES) {
      pages += 1;
      const page = (await fetchJsonWithRetry(url, accessToken)) as unknown as AdMetaResponse;
      for (const item of page.data ?? []) {
        if (!item.id) continue;
        const c = item.creative ?? {};
        byAdId.set(String(item.id), {
          effectiveStatus: item.effective_status ? String(item.effective_status) : null,
          creativeId: c.id ? String(c.id) : null,
          creativeThumbUrl: c.thumbnail_url ? String(c.thumbnail_url) : null,
          creativeImageUrl: c.image_url ? String(c.image_url) : null,
          creativeObjectType: c.object_type ? String(c.object_type) : null,
        });
      }
      url = page.paging?.next ?? null;
    }
    return { byAdId, error: null };
  } catch (e) {
    return { byAdId, error: e instanceof Error ? e.message : String(e) };
  }
}
