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

export async function updateAdvertisingAccount(
  companyId: string,
  id: string,
  data: { metaAccountId?: string; businessName?: string | null },
) {
  const existing = await getAdvertisingAccount(companyId, id);
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  const nextMetaId =
    data.metaAccountId !== undefined ? data.metaAccountId.trim() : existing.metaAccountId;
  if (!nextMetaId) throw new Error("ID de cuenta Meta requerido.");

  if (nextMetaId !== existing.metaAccountId) {
    const dup = await prisma.advertisingAccount.findFirst({
      where: { companyId, metaAccountId: nextMetaId, NOT: { id } },
    });
    if (dup) return { ok: false as const, code: "DUPLICATE_META_ID" as const };
  }

  const account = await prisma.advertisingAccount.update({
    where: { id },
    data: {
      metaAccountId: nextMetaId,
      ...(data.businessName !== undefined ? { businessName: data.businessName?.trim() || null } : {}),
    },
  });
  return { ok: true as const, account };
}
