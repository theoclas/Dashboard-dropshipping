import type { PrismaClient } from "@prisma/client";
import { dropiVariantKey, mapVariantKeysToCatalogLinks } from "./catalogProductService";

const SQL_ENTREGA_BUCKET = `(CASE
  WHEN LOWER(COALESCE(p.estado_unificado,'')) LIKE '%cancel%'
    OR LOWER(COALESCE(p.estado_operativo,'')) LIKE '%cancel%'
    OR LOWER(COALESCE(p.estatus_original,'')) LIKE '%cancel%'
    OR LOWER(COALESCE(p.ultimo_mov,'')) LIKE '%cancel%' THEN 'cancelado'
  WHEN LOWER(COALESCE(p.estado_unificado,'')) LIKE '%rechaz%'
    OR LOWER(COALESCE(p.estado_operativo,'')) LIKE '%rechaz%'
    OR LOWER(COALESCE(p.estatus_original,'')) LIKE '%rechaz%'
    OR LOWER(COALESCE(p.ultimo_mov,'')) LIKE '%rechaz%' THEN 'rechazado'
  WHEN LOWER(COALESCE(p.estado_unificado,'')) LIKE '%devoluci%'
    OR LOWER(COALESCE(p.estado_operativo,'')) LIKE '%devoluci%'
    OR LOWER(COALESCE(p.estatus_original,'')) LIKE '%devoluci%'
    OR LOWER(COALESCE(p.ultimo_mov,'')) LIKE '%devoluci%' THEN 'devolucion'
  WHEN UPPER(TRIM(COALESCE(p.estado_unificado,''))) IN ('ENTREGADO','ENTREGADOS')
    OR UPPER(TRIM(COALESCE(p.estado_operativo,''))) IN ('ENTREGADO','ENTREGADOS')
    OR UPPER(TRIM(COALESCE(p.estatus_original,''))) IN ('ENTREGADO','ENTREGADOS')
    OR UPPER(TRIM(COALESCE(p.ultimo_mov,''))) IN ('ENTREGADO','ENTREGADOS') THEN 'entregado'
  WHEN TRIM(COALESCE(p.estado_unificado,'')) = '' OR TRIM(COALESCE(p.estado_unificado,'')) = 'SIN MAPEAR' THEN 'sin_mapear'
  ELSE 'transito'
END)`;

export type EntregaEstadoByProductRow = {
  productKey: string;
  productName: string;
  pedidos: number;
  unidades: number;
  pct: number;
};

type LineRow = {
  pedido_id_dropi: string;
  producto_id: string | null;
  sku: string | null;
  variacion_id: string | null;
  variacion: string | null;
  producto_nombre: string | null;
  cantidad: number | null;
};

function parseDateRange(desde?: string, hasta?: string): { start: Date; end: Date } | null {
  if (!desde?.trim() || !hasta?.trim()) return null;
  const [y0, m0, d0] = desde.trim().split("-").map(Number);
  const [y1, m1, d1] = hasta.trim().split("-").map(Number);
  if (![y0, m0, d0, y1, m1, d1].every((n) => Number.isFinite(n))) return null;
  return {
    start: new Date(Date.UTC(y0, m0 - 1, d0, 0, 0, 0, 0)),
    end: new Date(Date.UTC(y1, m1 - 1, d1, 23, 59, 59, 999)),
  };
}

export async function queryEntregaEstadoByProduct(
  prisma: PrismaClient,
  companyId: string,
  bucket: "entregado" | "devolucion",
  opts: { desde?: string; hasta?: string },
  totalPedidosEstado: number,
): Promise<EntregaEstadoByProductRow[]> {
  const dr = parseDateRange(opts.desde, opts.hasta);
  const sql = `
SELECT
  TRIM(p.id_dropi) AS pedido_id_dropi,
  pd.producto_id,
  pd.sku,
  pd.variacion_id,
  pd.variacion,
  pd.producto_nombre,
  pd.cantidad
FROM pedidos p
INNER JOIN productos_detalle pd
  ON pd.companyId = p.companyId AND pd.pedido_id_dropi = p.id_dropi
WHERE p.companyId = ?
  AND (${SQL_ENTREGA_BUCKET}) = ?
  ${dr ? "AND p.fecha >= ? AND p.fecha <= ?" : ""}
`;

  const args: unknown[] = [companyId, bucket];
  if (dr) args.push(dr.start, dr.end);

  const lines = await prisma.$queryRawUnsafe<LineRow[]>(sql, ...args);
  if (lines.length === 0) return [];

  const variantKeys = lines.map((l) =>
    dropiVariantKey({
      productoId: l.producto_id,
      sku: l.sku,
      variacionId: l.variacion_id,
      variacion: l.variacion,
    }),
  );
  const catalogByKey = await mapVariantKeysToCatalogLinks(companyId, variantKeys);

  type Acc = { productName: string; pedidos: Set<string>; unidades: number };
  const byProduct = new Map<string, Acc>();

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const vKey = variantKeys[i];
    const catalog = catalogByKey.get(vKey);
    const productKey = catalog?.catalogProductId ?? `dropi:${vKey}`;
    const productName =
      catalog?.catalogProductName?.trim() ||
      l.producto_nombre?.trim() ||
      l.sku?.trim() ||
      "Sin producto";

    let acc = byProduct.get(productKey);
    if (!acc) {
      acc = { productName, pedidos: new Set(), unidades: 0 };
      byProduct.set(productKey, acc);
    }
    acc.pedidos.add(l.pedido_id_dropi);
    acc.unidades += Number(l.cantidad ?? 1) || 1;
  }

  const den = totalPedidosEstado > 0 ? totalPedidosEstado : 1;

  return [...byProduct.entries()]
    .map(([productKey, acc]) => ({
      productKey,
      productName: acc.productName,
      pedidos: acc.pedidos.size,
      unidades: acc.unidades,
      pct: Math.round((acc.pedidos.size / den) * 1000) / 10,
    }))
    .sort((a, b) => b.pedidos - a.pedidos);
}
