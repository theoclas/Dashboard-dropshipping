import { prisma } from "./prisma";

export function listAdvertisingCampaigns(companyId: string, productId: string) {
  return prisma.advertisingCampaign.findMany({
    where: { companyId, productId },
    include: { advertisingAccount: true },
    orderBy: [{ displayName: "asc" }, { externalCampaignId: "asc" }],
  });
}

export function getAdvertisingCampaign(companyId: string, id: string) {
  return prisma.advertisingCampaign.findFirst({
    where: { id, companyId },
    include: { advertisingAccount: true, product: true },
  });
}

export async function createAdvertisingCampaign(
  companyId: string,
  data: {
    productId: string;
    externalCampaignId: string;
    displayName?: string | null;
    advertisingAccountId?: string | null;
  },
) {
  const ext = data.externalCampaignId.trim();
  if (!ext) throw new Error("ID Meta de campaña requerido.");
  return prisma.advertisingCampaign.create({
    data: {
      companyId,
      productId: data.productId,
      externalCampaignId: ext,
      displayName: data.displayName?.trim() || null,
      advertisingAccountId: data.advertisingAccountId ?? null,
    },
    include: { advertisingAccount: true },
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
    include: { advertisingAccount: true },
  });
}

export async function deleteAdvertisingCampaign(companyId: string, id: string) {
  const r = await prisma.advertisingCampaign.deleteMany({ where: { id, companyId } });
  return r.count > 0;
}
