import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeCampaignMapKey, parseMetaCampaignMetricsExcel } from "./metaCampaignExcelParse";

export type ImportAdvertisingCampaignMetricsOptions = {
  useShopifySessions: boolean;
  /** Claves normalizadas con `normalizeCampaignMapKey`. */
  shopifySessionsByCampaignId: Record<string, number>;
  applyAdvertisingAccount: boolean;
  /** Si `applyAdvertisingAccount` y valor null, se quita el vínculo. */
  advertisingAccountId: string | null;
};

export type ImportAdvertisingCampaignMetricsResult = {
  imported: number;
  campaignsUpdated: number;
  metricsCreated: number;
  metricsUpdated: number;
  errors: string[];
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function importAdvertisingCampaignMetricsExcel(
  buffer: Buffer,
  companyId: string,
  catalogProductId: string,
  options: ImportAdvertisingCampaignMetricsOptions,
): Promise<ImportAdvertisingCampaignMetricsResult> {
  const { rows, errors: parseErrors } = parseMetaCampaignMetricsExcel(buffer);
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

  for (const r of rows) {
    const recordDate = startOfUtcDay(r.recordDate);
    const extId = r.externalCampaignId.trim();

    let shopify = r.shopifySessions;
    if (options.useShopifySessions) {
      const k = normalizeCampaignMapKey(extId);
      const manual = options.shopifySessionsByCampaignId[k];
      if (manual !== undefined && manual !== null && !Number.isNaN(Number(manual))) {
        shopify = Math.round(Number(manual));
      }
    }

    const snapshot = r.rawRow as Prisma.InputJsonValue;

    try {
      const existingCamp = await prisma.advertisingCampaign.findUnique({
        where: { companyId_externalCampaignId: { companyId, externalCampaignId: extId } },
      });

      if (existingCamp && existingCamp.productId !== catalogProductId) {
        errors.push(
          `Campaña ${extId} ya existe vinculada a otro producto del catálogo; no se importó la fila del ${recordDate.toISOString().slice(0, 10)}.`,
        );
        continue;
      }

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
            productId: catalogProductId,
            externalCampaignId: extId,
            displayName: r.displayName ?? null,
            ...(options.applyAdvertisingAccount ? { advertisingAccountId: options.advertisingAccountId } : {}),
          },
        });
        campaignId = created.id;
        imported += 1;
      }

      const existingMetric = await prisma.advertisingCampaignMetric.findUnique({
        where: { campaignId_recordDate: { campaignId, recordDate } },
      });

      if (existingMetric) {
        await prisma.advertisingCampaignMetric.update({
          where: { id: existingMetric.id },
          data: {
            metaLinkClicks: r.metaLinkClicks ?? null,
            metaConversationsStarted: r.metaConversationsStarted ?? null,
            shopifySessions: shopify ?? null,
            metaExcelSnapshot: snapshot,
          },
        });
        metricsUpdated += 1;
      } else {
        await prisma.advertisingCampaignMetric.create({
          data: {
            companyId,
            campaignId,
            recordDate,
            metaLinkClicks: r.metaLinkClicks ?? null,
            metaConversationsStarted: r.metaConversationsStarted ?? null,
            shopifySessions: shopify ?? null,
            metaExcelSnapshot: snapshot,
          },
        });
        metricsCreated += 1;
      }
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
