import { toMetricRecordDate } from "./excelImportHelpers";
import type { MetaInsightApiRow } from "./metaAdsInsightsService";
import {
  getActionValue,
  MESSAGING_ACTION_TYPES,
  PURCHASE_ACTION_TYPES,
} from "./metaApiInsightNormalize";

/** Fila anuncio × día ya normalizada, lista para persistir. */
export type ParsedAdRow = {
  externalAccountId: string | null;
  accountName: string | null;
  externalCampaignId: string;
  campaignName: string | null;
  externalAdSetId: string;
  adSetName: string | null;
  externalAdId: string;
  adName: string | null;
  recordDate: Date;
  /** `YYYY-MM-DD` del día al que corresponde la fila. */
  ymd: string;

  spend: number;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;

  conversations: number | null;
  purchases: number | null;
  conversionValue: number | null;
  roas: number | null;

  raw: MetaInsightApiRow;
};

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function numOrZero(v: unknown): number {
  return numOrNull(v) ?? 0;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function ymdOf(row: MetaInsightApiRow): string | null {
  const start = row.date_start;
  if (typeof start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  return null;
}

export function mapAdInsightRow(row: MetaInsightApiRow): ParsedAdRow | null {
  const externalAdId = str(row.ad_id);
  const externalCampaignId = str(row.campaign_id);
  const externalAdSetId = str(row.adset_id);
  const ymd = ymdOf(row);

  // Sin cualquiera de estos la fila no se puede colocar en la jerarquía ni en el día.
  if (!externalAdId || !externalCampaignId || !externalAdSetId || !ymd) return null;

  const [y, m, d] = ymd.split("-").map(Number);
  const recordDate = toMetricRecordDate(new Date(Date.UTC(y, m - 1, d)));

  const purchases = getActionValue(row.actions, PURCHASE_ACTION_TYPES);
  const conversionValue = getActionValue(row.action_values, PURCHASE_ACTION_TYPES);
  const conversations = getActionValue(row.actions, MESSAGING_ACTION_TYPES);

  let roas: number | null = null;
  const roasRaw = row.purchase_roas;
  if (Array.isArray(roasRaw) && roasRaw[0] && typeof roasRaw[0] === "object") {
    roas = numOrNull((roasRaw[0] as { value?: unknown }).value);
  }

  return {
    externalAccountId: str(row.account_id),
    accountName: str(row.account_name),
    externalCampaignId,
    campaignName: str(row.campaign_name),
    externalAdSetId,
    adSetName: str(row.adset_name),
    externalAdId,
    adName: str(row.ad_name),
    recordDate,
    ymd,

    spend: numOrZero(row.spend),
    impressions: numOrNull(row.impressions),
    reach: numOrNull(row.reach),
    clicks: numOrNull(row.clicks),
    linkClicks: numOrNull(row.inline_link_clicks),
    ctr: numOrNull(row.ctr),
    cpc: numOrNull(row.cpc),
    cpm: numOrNull(row.cpm),

    conversations: conversations > 0 ? conversations : null,
    purchases: purchases > 0 ? purchases : null,
    conversionValue: conversionValue > 0 ? conversionValue : null,
    roas,

    raw: row,
  };
}

export function mapAdInsightRows(rows: MetaInsightApiRow[]): {
  parsed: ParsedAdRow[];
  errors: string[];
} {
  const parsed: ParsedAdRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    const p = mapAdInsightRow(r);
    if (p) parsed.push(p);
    else skipped += 1;
  }
  const errors =
    skipped > 0 ? [`${skipped} fila(s) sin ad_id / adset_id / campaign_id / fecha; omitidas.`] : [];
  return { parsed, errors };
}

/** Totales de un grupo de filas anuncio × día. */
export type AdRollup = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  conversations: number;
  purchases: number;
  conversionValue: number;
};

export function emptyRollup(): AdRollup {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    conversations: 0,
    purchases: 0,
    conversionValue: 0,
  };
}

export function addToRollup(acc: AdRollup, r: ParsedAdRow): void {
  acc.spend += r.spend;
  acc.impressions += r.impressions ?? 0;
  acc.reach += r.reach ?? 0;
  acc.clicks += r.clicks ?? 0;
  acc.linkClicks += r.linkClicks ?? 0;
  acc.conversations += r.conversations ?? 0;
  acc.purchases += r.purchases ?? 0;
  acc.conversionValue += r.conversionValue ?? 0;
}

/**
 * Derivadas de un acumulado. Se recalculan desde las bases y NUNCA se promedian los
 * porcentajes que trae Meta: promediar CTR de varias filas da un número distinto al real.
 */
export function deriveRates(acc: AdRollup): {
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  costPerPurchase: number | null;
  costPerConversation: number | null;
  roas: number | null;
} {
  return {
    ctr: acc.impressions > 0 ? (acc.clicks / acc.impressions) * 100 : null,
    cpm: acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : null,
    cpc: acc.clicks > 0 ? acc.spend / acc.clicks : null,
    costPerPurchase: acc.purchases > 0 ? acc.spend / acc.purchases : null,
    costPerConversation: acc.conversations > 0 ? acc.spend / acc.conversations : null,
    roas: acc.spend > 0 && acc.conversionValue > 0 ? acc.conversionValue / acc.spend : null,
  };
}
