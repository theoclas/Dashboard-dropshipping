import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { toMetricRecordDate } from "./excelImportHelpers";
import {
  aggregateMetricRowsByCampaignAndDate,
  normalizeCampaignMapKey,
  type ParsedMetaCampaignRow,
} from "./metaCampaignExcelParse";
import { linkCampaignToProduct } from "./advertisingCampaignService";

export type ImportAdvertisingCampaignMetricsOptions = {
  useShopifySessions: boolean;
  shopifySessionsByCampaignId: Record<string, number>;
  applyAdvertisingAccount: boolean;
  advertisingAccountId: string | null;
  allowedCampaignIds?: string[];
};

export type ImportAdvertisingCampaignMetricsResult = {
  imported: number;
  campaignsUpdated: number;
  metricsCreated: number;
  metricsUpdated: number;
  errors: string[];
};

export async function importAdvertisingCampaignMetrics(
  companyId: string,
  catalogProductId: string,
  parsedRows: ParsedMetaCampaignRow[],
  options: ImportAdvertisingCampaignMetricsOptions,
  parseErrors: string[] = [],
): Promise<ImportAdvertisingCampaignMetricsResult> {
  const errors = [...parseErrors];

  const product = await prisma.catalogProduct.findFirst({ where: { id: catalogProductId, companyId } });
  if (!product) {
    errors.push("Producto de catálogo no encontrado en la empresa.");
    return { imported: 0, campaignsUpdated: 0, metricsCreated: 0, metricsUpdated: 0, errors };
  }

  const idsAtImportStart = new Set(
    (
      await prisma.advertisingCampaign.findMany({
        where: { companyId },
        select: { externalCampaignId: true },
      })
    ).map((x) => x.externalCampaignId),
  );

  let imported = 0;
  const updatedExtIds = new Set<string>();
  let metricsCreated = 0;
  let metricsUpdated = 0;

  const aggregated = aggregateMetricRowsByCampaignAndDate(parsedRows);
  let rowsToImport = aggregated;
  if (options.allowedCampaignIds != null && options.allowedCampaignIds.length > 0) {
    const allow = new Set(options.allowedCampaignIds.map((id) => normalizeCampaignMapKey(id)));
    rowsToImport = aggregated.filter((r) => allow.has(normalizeCampaignMapKey(r.externalCampaignId.trim())));
    if (rowsToImport.length === 0) {
      errors.push(
        "Ninguna fila coincide con las campañas seleccionadas; revisa los IDs o vuelve a generar la vista previa.",
      );
      return { imported: 0, campaignsUpdated: 0, metricsCreated: 0, metricsUpdated: 0, errors };
    }
  }

  for (const r of rowsToImport) {
    const recordDate = toMetricRecordDate(r.recordDate);
    const extId = r.externalCampaignId.trim();

    let shopify: number | null | undefined = r.shopifySessions ?? undefined;
    let shopifyManualApplied = false;
    if (options.useShopifySessions) {
      const k = normalizeCampaignMapKey(extId);
      const manual = options.shopifySessionsByCampaignId[k];
      if (manual !== undefined && manual !== null && !Number.isNaN(Number(manual))) {
        shopify = Math.round(Number(manual));
        shopifyManualApplied = true;
      } else {
        shopify = null;
      }
    }

    const shopifyForDb = options.useShopifySessions
      ? shopifyManualApplied
        ? (shopify ?? null)
        : null
      : (shopify ?? null);

    const snapshot = r.rawRow as Prisma.InputJsonValue;

    try {
      const existingCamp = await prisma.advertisingCampaign.findUnique({
        where: { companyId_externalCampaignId: { companyId, externalCampaignId: extId } },
      });

      let campaignId: string;
      if (existingCamp) {
        campaignId = existingCamp.id;
        if (idsAtImportStart.has(extId)) {
          updatedExtIds.add(extId);
        }
        await prisma.advertisingCampaign.update({
          where: { id: campaignId },
          data: {
            displayName: r.displayName ?? existingCamp.displayName,
            ...(options.applyAdvertisingAccount ? { advertisingAccountId: options.advertisingAccountId } : {}),
          },
        });
      } else {
        const created = await prisma.advertisingCampaign.create({
          data: {
            companyId,
            externalCampaignId: extId,
            displayName: r.displayName ?? null,
            ...(options.applyAdvertisingAccount ? { advertisingAccountId: options.advertisingAccountId } : {}),
          },
        });
        campaignId = created.id;
        imported += 1;
      }

      await linkCampaignToProduct(companyId, catalogProductId, campaignId);

      const existingMetric = await prisma.advertisingCampaignMetric.findUnique({
        where: { campaignId_recordDate: { campaignId, recordDate } },
        select: { id: true },
      });

      await prisma.advertisingCampaignMetric.upsert({
        where: { campaignId_recordDate: { campaignId, recordDate } },
        create: {
          companyId,
          campaignId,
          recordDate,
          metaLinkClicks: r.metaLinkClicks ?? null,
          metaConversationsStarted: r.metaConversationsStarted ?? null,
          shopifySessions: shopifyForDb,
          metaExcelSnapshot: snapshot,
        },
        update: {
          metaLinkClicks: r.metaLinkClicks ?? null,
          metaConversationsStarted: r.metaConversationsStarted ?? null,
          ...(options.useShopifySessions ? { shopifySessions: shopifyForDb } : { shopifySessions: shopify ?? null }),
          metaExcelSnapshot: snapshot,
        },
      });

      if (existingMetric) metricsUpdated += 1;
      else metricsCreated += 1;
    } catch (e) {
      errors.push(
        `${extId} ${recordDate.toISOString().slice(0, 10)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    imported,
    campaignsUpdated: updatedExtIds.size,
    metricsCreated,
    metricsUpdated,
    errors,
  };
}

export type ImportAdvertisingPreviewPayload = {
  sampleRows: Omit<ParsedMetaCampaignRow, "rawRow">[];
  totalRows: number;
  errors: string[];
  uniqueCampaignIds: string[];
  campaignDisplayNames: Record<string, string>;
  campaignAggregatedRowCounts: Record<string, number>;
  defaultSelectedCampaignIds: string[];
  reportDate?: string;
  source?: "file" | "meta-api";
};

export function buildImportPreviewPayload(
  parsedRows: ParsedMetaCampaignRow[],
  errors: string[],
  extras?: {
    reportDate?: string;
    source?: "file" | "meta-api";
    defaultSelectedCampaignIds?: string[];
  },
): ImportAdvertisingPreviewPayload {
  const aggregated = aggregateMetricRowsByCampaignAndDate(parsedRows);
  const labelByKey = new Map<string, string>();
  for (const r of aggregated) {
    const k = normalizeCampaignMapKey(r.externalCampaignId.trim());
    if (!labelByKey.has(k) && r.displayName?.trim()) labelByKey.set(k, r.displayName.trim());
  }
  const uniqueCampaignIds = [...new Set(aggregated.map((r) => normalizeCampaignMapKey(r.externalCampaignId.trim())))].sort(
    (a, b) => a.localeCompare(b, "es"),
  );
  const rowCountByCampaign = new Map<string, number>();
  for (const r of aggregated) {
    const k = normalizeCampaignMapKey(r.externalCampaignId.trim());
    rowCountByCampaign.set(k, (rowCountByCampaign.get(k) ?? 0) + 1);
  }
  const sampleRows = aggregated.slice(0, 50).map(({ rawRow: _omit, ...rest }) => ({
    ...rest,
    recordDate: rest.recordDate,
  }));

  const defaultSelected =
    extras?.defaultSelectedCampaignIds ??
    uniqueCampaignIds;

  return {
    sampleRows: sampleRows.map((r) => ({
      ...r,
      recordDate: r.recordDate,
    })),
    totalRows: aggregated.length,
    errors,
    uniqueCampaignIds,
    campaignDisplayNames: Object.fromEntries(labelByKey),
    campaignAggregatedRowCounts: Object.fromEntries(rowCountByCampaign),
    defaultSelectedCampaignIds: defaultSelected,
    ...(extras?.reportDate ? { reportDate: extras.reportDate } : {}),
    ...(extras?.source ? { source: extras.source } : {}),
  };
}
