import type { PrismaClient } from "@prisma/client";
import { SQL_COBRO_DEVOLUCION } from "./carteraSalidaClassification";

/**
 * Devoluciones **cobradas** en el rango, leídas del histórico de cartera.
 *
 * Existe porque «Costo de devoluciones» agrupa por fecha del PEDIDO y eso deja dos huecos:
 *
 * 1. Una devolución cobrada hoy de un pedido del 1 de septiembre aparece el 1, no hoy. Mirando
 *    el rango de hoy el costo sale en cero aunque la cartera diga otra cosa.
 * 2. Una devolución de un pedido anterior al export de órdenes **no aparece nunca**: el pedido
 *    no está en `pedidos`, así que no hay fila a la que sumarle el costo. El 14-09-2026 eran
 *    6 de 13 devoluciones de septiembre, 83.969 pesos que el margen no descontaba.
 *
 * Esta lectura no depende de que el pedido exista: el movimiento de cartera ya trae el monto y
 * la fecha real del cobro. Cuando el pedido sí está, además se puede decir de qué producto era.
 */

export type DevolucionCobradaPorProducto = {
  productKey: string;
  productName: string;
  /** Cobros de devolución atribuidos a este producto en el rango. */
  cobros: number;
  monto: number;
};

export type DevolucionesCobradas = {
  /** Suma de lo que Dropi descontó por devoluciones, por fecha de cobro. */
  total: number;
  cobros: number;
  /** Cobros cuyo pedido no está en la base: su costo no lo ve ninguna otra tarjeta. */
  sinPedido: number;
  sinPedidoMonto: number;
  /** Cobros con pedido pero sin líneas de producto: no se pueden repartir. */
  sinProductoMonto: number;
  byProduct: DevolucionCobradaPorProducto[];
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function numBI(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : num(v);
}

export const DEVOLUCIONES_COBRADAS_VACIO: DevolucionesCobradas = {
  total: 0,
  cobros: 0,
  sinPedido: 0,
  sinPedidoMonto: 0,
  sinProductoMonto: 0,
  byProduct: [],
};

/**
 * @param desde/hasta `YYYY-MM-DD`. Filtran por **fecha del movimiento de cartera**, que es la
 * fecha en la que Dropi cobró — no la del pedido.
 */
export async function getDevolucionesCobradas(
  prisma: PrismaClient,
  companyId: string,
  desde?: string,
  hasta?: string,
): Promise<DevolucionesCobradas> {
  const hasRange = Boolean(desde && hasta);
  const rango = hasRange ? "AND m.fecha >= ? AND m.fecha <= ?" : "";
  const start = hasRange ? new Date(`${desde}T00:00:00.000Z`) : null;
  const end = hasRange ? new Date(`${hasta}T23:59:59.999Z`) : null;
  const p = (base: unknown[]): unknown[] => (hasRange ? [...base, start, end] : base);

  // El monto se toma en valor absoluto: una salida puede venir con signo o sin él según el
  // import, y aquí siempre es un costo.
  const totalesSql = `
SELECT
  COALESCE(SUM(ABS(COALESCE(m.monto,0))), 0) AS total,
  COUNT(*) AS cobros,
  SUM(CASE WHEN ped.id_dropi IS NULL THEN 1 ELSE 0 END) AS sin_pedido,
  COALESCE(SUM(CASE WHEN ped.id_dropi IS NULL THEN ABS(COALESCE(m.monto,0)) ELSE 0 END), 0) AS sin_pedido_monto
FROM cartera_movimientos m
LEFT JOIN pedidos ped
  ON ped.companyId = m.companyId
 AND ped.id_dropi = TRIM(COALESCE(m.orden_id,''))
WHERE m.companyId = ?
  AND ${SQL_COBRO_DEVOLUCION}
  ${rango}
`;

  /**
   * Reparto por producto: un pedido puede traer varias líneas, así que el cobro se prorratea
   * por unidades. Sumar el cobro entero a cada producto inflaría el total.
   */
  const porProductoSql = `
SELECT
  pd.producto_nombre AS product_name,
  COUNT(DISTINCT m.id) AS cobros,
  COALESCE(SUM(ABS(COALESCE(m.monto,0)) * COALESCE(pd.cantidad,0) / NULLIF(u.unidades,0)), 0) AS monto
FROM cartera_movimientos m
JOIN pedidos ped
  ON ped.companyId = m.companyId
 AND ped.id_dropi = TRIM(COALESCE(m.orden_id,''))
JOIN productos_detalle pd
  ON pd.companyId = ped.companyId
 AND pd.pedido_id_dropi = ped.id_dropi
JOIN (
  SELECT companyId, pedido_id_dropi, SUM(COALESCE(cantidad,0)) AS unidades
  FROM productos_detalle
  GROUP BY companyId, pedido_id_dropi
) u
  ON u.companyId = pd.companyId
 AND u.pedido_id_dropi = pd.pedido_id_dropi
WHERE m.companyId = ?
  AND ${SQL_COBRO_DEVOLUCION}
  ${rango}
GROUP BY pd.producto_nombre
ORDER BY monto DESC
`;

  const [totalesRows, productoRows] = await Promise.all([
    prisma.$queryRawUnsafe<
      Array<{ total: unknown; cobros: unknown; sin_pedido: unknown; sin_pedido_monto: unknown }>
    >(totalesSql, ...p([companyId])),
    prisma.$queryRawUnsafe<Array<{ product_name: string | null; cobros: unknown; monto: unknown }>>(
      porProductoSql,
      ...p([companyId]),
    ),
  ]);

  const t = totalesRows[0];
  const total = num(t?.total);
  const byProduct = productoRows.map((r) => {
    const nombre = (r.product_name ?? "").trim() || "Sin nombre";
    return {
      productKey: nombre,
      productName: nombre,
      cobros: numBI(r.cobros),
      monto: Math.round(num(r.monto) * 100) / 100,
    };
  });

  const sinPedidoMonto = num(t?.sin_pedido_monto);
  const atribuido = byProduct.reduce((s, r) => s + r.monto, 0);
  // Lo que queda tras quitar lo atribuido y lo que no tiene pedido: pedidos sin líneas de
  // producto. Se muestra aparte para que el desglose siempre cuadre con el total.
  const sinProductoMonto = Math.max(0, Math.round((total - atribuido - sinPedidoMonto) * 100) / 100);

  return {
    total: Math.round(total * 100) / 100,
    cobros: numBI(t?.cobros),
    sinPedido: numBI(t?.sin_pedido),
    sinPedidoMonto: Math.round(sinPedidoMonto * 100) / 100,
    sinProductoMonto,
    byProduct,
  };
}
