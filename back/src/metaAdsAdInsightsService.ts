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

  if (url) {
    errors.push(
      `La cuenta ${actId} devolvió más de ${MAX_PAGES} páginas; reduce el rango para traerlo completo.`,
    );
  }
  if (rows.length === 0) {
    errors.push(`Sin filas de anuncios para ${actId} entre ${v.desde} y ${v.hasta}.`);
  }

  return { rows, desde: v.desde, hasta: v.hasta, accountId: actId, pagesFetched, errors };
}

type AdStatusResponse = {
  data?: Array<{ id?: string; effective_status?: string }>;
  paging?: { next?: string };
  error?: { message?: string; code?: number };
};

/**
 * Estado actual de cada anuncio (`ACTIVE`, `PAUSED`, ...). No viene en `/insights`, así que es
 * una llamada aparte. Si falla no se corta el import: el estado es informativo, no un dato de negocio.
 */
export async function fetchAdEffectiveStatuses(
  metaAccountId: string,
  opts?: { metaAdsAppId?: string | null; metaAdsSystemUserId?: string | null },
): Promise<{ byAdId: Map<string, string>; error: string | null }> {
  const byAdId = new Map<string, string>();
  try {
    const actId = toMetaActAccountId(metaAccountId);
    const accessToken = await resolveMetaAccessToken({
      metaAdsAppId: opts?.metaAdsAppId,
      metaAdsSystemUserId: opts?.metaAdsSystemUserId,
    });

    let url: string | null =
      `https://graph.facebook.com/${metaApiVersion()}/${actId}/ads?` +
      new URLSearchParams({ fields: "id,effective_status", limit: "500" }).toString();

    let pages = 0;
    while (url && pages < MAX_PAGES) {
      pages += 1;
      const page = (await fetchJsonWithRetry(url, accessToken)) as unknown as AdStatusResponse;
      for (const item of page.data ?? []) {
        if (item.id && item.effective_status) byAdId.set(String(item.id), String(item.effective_status));
      }
      url = page.paging?.next ?? null;
    }
    return { byAdId, error: null };
  } catch (e) {
    return { byAdId, error: e instanceof Error ? e.message : String(e) };
  }
}
