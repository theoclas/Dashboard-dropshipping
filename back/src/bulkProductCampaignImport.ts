import { prisma } from "./prisma";
import { resolveDefaultSelectedCampaignIds } from "./advertisingCampaignService";
import {
  importAdvertisingCampaignMetrics,
  type ImportAdvertisingCampaignMetricsOptions,
  type ImportAdvertisingCampaignMetricsResult,
} from "./importAdvertisingCampaignMetrics";
import { fetchMetaApiParsedRowsForAccount } from "./metaApiCampaignImport";
import { normalizeCampaignMapKey, type ParsedMetaCampaignRow } from "./metaCampaignExcelParse";

export type BulkProductImportDetail = {
  catalogProductId: string;
  productName: string;
  skipped: boolean;
  skipReason?: string;
  result?: ImportAdvertisingCampaignMetricsResult;
};

export type BulkProductImportResult = {
  productsTotal: number;
  productsImported: number;
  productsSkipped: number;
  imported: number;
  campaignsUpdated: number;
  metricsCreated: number;
  metricsUpdated: number;
  errors: string[];
  details: BulkProductImportDetail[];
};

async function listActiveCatalogProducts(companyId: string) {
  return prisma.catalogProduct.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

async function importParsedRowsForAllProducts(
  companyId: string,
  parsedRows: ParsedMetaCampaignRow[],
  parseErrors: string[],
  opts: {
    advertisingAccountId: string | null;
    importOptions: Omit<ImportAdvertisingCampaignMetricsOptions, "allowedCampaignIds">;
  },
): Promise<BulkProductImportResult> {
  const previewUniqueIds = [
    ...new Set(parsedRows.map((r) => normalizeCampaignMapKey(r.externalCampaignId.trim()))),
  ].filter((id) => id.length > 0);

  const products = await listActiveCatalogProducts(companyId);
  const details: BulkProductImportDetail[] = [];
  const errors = [...parseErrors];
  let productsImported = 0;
  let productsSkipped = 0;
  let imported = 0;
  let campaignsUpdated = 0;
  let metricsCreated = 0;
  let metricsUpdated = 0;

  for (const product of products) {
    const linkCount = await prisma.catalogProductAdvertisingCampaign.count({
      where: { companyId, catalogProductId: product.id },
    });

    if (linkCount === 0) {
      productsSkipped++;
      details.push({
        catalogProductId: product.id,
        productName: product.name,
        skipped: true,
        skipReason: "Sin campañas vinculadas",
      });
      continue;
    }

    const allowedIds = await resolveDefaultSelectedCampaignIds(
      companyId,
      product.id,
      opts.advertisingAccountId,
      previewUniqueIds,
    );

    if (allowedIds.length === 0) {
      productsSkipped++;
      details.push({
        catalogProductId: product.id,
        productName: product.name,
        skipped: true,
        skipReason: "Ninguna campaña vinculada coincide con los datos",
      });
      continue;
    }

    const result = await importAdvertisingCampaignMetrics(
      companyId,
      product.id,
      parsedRows,
      { ...opts.importOptions, allowedCampaignIds: allowedIds },
      [],
    );

    const hasData =
      result.imported > 0 ||
      result.campaignsUpdated > 0 ||
      result.metricsCreated > 0 ||
      result.metricsUpdated > 0;

    if (!hasData && result.errors.some((e) => e.includes("Ninguna fila"))) {
      productsSkipped++;
      details.push({
        catalogProductId: product.id,
        productName: product.name,
        skipped: true,
        skipReason: "Sin filas para las campañas vinculadas",
        result,
      });
    } else {
      productsImported++;
      details.push({
        catalogProductId: product.id,
        productName: product.name,
        skipped: false,
        result,
      });
    }

    imported += result.imported;
    campaignsUpdated += result.campaignsUpdated;
    metricsCreated += result.metricsCreated;
    metricsUpdated += result.metricsUpdated;
    for (const err of result.errors) {
      errors.push(`${product.name}: ${err}`);
    }
  }

  return {
    productsTotal: products.length,
    productsImported,
    productsSkipped,
    imported,
    campaignsUpdated,
    metricsCreated,
    metricsUpdated,
    errors,
    details,
  };
}

export async function importMetaApiForAllProducts(
  companyId: string,
  opts: {
    advertisingAccountId: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
    reportDate?: string | null;
    useShopifySessions: boolean;
    shopifySessionsByCampaignId: Record<string, number>;
    applyAdvertisingAccount: boolean;
  },
): Promise<BulkProductImportResult> {
  const { parsedRows, errors: fetchErrors } = await fetchMetaApiParsedRowsForAccount(
    companyId,
    opts.advertisingAccountId,
    {
      metaAdsAppId: opts.metaAdsAppId,
      metaAdsSystemUserId: opts.metaAdsSystemUserId,
      reportDate: opts.reportDate,
    },
  );

  return importParsedRowsForAllProducts(companyId, parsedRows, fetchErrors, {
    advertisingAccountId: opts.advertisingAccountId,
    importOptions: {
      useShopifySessions: opts.useShopifySessions,
      shopifySessionsByCampaignId: opts.shopifySessionsByCampaignId,
      applyAdvertisingAccount: opts.applyAdvertisingAccount,
      advertisingAccountId: opts.applyAdvertisingAccount ? opts.advertisingAccountId : null,
    },
  });
}

export async function importFileForAllProducts(
  companyId: string,
  parsedRows: ParsedMetaCampaignRow[],
  parseErrors: string[],
  opts: {
    advertisingAccountId: string | null;
    useShopifySessions: boolean;
    shopifySessionsByCampaignId: Record<string, number>;
    applyAdvertisingAccount: boolean;
  },
): Promise<BulkProductImportResult> {
  return importParsedRowsForAllProducts(companyId, parsedRows, parseErrors, {
    advertisingAccountId: opts.advertisingAccountId,
    importOptions: {
      useShopifySessions: opts.useShopifySessions,
      shopifySessionsByCampaignId: opts.shopifySessionsByCampaignId,
      applyAdvertisingAccount: opts.applyAdvertisingAccount,
      advertisingAccountId: opts.advertisingAccountId,
    },
  });
}
