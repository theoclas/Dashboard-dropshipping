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
  /** Pedidos del producto sin cancelar/rechazar (base del %). */
  pedidosEnviados: number;
  /** Entregados o devueltos del producto, según la tabla. */
  pedidos: number;
  /** Pedidos del producto aún en tránsito (sin entregar ni devolver). */
  pendientes: number;
  unidades: number;
  /** pedidos / pedidosEnviados del mismo producto. */
  pct: number;
  /** pendientes / pedidosEnviados del mismo producto. */
  pctPendientes: number;
};

type LineRow = {
  pedido_id_dropi: string;
  bucket: string;
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

function pctOf(n: number, d: number): number {
  const den = d > 0 ? d : 1;
  return Math.round((n / den) * 1000) / 10;
}

export async function queryEntregaByProductBreakdown(
  prisma: PrismaClient,
  companyId: string,
  opts: { desde?: string; hasta?: string },
): Promise<{
  entregadosByProduct: EntregaEstadoByProductRow[];
  devolucionesByProduct: EntregaEstadoByProductRow[];
}> {
  const dr = parseDateRange(opts.desde, opts.hasta);
  const sql = `
SELECT
  TRIM(p.id_dropi) AS pedido_id_dropi,
  (${SQL_ENTREGA_BUCKET}) AS bucket,
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
  ${dr ? "AND p.fecha >= ? AND p.fecha <= ?" : ""}
`;

  const args: unknown[] = [companyId];
  if (dr) args.push(dr.start, dr.end);

  const lines = await prisma.$queryRawUnsafe<LineRow[]>(sql, ...args);
  if (lines.length === 0) {
    return { entregadosByProduct: [], devolucionesByProduct: [] };
  }

  const variantKeys = lines.map((l) =>
    dropiVariantKey({
      productoId: l.producto_id,
      sku: l.sku,
      variacionId: l.variacion_id,
      variacion: l.variacion,
    }),
  );
  const catalogByKey = await mapVariantKeysToCatalogLinks(companyId, variantKeys);

  type Acc = {
    productName: string;
    enviados: Set<string>;
    entregados: Set<string>;
    devoluciones: Set<string>;
    pendientes: Set<string>;
    unidadesEntregadas: number;
    unidadesDevueltas: number;
    unidadesPendientes: number;
  };
  const byProduct = new Map<string, Acc>();

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const bucket = l.bucket;
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
      acc = {
        productName,
        enviados: new Set(),
        entregados: new Set(),
        devoluciones: new Set(),
        pendientes: new Set(),
        unidadesEntregadas: 0,
        unidadesDevueltas: 0,
        unidadesPendientes: 0,
      };
      byProduct.set(productKey, acc);
    }

    const pedidoId = l.pedido_id_dropi;
    const qty = Number(l.cantidad ?? 1) || 1;

    if (bucket !== "cancelado" && bucket !== "rechazado") {
      acc.enviados.add(pedidoId);
    }
    if (bucket === "entregado") {
      acc.entregados.add(pedidoId);
      acc.unidadesEntregadas += qty;
    }
    if (bucket === "devolucion") {
      acc.devoluciones.add(pedidoId);
      acc.unidadesDevueltas += qty;
    }
    if (bucket === "transito") {
      acc.pendientes.add(pedidoId);
      acc.unidadesPendientes += qty;
    }
  }

  const entregadosByProduct: EntregaEstadoByProductRow[] = [];
  const devolucionesByProduct: EntregaEstadoByProductRow[] = [];

  for (const [productKey, acc] of byProduct.entries()) {
    const enviados = acc.enviados.size;

    if (acc.entregados.size > 0) {
      entregadosByProduct.push({
        productKey,
        productName: acc.productName,
        pedidosEnviados: enviados,
        pedidos: acc.entregados.size,
        pendientes: acc.pendientes.size,
        unidades: acc.unidadesEntregadas,
        pct: pctOf(acc.entregados.size, enviados),
        pctPendientes: pctOf(acc.pendientes.size, enviados),
      });
    }

    if (acc.devoluciones.size > 0) {
      devolucionesByProduct.push({
        productKey,
        productName: acc.productName,
        pedidosEnviados: enviados,
        pedidos: acc.devoluciones.size,
        pendientes: acc.pendientes.size,
        unidades: acc.unidadesDevueltas,
        pct: pctOf(acc.devoluciones.size, enviados),
        pctPendientes: pctOf(acc.pendientes.size, enviados),
      });
    }
  }

  entregadosByProduct.sort((a, b) => b.pedidos - a.pedidos);
  devolucionesByProduct.sort((a, b) => b.pedidos - a.pedidos);

  return { entregadosByProduct, devolucionesByProduct };
}
