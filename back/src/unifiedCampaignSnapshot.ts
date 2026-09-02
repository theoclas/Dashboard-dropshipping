import type { Prisma } from "@prisma/client";
import { normalizeExcelHeaderKey, toNumberLoose } from "./excelImportHelpers";
import {
  addToRollup,
  deriveRates,
  emptyRollup,
  type AdRollup,
  type ParsedAdRow,
} from "./metaAdInsightNormalize";
import type { ParsedMetaCampaignRow } from "./metaCampaignExcelParse";

/**
 * Construcción y fusión del snapshot de `advertising_campaign_metrics` para el import
 * unificado. Todo aquí es **puro**: sin Prisma, sin red. Es lo que permite probar en
 * segundos la parte que, si se equivoca, mueve el gasto del dashboard.
 *
 * ## De dónde sale cada número
 *
 * El import unificado hace dos llamadas por cuenta y rango, y cada una responde una
 * pregunta distinta:
 *
 * - **Nivel anuncio** (`7d_click` + `1d_view`): alimenta la jerarquía y `AdMetric`.
 *   Es lo que ya hacía el módulo Anuncios y no cambia.
 * - **Nivel campaña** (sin parámetro de atribución, o sea el de la cuenta): alimenta
 *   las claves de negocio del snapshot. Es lo que ya hacía Campañas Meta y no cambia.
 *
 * Así los dos módulos viejos se reproducen **exactamente**, cada uno con su ventana, y
 * `cpaExperimentalService` sigue leyendo la misma lectura de conversaciones que hasta
 * hoy. La suma de los anuncios se guarda igualmente en claves `_adRows*` para poder
 * auditar la diferencia en vez de descubrirla tarde.
 */

export type SnapshotValue = string | number | boolean | null;
export type CampaignSnapshot = Record<string, SnapshotValue>;

/** Ventana fija que pide la llamada de nivel anuncio (`metaAdsAdInsightsService`). */
export const AD_LEVEL_ATTRIBUTION = "7d_click,1d_view";
/** La llamada de nivel campaña no manda ventanas: Meta usa la configurada en la cuenta. */
export const CAMPAIGN_LEVEL_ATTRIBUTION = "default";

/**
 * Todas las claves que este escritor puede emitir. Sirve de contrato para los tests de
 * paridad: si alguien quita una, el test que compara contra las dos rutas viejas cae.
 */
export const UNIFIED_OWNED_KEYS: readonly string[] = [
  // Negocio (las leen el dashboard, el CPA y la tabla de Campañas Meta)
  "Campaign ID",
  "Campaign name",
  "Importe gastado (COP)",
  "Link clicks",
  "Conversaciones con mensajes iniciadas",
  "Compras",
  "Valor de conversión",
  "Costo por compra",
  "ROAS",
  "Impressions",
  "Reach",
  "Clicks",
  "CTR",
  "CPC",
  "CPM",
  "Day",
  // Procedencia, tal y como las escriben los dos módulos actuales
  "_metaApiSource",
  "_metaApiAccountId",
  "_metaApiAccountName",
  "_metaApiDateStart",
  "_metaApiDateStop",
  "_metaApiActionsJson",
  "_metaApiActionValuesJson",
  "_metaApiPurchaseRoasJson",
  "_derivedFromAds",
  "_adRowsAggregated",
  "_reachIsSumNotDeduped",
  // Auditoría propia del import unificado
  "_writtenBy",
  "_unifiedRunId",
  "_campaignLevelPass",
  "_attributionCampaignLevel",
  "_attributionAdLevel",
  "_adRowsSpendSum",
  "_adRowsPurchases",
  "_adRowsConversations",
  "_adRowsConversionValue",
  "_spendDeltaVsAds",
  "_spendFallbackToAds",
  "_supersededSource",
];



/**
 * Alias exactos que `spendFromMetaExcelSnapshot` consulta por orden antes de recurrir a
 * su barrido. Tienen que estar aquí porque `Spend (COP)` no contiene ni "importe
 * gastado" ni "amount spent": el barrido no lo ve, pero el lector sí lo acepta.
 */
const SPEND_HEADER_ALIASES = [
  "Importe gastado (COP)",
  "Importe gastado (USD)",
  "Importe gastado",
  "Amount spent (USD)",
  "Amount spent",
  "Spend (COP)",
].map(normalizeExcelHeaderKey);

/**
 * `spendFromMetaExcelSnapshot` tiene un fallback que recorre TODAS las claves buscando
 * cualquier cabecera que suene a importe gastado, y se queda con la primera. Si una
 * fusión dejase viva una clave de gasto vieja (`Amount spent`, `Importe gastado (USD)`)
 * junto a la nueva, el total del dashboard podría cambiar solo. Por eso se purgan.
 *
 * Esta función tiene que reconocer **todo** lo que el lector acepta, no solo lo que su
 * barrido detecta: un hueco entre ambas es exactamente un gasto fantasma.
 */
