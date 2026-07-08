import * as advertisingAccountService from "./advertisingAccountService";
import { buildImportPreviewPayload } from "./importAdvertisingCampaignMetrics";
import { fetchCampaignInsightsForAccount } from "./metaAdsInsightsService";
import { mapInsightsToParsedRows } from "./metaApiInsightNormalize";
import {
  aggregateMetricRowsByCampaignAndDate,
  normalizeCampaignMapKey,
  type ParsedMetaCampaignRow,
} from "./metaCampaignExcelParse";

export type MetaApiImportPreviewResult = ReturnType<typeof buildImportPreviewPayload> & {
  pagesFetched: number;
  metaAccountId: string;
};

export async function fetchMetaApiParsedRowsForAccount(
  companyId: string,
  advertisingAccountId: string,
  opts?: {
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
    reportDate?: string | null;
  },
): Promise<{
  parsedRows: ParsedMetaCampaignRow[];
  reportDate: string;
  metaAccountId: string;
  pagesFetched: number;
  errors: string[];
}> {
  const acc = await advertisingAccountService.getAdvertisingAccount(companyId, advertisingAccountId);
  if (!acc) {
    throw new Error("Cuenta publicitaria no encontrada.");
  }

  const fetchResult = await fetchCampaignInsightsForAccount(acc.metaAccountId, opts);
  const { rows, errors: mapErrors } = mapInsightsToParsedRows(fetchResult.rows, fetchResult.reportDate);
  const errors = [...fetchResult.errors, ...mapErrors];

  return {
    parsedRows: rows,
    reportDate: fetchResult.reportDate,
    metaAccountId: acc.metaAccountId,
    pagesFetched: fetchResult.pagesFetched,
    errors,
  };
}

export async function previewMetaApiCampaignImport(
  companyId: string,
  advertisingAccountId: string,
  opts?: {
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
    reportDate?: string | null;
  },
): Promise<MetaApiImportPreviewResult> {
  const { parsedRows, reportDate, metaAccountId, pagesFetched, errors } =
    await fetchMetaApiParsedRowsForAccount(companyId, advertisingAccountId, opts);

  const payload = buildImportPreviewPayload(parsedRows, errors, {
    reportDate,
    source: "meta-api",
  });

  return {
    ...payload,
    pagesFetched,
    metaAccountId,
  };
}

export const META_API_MAX_RANGE_DAYS = 30;
export const META_API_DAY_DELAY_MS = 1600;

function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function enumerateYmdStrings(desde: string, hasta: string): string[] {
  const d0 = parseYmd(desde);
  const d1 = parseYmd(hasta);
  if (!d0 || !d1) return [];
  const start = d0 <= d1 ? d0 : d1;
  const end = d0 <= d1 ? d1 : d0;
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    if (out.length >= META_API_MAX_RANGE_DAYS) break;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function validateMetaApiDateRange(desde: string, hasta: string): { ok: true; days: string[] } | { ok: false; message: string } {
  const days = enumerateYmdStrings(desde, hasta);
  if (days.length === 0) return { ok: false, message: "Rango de fechas inválido." };
  const realSpan =
    Math.floor((parseYmd(hasta)!.getTime() - parseYmd(desde)!.getTime()) / 86_400_000) + 1;
  const ordered = parseYmd(desde)! <= parseYmd(hasta)! ? realSpan : -realSpan;
  const span = Math.abs(ordered);
  if (span > META_API_MAX_RANGE_DAYS) {
    return { ok: false, message: `Máximo ${META_API_MAX_RANGE_DAYS} días por consulta.` };
  }
  return { ok: true, days };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type MetaApiRangePreviewDay = {
  reportDate: string;
  preview: MetaApiImportPreviewResult | null;
  error: string | null;
};

export async function previewMetaApiCampaignImportRange(
  companyId: string,
  advertisingAccountId: string,
  opts: {
    reportDateDesde: string;
    reportDateHasta: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
    onDayStart?: (reportDate: string, index: number, total: number) => void;
  },
): Promise<{ metaAccountId: string; days: MetaApiRangePreviewDay[] }> {
  const v = validateMetaApiDateRange(opts.reportDateDesde, opts.reportDateHasta);
  if (!v.ok) throw new Error(v.message);

  const days: MetaApiRangePreviewDay[] = [];
  let metaAccountId = "";

  for (let i = 0; i < v.days.length; i++) {
    const reportDate = v.days[i]!;
    opts.onDayStart?.(reportDate, i, v.days.length);
    if (i > 0) await delay(META_API_DAY_DELAY_MS);
    try {
      const preview = await previewMetaApiCampaignImport(companyId, advertisingAccountId, {
        metaAdsAppId: opts.metaAdsAppId,
        metaAdsSystemUserId: opts.metaAdsSystemUserId,
        reportDate,
      });
      metaAccountId = preview.metaAccountId;
      days.push({ reportDate, preview, error: null });
    } catch (e) {
      days.push({
        reportDate,
        preview: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!metaAccountId) {
    const acc = await advertisingAccountService.getAdvertisingAccount(companyId, advertisingAccountId);
    metaAccountId = acc?.metaAccountId ?? "";
  }

  return { metaAccountId, days };
}

export function filterParsedRowsByCampaignIds(
  rows: ParsedMetaCampaignRow[],
  allowedCampaignIds: string[],
): ParsedMetaCampaignRow[] {
  if (allowedCampaignIds.length === 0) return rows;
  const allow = new Set(allowedCampaignIds.map((id) => normalizeCampaignMapKey(id)));
  return aggregateMetricRowsByCampaignAndDate(rows).filter((r) =>
    allow.has(normalizeCampaignMapKey(r.externalCampaignId.trim())),
  );
}
