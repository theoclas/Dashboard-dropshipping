import { toMetricRecordDate } from "./excelImportHelpers";
import type { ParsedMetaCampaignRow } from "./metaCampaignExcelParse";
import type { MetaInsightApiRow } from "./metaAdsInsightsService";

export const PURCHASE_ACTION_TYPES = [
  "web_in_store_purchase",
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
] as const;

export const MESSAGING_ACTION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
  "onsite_conversion.messaging_conversation_started",
  "messaging_conversation_started_7d",
] as const;

type ActionItem = { action_type?: string; value?: string | number };

export function getActionValue(
  list: unknown,
  actionTypes: readonly string[],
): number {
  if (!Array.isArray(list)) return 0;
  for (const actionType of actionTypes) {
    const item = (list as ActionItem[]).find((x) => x.action_type === actionType);
    if (item) return Number(item.value ?? 0) || 0;
  }
  return 0;
}

function numOrZero(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseReportDate(row: MetaInsightApiRow, fallbackYmd: string): Date {
  const start = row.date_start;
  if (typeof start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const [y, m, d] = start.split("-").map(Number);
    return toMetricRecordDate(new Date(Date.UTC(y, m - 1, d)));
  }
  const [y, m, d] = fallbackYmd.split("-").map(Number);
  return toMetricRecordDate(new Date(Date.UTC(y, m - 1, d)));
}

export function mapInsightToParsedRow(
  row: MetaInsightApiRow,
  fallbackReportDate: string,
): ParsedMetaCampaignRow | null {
  const campaignId = String(row.campaign_id ?? "").trim();
  if (!campaignId) return null;

  const spend = numOrZero(row.spend);
  const purchases = getActionValue(row.actions, PURCHASE_ACTION_TYPES);
  const conversionValue = getActionValue(row.action_values, PURCHASE_ACTION_TYPES);
  const costPerPurchase = getActionValue(row.cost_per_action_type, PURCHASE_ACTION_TYPES);
  const roasRaw = row.purchase_roas;
  let roas: number | null = null;
  if (Array.isArray(roasRaw) && roasRaw[0] && typeof roasRaw[0] === "object") {
    const v = Number((roasRaw[0] as ActionItem).value);
    roas = Number.isFinite(v) ? v : null;
  }

  const linkClicks = numOrZero(row.inline_link_clicks) || numOrZero(row.clicks) || undefined;
  const conversations = getActionValue(row.actions, MESSAGING_ACTION_TYPES) || undefined;

  const recordDate = parseReportDate(row, fallbackReportDate);
  const campaignName = String(row.campaign_name ?? "").trim() || undefined;

  const rawRow: Record<string, string | number | boolean | null> = {
    "Campaign ID": campaignId,
    "Campaign name": campaignName ?? null,
    "Importe gastado (COP)": spend,
    "Link clicks": linkClicks ?? null,
    "Conversaciones con mensajes iniciadas": conversations ?? null,
    Compras: purchases,
    "Valor de conversión": conversionValue,
    "Costo por compra": costPerPurchase,
    ROAS: roas,
    Impressions: numOrZero(row.impressions) || null,
    Reach: numOrZero(row.reach) || null,
    Clicks: numOrZero(row.clicks) || null,
    CTR: numOrZero(row.ctr) || null,
    CPC: numOrZero(row.cpc) || null,
    CPM: numOrZero(row.cpm) || null,
    Day: fallbackReportDate,
    _metaApiSource: true,
    _metaApiAccountId: row.account_id != null ? String(row.account_id) : null,
    _metaApiAccountName: row.account_name != null ? String(row.account_name) : null,
    _metaApiDateStart: row.date_start != null ? String(row.date_start) : null,
    _metaApiDateStop: row.date_stop != null ? String(row.date_stop) : null,
    _metaApiActionsJson: row.actions != null ? JSON.stringify(row.actions) : null,
    _metaApiActionValuesJson: row.action_values != null ? JSON.stringify(row.action_values) : null,
    _metaApiPurchaseRoasJson: row.purchase_roas != null ? JSON.stringify(row.purchase_roas) : null,
  };

  return {
    externalCampaignId: campaignId,
    displayName: campaignName,
    recordDate,
    metaLinkClicks: linkClicks,
    metaConversationsStarted: conversations,
    rawRow,
  };
}

export function mapInsightsToParsedRows(
  apiRows: MetaInsightApiRow[],
  reportDate: string,
): { rows: ParsedMetaCampaignRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: ParsedMetaCampaignRow[] = [];
  for (const r of apiRows) {
    const parsed = mapInsightToParsedRow(r, reportDate);
    if (!parsed) {
      errors.push("Fila API sin campaign_id; omitida.");
      continue;
    }
    rows.push(parsed);
  }
  return { rows, errors };
}