export function isSpendHeaderKey(key: string): boolean {
  const nk = normalizeExcelHeaderKey(key);
  if (nk.includes("importe gastado") || nk.includes("amount spent")) return true;
  return SPEND_HEADER_ALIASES.includes(nk);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Un gasto sirve si `spendFromMetaExcelSnapshot` sabrá sacarle un número. */
function esGastoUtil(v: SnapshotValue): boolean {
  if (v === null || v === undefined || String(v).trim() === "") return false;
  const n = toNumberLoose(v);
  return n !== undefined && !Number.isNaN(n);
}

export type UnifiedBucketInput = {
  externalCampaignId: string;
  campaignName: string | null;
  /** `YYYY-MM-DD` del día. */
  ymd: string;
  /** Filas anuncio por día de esa campaña y ese día. */
  adRows: ParsedAdRow[];
  /**
   * Fila del mismo campaña-día devuelta por la pasada de nivel campaña, ya normalizada
   * con `mapInsightToParsedRow`. `null` si esa llamada falló o está desactivada.
   */
  campaignLevel: ParsedMetaCampaignRow | null;
  /** Identificador de la corrida, para poder rastrear quién escribió una fila. */
  runId: string;
};

export type UnifiedSnapshotResult = {
  snapshot: CampaignSnapshot;
  /** Columnas reales de la tabla, no solo el JSON. */
  metaLinkClicks: number | null;
  metaConversationsStarted: number | null;
};

function rollupOf(rows: ParsedAdRow[]): AdRollup {
  const acc = emptyRollup();
  for (const r of rows) addToRollup(acc, r);
  return acc;
}

/** Claves de auditoría; se añaden siempre, venga o no la pasada de nivel campaña. */
function auditKeys(
  input: UnifiedBucketInput,
  acc: AdRollup,
  campaignSpend: number | null,
): CampaignSnapshot {
  return {
    _writtenBy: "unified",
    _unifiedRunId: input.runId,
    _campaignLevelPass: input.campaignLevel !== null,
    _attributionAdLevel: AD_LEVEL_ATTRIBUTION,
    _attributionCampaignLevel: input.campaignLevel ? CAMPAIGN_LEVEL_ATTRIBUTION : null,
    _derivedFromAds: true,
    _adRowsAggregated: input.adRows.length,
    _adRowsSpendSum: round2(acc.spend),
    _adRowsPurchases: acc.purchases || null,
    _adRowsConversations: acc.conversations || null,
    _adRowsConversionValue: acc.conversionValue || null,
    // Si esto no es 0 hay algo que explicar: el nivel campaña y la suma de sus anuncios
    // deberían coincidir en gasto, que no depende de la ventana de atribución.
    _spendDeltaVsAds: campaignSpend === null ? null : round2(campaignSpend - acc.spend),
  };
}

type ActionItem = { action_type?: string; value?: string | number };

/** Suma por `action_type` los arrays `actions` / `action_values` de varios anuncios. */
export function aggregateActions(
  rows: ParsedAdRow[],
  field: "actions" | "action_values",
): Array<{ action_type: string; value: number }> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const list = (r.raw as Record<string, unknown>)[field];
    if (!Array.isArray(list)) continue;
    for (const item of list as ActionItem[]) {
      const type = item?.action_type;
      if (typeof type !== "string" || type === "") continue;
      const v = Number(item?.value ?? 0);
      if (!Number.isFinite(v)) continue;
      totals.set(type, (totals.get(type) ?? 0) + v);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([action_type, value]) => ({ action_type, value: round2(value) }));
}

/**
 * Snapshot de un campaña-día. Si hubo pasada de nivel campaña, sus claves de negocio
 * mandan (paridad exacta con el módulo Campañas Meta); si no, se derivan de los
 * anuncios y el alcance se marca como estimado.
 */
