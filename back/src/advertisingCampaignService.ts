import { prisma } from "./prisma";
import { normalizeCampaignMapKey } from "./metaCampaignExcelParse";

const campaignInclude = {
  advertisingAccount: true,
  productLinks: {
    include: {
      catalogProduct: { select: { id: true, name: true } },
    },
  },
} as const;

export type AdvertisingCampaignWithLinks = Awaited<
  ReturnType<typeof listAdvertisingCampaigns>
>[number];

export function listAdvertisingCampaigns(companyId: string, catalogProductId: string) {
  return prisma.advertisingCampaign.findMany({
    where: {
      companyId,
      productLinks: { some: { catalogProductId } },
    },
    include: campaignInclude,
    orderBy: [{ displayName: "asc" }, { externalCampaignId: "asc" }],
  });
}

export function listAdvertisingCampaignsByAccount(companyId: string, advertisingAccountId: string) {
  return prisma.advertisingCampaign.findMany({
    where: { companyId, advertisingAccountId },
    include: campaignInclude,
    orderBy: [{ displayName: "asc" }, { externalCampaignId: "asc" }],
  });
}

export function getAdvertisingCampaign(companyId: string, id: string) {
  return prisma.advertisingCampaign.findFirst({
    where: { id, companyId },
    include: campaignInclude,
  });
}

export async function linkCampaignToProduct(
  companyId: string,
  catalogProductId: string,
  campaignId: string,
) {
  const camp = await prisma.advertisingCampaign.findFirst({ where: { id: campaignId, companyId } });
  if (!camp) return null;
  const product = await prisma.catalogProduct.findFirst({ where: { id: catalogProductId, companyId } });
  if (!product) return null;

  await prisma.catalogProductAdvertisingCampaign.upsert({
    where: {
      companyId_catalogProductId_campaignId: {
        companyId,
        catalogProductId,
        campaignId,
      },
    },
    create: { companyId, catalogProductId, campaignId },
    update: {},
  });

  if (camp.advertisingAccountId) {
    await prisma.catalogProductAdvertisingAccount.upsert({
      where: {
        companyId_catalogProductId_advertisingAccountId: {
          companyId,
          catalogProductId,
          advertisingAccountId: camp.advertisingAccountId,
        },
      },
      create: {
        companyId,
        catalogProductId,
        advertisingAccountId: camp.advertisingAccountId,
      },
      update: {},
    });
  }

  return getAdvertisingCampaign(companyId, campaignId);
}

export async function unlinkCampaignFromProduct(
  companyId: string,
  catalogProductId: string,
  campaignId: string,
) {
  const r = await prisma.catalogProductAdvertisingCampaign.deleteMany({
    where: { companyId, catalogProductId, campaignId },
  });
  return r.count > 0;
}

export async function setCampaignProductLinks(
  companyId: string,
  campaignId: string,
  catalogProductIds: string[],
) {
  const camp = await prisma.advertisingCampaign.findFirst({ where: { id: campaignId, companyId } });
  if (!camp) return null;

  const uniq = [...new Set(catalogProductIds.filter(Boolean))];
  const validProducts = await prisma.catalogProduct.findMany({
    where: { companyId, id: { in: uniq } },
    select: { id: true },
  });
  const validIds = validProducts.map((p) => p.id);

  await prisma.$transaction([
    prisma.catalogProductAdvertisingCampaign.deleteMany({
      where: { companyId, campaignId, catalogProductId: { notIn: validIds } },
    }),
    ...validIds.map((catalogProductId) =>
      prisma.catalogProductAdvertisingCampaign.upsert({
        where: {
          companyId_catalogProductId_campaignId: { companyId, catalogProductId, campaignId },
        },
        create: { companyId, catalogProductId, campaignId },
        update: {},
      }),
    ),
  ]);

  if (camp.advertisingAccountId) {
    for (const catalogProductId of validIds) {
      await prisma.catalogProductAdvertisingAccount.upsert({
        where: {
          companyId_catalogProductId_advertisingAccountId: {
            companyId,
            catalogProductId,
            advertisingAccountId: camp.advertisingAccountId!,
          },
        },
        create: {
          companyId,
          catalogProductId,
          advertisingAccountId: camp.advertisingAccountId,
        },
        update: {},
      });
    }
  }

  return getAdvertisingCampaign(companyId, campaignId);
}

