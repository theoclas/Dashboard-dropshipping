import type { PrismaClient } from "@prisma/client";

/**
 * Productos del catálogo que hay dentro de cada pedido.
 *
 * El vínculo no es directo: un pedido tiene filas en `productos_detalle` (lo que mandó
 * Dropi) y el catálogo se conecta con ellas por la terna `productoId + sku + variacionId`
 * de `CatalogProductDropiLink`. La terna se compara entera, incluidos los nulos, igual
 * que hace el filtro por producto que ya existía.
 */

export type ProductoDeCatalogo = { id: string; name: string };

/** Clave de la terna que enlaza un detalle de Dropi con un producto del catálogo. */
function terna(productoId: string | null, sku: string | null, variacionId: string | null): string {
  return `${productoId ?? ""}|${sku ?? ""}|${variacionId ?? ""}`;
}

/**
 * Mapa `idPedidoDropi -> productos del catálogo`.
 *
 * Se resuelve en dos consultas para toda la página de pedidos, no una por fila: con 50
 * pedidos por página, hacerlo fila a fila serían 100 idas a la base por cada scroll.
 */
export async function catalogProductsForOrders(
  prisma: PrismaClient,
  companyId: string,
  externalOrderIds: string[],
): Promise<Map<string, ProductoDeCatalogo[]>> {
  const out = new Map<string, ProductoDeCatalogo[]>();
  const ids = externalOrderIds.filter((v) => typeof v === "string" && v.trim() !== "");
  if (ids.length === 0) return out;

  const [detalles, links] = await Promise.all([
    prisma.productDetail.findMany({
      where: { companyId, pedidoIdDropi: { in: ids } },
      select: { pedidoIdDropi: true, productoId: true, sku: true, variacionId: true },
    }),
    prisma.catalogProductDropiLink.findMany({
      where: { companyId },
      select: {
        catalogProductId: true,
        productoId: true,
        sku: true,
        variacionId: true,
        catalogProduct: { select: { id: true, name: true } },
      },
    }),
  ]);

  const porTerna = new Map<string, ProductoDeCatalogo>();
  for (const l of links) {
    if (!l.productoId || String(l.productoId).trim() === "") continue;
    porTerna.set(terna(l.productoId, l.sku, l.variacionId), {
      id: l.catalogProduct.id,
      name: l.catalogProduct.name,
    });
  }

  for (const d of detalles) {
    const prod = porTerna.get(terna(d.productoId, d.sku, d.variacionId));
    if (!prod) continue;
    const actuales = out.get(d.pedidoIdDropi) ?? [];
    // Un pedido puede traer varias líneas del mismo producto; en la columna sobra una vez.
    if (!actuales.some((p) => p.id === prod.id)) actuales.push(prod);
    out.set(d.pedidoIdDropi, actuales);
  }

  for (const lista of out.values()) lista.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * IDs externos de los pedidos que contienen **alguno** de los productos dados.
 *
 * Es la versión de varios productos del filtro que ya existía para uno solo.
 */
export async function externalOrderIdsForCatalogProducts(
  prisma: PrismaClient,
  companyId: string,
  catalogProductIds: string[],
): Promise<string[]> {
  const ids = [...new Set(catalogProductIds.filter((v) => typeof v === "string" && v.trim() !== ""))];
  if (ids.length === 0) return [];

  const links = await prisma.catalogProductDropiLink.findMany({
    where: { companyId, catalogProductId: { in: ids } },
    select: { productoId: true, sku: true, variacionId: true },
  });
  const validos = links.filter((l) => l.productoId != null && String(l.productoId).trim() !== "");
  if (validos.length === 0) return [];

  const detalles = await prisma.productDetail.findMany({
    where: {
      OR: validos.map((l) => ({
        companyId,
        productoId: l.productoId!,
        sku: l.sku,
        variacionId: l.variacionId,
      })),
    },
    select: { pedidoIdDropi: true },
    distinct: ["pedidoIdDropi"],
  });
  return detalles.map((r) => r.pedidoIdDropi).filter(Boolean);
}
