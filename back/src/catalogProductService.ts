import crypto from "node:crypto";
import { prisma } from "./prisma";

/** Normaliza fragmentos que entran en la huella (espacios, tipos desde Excel/SQL). */
function normDropiKeyPart(v: unknown): string {
  if (v == null) return "";
  const raw = typeof v === "string" ? v : typeof v === "number" || typeof v === "bigint" ? String(v) : String(v);
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Huella estable de la variante Dropi (producto_id + sku + variación id + texto variación).
 * Debe coincidir al guardar el vínculo y al resolver líneas de `productos_detalle`.
 */
export function dropiVariantKey(parts: {
  productoId: string | null | undefined;
  sku: string | null | undefined;
  variacionId: string | null | undefined;
  variacion: string | null | undefined;
}): string {
  const s = `${normDropiKeyPart(parts.productoId)}\u001e${normDropiKeyPart(parts.sku)}\u001e${normDropiKeyPart(parts.variacionId)}\u001e${normDropiKeyPart(parts.variacion)}`;
  return crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 64);
}

export async function listDropiLinks(companyId: string, catalogProductId: string) {
  return prisma.catalogProductDropiLink.findMany({
    where: { companyId, catalogProductId },
    orderBy: { createdAt: "desc" },
  });
}

export async function mapVariantKeysToCatalogLinks(companyId: string, keys: string[]) {
  const uniq = [...new Set(keys.filter(Boolean))];
  if (uniq.length === 0) {
    return new Map<string, { catalogProductId: string; catalogProductName: string; linkId: string }>();
  }
  const rows = await prisma.catalogProductDropiLink.findMany({
    where: { companyId, variantKey: { in: uniq } },
    include: { catalogProduct: { select: { id: true, name: true } } },
  });
  return new Map(
    rows.map((r) => [
      r.variantKey,
      {
        catalogProductId: r.catalogProductId,
        catalogProductName: r.catalogProduct.name,
        linkId: r.id,
      },
    ]),
  );
}

export async function upsertDropiLink(
  companyId: string,
  catalogProductId: string,
  data: {
    productoId?: string | null;
    sku?: string | null;
    variacionId?: string | null;
    variacion?: string | null;
    productoNombre?: string | null;
  },
) {
  const p = await getCatalogProduct(companyId, catalogProductId);
  if (!p) return { ok: false as const, code: "NOT_FOUND" as const };

  const variantKey = dropiVariantKey({
    productoId: data.productoId,
    sku: data.sku,
    variacionId: data.variacionId,
    variacion: data.variacion,
  });

  const conflict = await prisma.catalogProductDropiLink.findFirst({
    where: { companyId, variantKey, catalogProductId: { not: catalogProductId } },
  });
  if (conflict) return { ok: false as const, code: "VARIANT_IN_USE" as const };

  const existing = await prisma.catalogProductDropiLink.findFirst({
    where: { companyId, variantKey },
  });

  const payload = {
    catalogProductId,
    productoId: normDropiKeyPart(data.productoId) || null,
    sku: normDropiKeyPart(data.sku) || null,
    variacionId: normDropiKeyPart(data.variacionId) || null,
    variacion: normDropiKeyPart(data.variacion) || null,
    productoNombre: data.productoNombre?.trim() || null,
  };

  if (existing) {
    const row = await prisma.catalogProductDropiLink.update({
      where: { id: existing.id },
      data: {
        ...payload,
        variantKey,
      },
    });
    return { ok: true as const, row };
  }

  const row = await prisma.catalogProductDropiLink.create({
    data: {
      companyId,
      variantKey,
      ...payload,
    },
  });
  return { ok: true as const, row };
}

export type BulkDropiLinkInput = {
  productoId?: string | null;
  sku?: string | null;
  variacionId?: string | null;
  variacion?: string | null;
  productoNombre?: string | null;
};

/**
 * Crea o actualiza vínculos para varias huellas Dropi al mismo producto de catálogo.
 * Omite duplicados por `variantKey`. Si una variante ya está en otro producto del catálogo, se omite y se reporta.
 */
export async function bulkUpsertDropiLinks(
  companyId: string,
  catalogProductId: string,
  items: BulkDropiLinkInput[],
): Promise<
  | { ok: false; code: "NOT_FOUND" }
  | {
      ok: true;
      applied: number;
      skippedConflict: number;
      conflicts: { sku: string | null; variacion: string | null; variacionId: string | null; message: string }[];
    }
> {
  const p = await getCatalogProduct(companyId, catalogProductId);
  if (!p) return { ok: false, code: "NOT_FOUND" };

  const byKey = new Map<string, BulkDropiLinkInput>();
  for (const it of items) {
    const vk = dropiVariantKey({
      productoId: it.productoId,
      sku: it.sku,
      variacionId: it.variacionId,
      variacion: it.variacion,
    });
    if (!byKey.has(vk)) byKey.set(vk, it);
  }

  let applied = 0;
  let skippedConflict = 0;
  const conflicts: { sku: string | null; variacion: string | null; variacionId: string | null; message: string }[] =
    [];

  for (const it of byKey.values()) {
    const result = await upsertDropiLink(companyId, catalogProductId, it);
    if (result.ok) {
      applied += 1;
      continue;
    }
    if (result.code === "VARIANT_IN_USE") {
      skippedConflict += 1;
      conflicts.push({
        sku: normDropiKeyPart(it.sku) || null,
        variacion: normDropiKeyPart(it.variacion) || null,
        variacionId: normDropiKeyPart(it.variacionId) || null,
        message: "Ya vinculada a otro producto del catálogo.",
      });
    }
  }

  return { ok: true, applied, skippedConflict, conflicts };
}

export async function deleteDropiLink(companyId: string, catalogProductId: string, linkId: string) {
  const r = await prisma.catalogProductDropiLink.deleteMany({
    where: { id: linkId, companyId, catalogProductId },
  });
  return r.count > 0;
}

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

export async function listProductAdvertisingAccounts(companyId: string, catalogProductId: string) {
  const rows = await prisma.catalogProductAdvertisingAccount.findMany({
    where: { companyId, catalogProductId },
    include: { advertisingAccount: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.advertisingAccount);
}

export async function replaceProductAdvertisingAccounts(
  companyId: string,
  catalogProductId: string,
  advertisingAccountIds: string[],
) {
  const p = await getCatalogProduct(companyId, catalogProductId);
  if (!p) return { ok: false as const, code: "NOT_FOUND" as const };

  const uniq = [...new Set(advertisingAccountIds.filter(Boolean))];
  const valid = await prisma.advertisingAccount.findMany({
    where: { companyId, id: { in: uniq } },
    select: { id: true },
  });
  const validIds = valid.map((a) => a.id);

  await prisma.$transaction([
    prisma.catalogProductAdvertisingAccount.deleteMany({
      where: { companyId, catalogProductId, advertisingAccountId: { notIn: validIds } },
    }),
    ...validIds.map((advertisingAccountId) =>
      prisma.catalogProductAdvertisingAccount.upsert({
        where: {
          companyId_catalogProductId_advertisingAccountId: {
            companyId,
            catalogProductId,
            advertisingAccountId,
          },
        },
        create: { companyId, catalogProductId, advertisingAccountId },
        update: {},
      }),
    ),
  ]);

  return { ok: true as const, accounts: await listProductAdvertisingAccounts(companyId, catalogProductId) };
}