export async function findOrCreateCampaignByExternalId(
  companyId: string,
  data: {
    externalCampaignId: string;
    displayName?: string | null;
    advertisingAccountId?: string | null;
    catalogProductIds?: string[];
  },
) {
  const ext = data.externalCampaignId.trim();
  if (!ext) throw new Error("ID Meta de campaña requerido.");

  let campaign = await prisma.advertisingCampaign.findUnique({
    where: { companyId_externalCampaignId: { companyId, externalCampaignId: ext } },
    include: campaignInclude,
  });

  if (!campaign) {
    campaign = await prisma.advertisingCampaign.create({
      data: {
        companyId,
        externalCampaignId: ext,
        displayName: data.displayName?.trim() || null,
        advertisingAccountId: data.advertisingAccountId ?? null,
      },
      include: campaignInclude,
    });
  } else {
    campaign = await prisma.advertisingCampaign.update({
      where: { id: campaign.id },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName?.trim() || null } : {}),
        ...(data.advertisingAccountId !== undefined
          ? { advertisingAccountId: data.advertisingAccountId }
          : {}),
      },
      include: campaignInclude,
    });
  }

  const productIds = data.catalogProductIds ?? [];
  for (const catalogProductId of productIds) {
    await linkCampaignToProduct(companyId, catalogProductId, campaign.id);
  }

  return getAdvertisingCampaign(companyId, campaign.id);
}

export async function createAdvertisingCampaign(
  companyId: string,
  data: {
    catalogProductId: string;
    externalCampaignId: string;
    displayName?: string | null;
    advertisingAccountId?: string | null;
  },
) {
  return findOrCreateCampaignByExternalId(companyId, {
    externalCampaignId: data.externalCampaignId,
    displayName: data.displayName,
    advertisingAccountId: data.advertisingAccountId,
    catalogProductIds: [data.catalogProductId],
  });
}

export async function createAdvertisingCampaignForAccount(
  companyId: string,
  advertisingAccountId: string,
  data: {
    externalCampaignId: string;
    displayName?: string | null;
    catalogProductIds: string[];
  },
) {
  const acc = await prisma.advertisingAccount.findFirst({ where: { id: advertisingAccountId, companyId } });
  if (!acc) throw new Error("Cuenta publicitaria no encontrada.");

  return findOrCreateCampaignByExternalId(companyId, {
    externalCampaignId: data.externalCampaignId,
    displayName: data.displayName,
    advertisingAccountId,
    catalogProductIds: data.catalogProductIds,
  });
}

export async function updateAdvertisingCampaign(
  companyId: string,
  id: string,
  data: Partial<{ displayName: string | null; advertisingAccountId: string | null }>,
) {
  const existing = await prisma.advertisingCampaign.findFirst({ where: { id, companyId } });
  if (!existing) return null;
  return prisma.advertisingCampaign.update({
    where: { id },
    data: {
      ...(data.displayName !== undefined ? { displayName: data.displayName?.trim() || null } : {}),
      ...(data.advertisingAccountId !== undefined ? { advertisingAccountId: data.advertisingAccountId } : {}),
    },
    include: campaignInclude,
  });
}

export async function deleteAdvertisingCampaign(companyId: string, id: string) {
  const r = await prisma.advertisingCampaign.deleteMany({ where: { id, companyId } });
  return r.count > 0;
}

/** IDs Meta normalizados vinculados al producto para preselección en import. */
export async function resolveDefaultSelectedCampaignIds(
  companyId: string,
  catalogProductId: string,
  advertisingAccountId: string | null,
  previewUniqueIds: string[],
): Promise<string[]> {
  const previewSet = new Set(previewUniqueIds.map((id) => normalizeCampaignMapKey(id)));

  const links = await prisma.catalogProductAdvertisingCampaign.findMany({
    where: { companyId, catalogProductId },
    include: {
      campaign: {
        select: {
          externalCampaignId: true,
          advertisingAccountId: true,
        },
      },
    },
  });

  if (links.length === 0) {
    return previewUniqueIds.filter((id) => previewSet.has(normalizeCampaignMapKey(id)));
  }

  const configuredKeys = links
    .filter((l) => {
      if (!advertisingAccountId) return true;
      const accId = l.campaign.advertisingAccountId;
      return accId == null || accId === advertisingAccountId;
    })
    .map((l) => normalizeCampaignMapKey(l.campaign.externalCampaignId.trim()));

  return configuredKeys.filter((k) => previewSet.has(k));
}

export async function getCampaignIdsForProduct(companyId: string, catalogProductId: string): Promise<string[]> {
  const links = await prisma.catalogProductAdvertisingCampaign.findMany({
    where: { companyId, catalogProductId },
    select: { campaignId: true },
  });
  return links.map((l) => l.campaignId);
}
