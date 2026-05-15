import { prisma } from "./prisma";

export function listCatalogProducts(companyId: string) {
  return prisma.catalogProduct.findMany({
    where: { companyId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export function getCatalogProduct(companyId: string, id: string) {
  return prisma.catalogProduct.findFirst({ where: { id, companyId } });
}

export function createCatalogProduct(companyId: string, data: { name: string; sku?: string | null; notes?: string | null }) {
  return prisma.catalogProduct.create({
    data: {
      companyId,
      name: data.name.trim(),
      sku: data.sku?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
}

export function updateCatalogProduct(
  companyId: string,
  id: string,
  data: Partial<{ name: string; sku: string | null; notes: string | null; isActive: boolean }>,
) {
  return prisma.catalogProduct.updateMany({
    where: { id, companyId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.sku !== undefined ? { sku: data.sku?.trim() || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}