export function buildUnifiedCampaignSnapshot(
  input: UnifiedBucketInput,
): UnifiedSnapshotResult {
  const acc = rollupOf(input.adRows);

  if (input.campaignLevel) {
    const base = { ...input.campaignLevel.rawRow } as CampaignSnapshot;
    // El gasto puede llegar como texto si la fila vino de un archivo, no de la API.
    const parsedSpend = toNumberLoose(base["Importe gastado (COP)"]);
    let campaignSpend =
      parsedSpend !== undefined && !Number.isNaN(parsedSpend) ? parsedSpend : null;

    // Meta ha devuelto la campaña sin gasto pero sus anuncios sí gastaron. Dejar el 0
    // haría que el gasto del dashboard cayera ese día sin que nadie se entere; la suma
    // de los anuncios es, con diferencia, la cifra más probable. Queda registrado.
    const fallbackToAds = (campaignSpend === null || campaignSpend === 0) && acc.spend > 0;
    if (fallbackToAds) {
      base["Importe gastado (COP)"] = acc.spend;
      campaignSpend = acc.spend;
    }

    return {
      snapshot: {
        ...base,
        ...auditKeys(input, acc, campaignSpend),
        ...(fallbackToAds ? { _spendFallbackToAds: true } : {}),
      },
      metaLinkClicks: input.campaignLevel.metaLinkClicks ?? null,
      metaConversationsStarted: input.campaignLevel.metaConversationsStarted ?? null,
    };
  }

  // Sin pasada de campaña: se deriva de los anuncios, igual que hacía el módulo Anuncios.
  const rates = deriveRates(acc);
  const first = input.adRows[0];
  const derived: CampaignSnapshot = {
    "Campaign ID": input.externalCampaignId,
    "Campaign name": input.campaignName,
    "Importe gastado (COP)": acc.spend,
    "Link clicks": acc.linkClicks || null,
    "Conversaciones con mensajes iniciadas": acc.conversations || null,
    Compras: acc.purchases,
    "Valor de conversión": acc.conversionValue,
    "Costo por compra": rates.costPerPurchase,
    ROAS: rates.roas,
    Impressions: acc.impressions || null,
    Reach: acc.reach || null,
    Clicks: acc.clicks || null,
    CTR: rates.ctr,
    CPC: rates.cpc,
    CPM: rates.cpm,
    Day: input.ymd,
    _metaApiSource: true,
    _metaApiAccountId: first?.externalAccountId ?? null,
    _metaApiAccountName: first?.accountName ?? null,
    _metaApiDateStart: input.ymd,
    _metaApiDateStop: input.ymd,
    // Se re-agregan sumando por `action_type` entre los anuncios del día: copiar el
    // array de un solo anuncio daría un total que no es el de la campaña.
    _metaApiActionsJson: JSON.stringify(aggregateActions(input.adRows, "actions")),
    _metaApiActionValuesJson: JSON.stringify(aggregateActions(input.adRows, "action_values")),
    _metaApiPurchaseRoasJson: JSON.stringify([
      { action_type: "omni_purchase", value: rates.roas },
    ]),
    // El alcance no se puede sumar entre anuncios: Meta deduplica personas.
    _reachIsSumNotDeduped: true,
  };

  return {
    snapshot: { ...derived, ...auditKeys(input, acc, null) },
    metaLinkClicks: acc.linkClicks || null,
    metaConversationsStarted: acc.conversations || null,
  };
}

/**
 * Funde el snapshot nuevo sobre el que ya había, en vez de pisarlo entero como hacen
 * hoy los dos módulos. Así una columna que vino del Excel (presupuesto, objetivo, lo
 * que sea) sobrevive a un import por API, y al revés.
 *
 * El orden importa: primero se purga el gasto viejo, luego lo que este escritor posee,
 * y solo entonces se superpone lo nuevo.
 */
export function mergeCampaignSnapshot(
  previous: Prisma.JsonValue | null | undefined,
  next: CampaignSnapshot,
): CampaignSnapshot {
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) {
    return { ...next };
  }

  const prev = previous as Record<string, unknown>;
  const kept: CampaignSnapshot = {};

  // Solo se purga el gasto anterior si el nuevo trae uno **utilizable** que lo sustituya.
  // No basta con que exista la clave: un archivo con la celda vacía, o un `null`, la trae
  // igualmente, y purgar entonces dejaba la fila sin gasto legible y el dashboard bajaba.
  const nextTraeGasto = Object.entries(next).some(([k, v]) => isSpendHeaderKey(k) && esGastoUtil(v));

  for (const [k, v] of Object.entries(prev)) {
    if (nextTraeGasto && isSpendHeaderKey(k)) continue;
    // Las claves de procedencia (`_...`) las pone entera quien escribe: conservar las de
    // la corrida anterior haría que la fila mintiera sobre de dónde salieron sus números.
    // Las de negocio NO se purgan: si el Excel no trae `Compras`, es mejor conservar la
    // que dejó la API que dejar la fila sin ese dato.
    if (k.startsWith("_")) continue;
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      kept[k] = v;
    }
  }

  // Un gasto inservible del snapshot nuevo tampoco puede pisar al anterior al superponer:
  // conservarlo en `kept` no sirve de nada si luego el `null` cae encima.
  const nextUtil: CampaignSnapshot = {};
  for (const [k, v] of Object.entries(next)) {
    if (isSpendHeaderKey(k) && !esGastoUtil(v)) continue;
    nextUtil[k] = v;
  }

  const merged: CampaignSnapshot = { ...kept, ...nextUtil };

  // Deja constancia de qué se reemplazó, para poder leerlo en el detalle de la fila.
  const prevWriter = prev._writtenBy;
  if (typeof prevWriter === "string") {
    merged._supersededSource = prevWriter;
  } else if (prev._metaApiSource === true) {
    merged._supersededSource = "meta-api";
  } else if (Object.keys(prev).length > 0) {
    merged._supersededSource = "file";
  } else {
    merged._supersededSource = null;
  }

  return merged;
}
