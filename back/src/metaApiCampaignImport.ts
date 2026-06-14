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
