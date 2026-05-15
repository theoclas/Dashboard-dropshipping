import { prisma } from "./prisma";

export function listAdvertisingAccounts(companyId: string) {
  return prisma.advertisingAccount.findMany({
    where: { companyId },
    orderBy: { metaAccountId: "asc" },
  });
}

export function createAdvertisingAccount(companyId: string, metaAccountId: string, businessName?: string | null) {
  const id = metaAccountId.trim();
  if (!id) throw new Error("ID de cuenta Meta requerido.");
  return prisma.advertisingAccount.create({
    data: {
      companyId,
      metaAccountId: id,
      businessName: businessName?.trim() || null,
    },
  });
}

export function getAdvertisingAccount(companyId: string, id: string) {
  return prisma.advertisingAccount.findFirst({ where: { id, companyId } });
}
