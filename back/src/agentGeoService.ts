import type { PrismaClient } from "@prisma/client";
import { dropiVariantKey, mapVariantKeysToCatalogLinks } from "./catalogProductService";
import { SQL_ENTREGA_BUCKET } from "./dashboardEntregaByProduct";

/**
 * Entregas y devoluciones por departamento o ciudad, opcionalmente de un solo producto.
 *
 * Existe `queryComparativaGeografica` en `reportesLogistica`, pero agrupa por transportadora y
 * no filtra por producto. Para decidir qué ciudades excluir de la segmentación de un producto
 * concreto hace falta esto: la tasa de devolución de ESE producto en ESA ciudad, con la plata
 * que se pierde ahí.
 */

export type GeoDimension = "departamento" | "ciudad";

export type GeoRow = {
  ubicacion: string;
  /** Pedidos activos (sin cancelados ni rechazados). */
  pedidos: number;
  entregados: number;
  devueltos: number;
  enTransito: number;
  pctEntrega: number;
  pctDevolucion: number;
  /** Cuánto falta por resolver: si es alto, los porcentajes aún no son concluyentes. */
  pctPendiente: number;
  gananciaEntregados: number;
  perdidaDevoluciones: number;
  /** gananciaEntregados − perdidaDevoluciones. */
  gananciaNeta: number;
  /** gananciaNeta ÷ pedidos: el CPA máximo que tolera esa ubicación. */
  gananciaPorPedido: number;
};

export type GeoResult = {
  dimension: GeoDimension;
  desde?: string;
  hasta?: string;
  catalogProductId?: string;
  totales: Omit<GeoRow, "ubicacion">;
  rows: GeoRow[];
  notas: string[];
};

type LineRow = {
  pedido_id_dropi: string;
  bucket: string;
  ubicacion: string | null;
  ganancia_calc: unknown;
  costo_devolucion_estimado: unknown;
  producto_id: string | null;
  sku: string | null;
  variacion_id: string | null;
  variacion: string | null;
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

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function queryEntregasPorUbicacion(
  prisma: PrismaClient,
  companyId: string,
  opts: {
    dimension: GeoDimension;
    desde?: string;
    hasta?: string;
    catalogProductId?: string;
    /** Ubicaciones con menos pedidos que esto no se devuelven: son ruido. */
    minPedidos?: number;
  },
): Promise<GeoResult> {
  const dr = parseDateRange(opts.desde, opts.hasta);
  const geoCol = opts.dimension === "ciudad" ? "p.ciudad" : "p.departamento";
  const minPedidos = Math.max(1, Math.floor(opts.minPedidos ?? 5));

  const sql = `
SELECT
  TRIM(p.id_dropi) AS pedido_id_dropi,
  (${SQL_ENTREGA_BUCKET}) AS bucket,
  UPPER(TRIM(${geoCol})) AS ubicacion,
  p.ganancia_calc,
  p.costo_devolucion_estimado,
  pd.producto_id,
  pd.sku,
  pd.variacion_id,
  pd.variacion
FROM pedidos p
INNER JOIN productos_detalle pd
  ON pd.companyId = p.companyId AND pd.pedido_id_dropi = p.id_dropi
WHERE p.companyId = ?
  AND ${geoCol} IS NOT NULL AND TRIM(${geoCol}) <> ''
  ${dr ? "AND p.fecha >= ? AND p.fecha <= ?" : ""}
`;

  const args: unknown[] = [companyId];
  if (dr) args.push(dr.start, dr.end);

  const lines = await prisma.$queryRawUnsafe<LineRow[]>(sql, ...args);

  // Filtrar al producto pedido, si se pasó uno.
  let relevantes = lines;
  if (opts.catalogProductId) {
    const keys = lines.map((l) =>
      dropiVariantKey({
        productoId: l.producto_id,
        sku: l.sku,
        variacionId: l.variacion_id,
        variacion: l.variacion,
      }),
    );
    const catalogByKey = await mapVariantKeysToCatalogLinks(companyId, keys);
    relevantes = lines.filter(
      (_l, i) => catalogByKey.get(keys[i]!)?.catalogProductId === opts.catalogProductId,
    );
  }

  type Acc = {
    activos: Set<string>;
    entregados: Set<string>;
    devueltos: Set<string>;
    transito: Set<string>;
    gananciaEntregados: number;
    perdidaDevoluciones: number;
  };
  const porUbicacion = new Map<string, Acc>();
  // Un pedido puede tener varias líneas: la plata se cuenta una sola vez.
  const pedidosContados = new Set<string>();

  for (const l of relevantes) {
    const ubi = l.ubicacion?.trim();
    if (!ubi) continue;
    if (l.bucket === "cancelado" || l.bucket === "rechazado") continue;

    let acc = porUbicacion.get(ubi);
    if (!acc) {
      acc = {
        activos: new Set(),
        entregados: new Set(),
        devueltos: new Set(),
        transito: new Set(),
        gananciaEntregados: 0,
        perdidaDevoluciones: 0,
      };
      porUbicacion.set(ubi, acc);
    }

    acc.activos.add(l.pedido_id_dropi);
    if (l.bucket === "entregado") acc.entregados.add(l.pedido_id_dropi);
    if (l.bucket === "devolucion") acc.devueltos.add(l.pedido_id_dropi);
    if (l.bucket === "transito") acc.transito.add(l.pedido_id_dropi);

    const claveDinero = `${ubi}|${l.pedido_id_dropi}`;
    if (!pedidosContados.has(claveDinero)) {
      pedidosContados.add(claveDinero);
      if (l.bucket === "entregado") acc.gananciaEntregados += num(l.ganancia_calc);
      if (l.bucket === "devolucion") acc.perdidaDevoluciones += Math.abs(num(l.costo_devolucion_estimado));
    }
  }

  const rows: GeoRow[] = [];
  for (const [ubicacion, a] of porUbicacion.entries()) {
    const pedidos = a.activos.size;
    if (pedidos < minPedidos) continue;
    const gananciaNeta = a.gananciaEntregados - a.perdidaDevoluciones;
    rows.push({
      ubicacion,
      pedidos,
      entregados: a.entregados.size,
      devueltos: a.devueltos.size,
      enTransito: a.transito.size,
      pctEntrega: pct(a.entregados.size, pedidos),
      pctDevolucion: pct(a.devueltos.size, pedidos),
      pctPendiente: pct(a.transito.size, pedidos),
      gananciaEntregados: round2(a.gananciaEntregados),
      perdidaDevoluciones: round2(a.perdidaDevoluciones),
      gananciaNeta: round2(gananciaNeta),
      gananciaPorPedido: round2(gananciaNeta / pedidos),
    });
  }

  rows.sort((a, b) => b.pedidos - a.pedidos);

  const t = rows.reduce(
    (acc, r) => ({
      pedidos: acc.pedidos + r.pedidos,
      entregados: acc.entregados + r.entregados,
      devueltos: acc.devueltos + r.devueltos,
      enTransito: acc.enTransito + r.enTransito,
      gananciaEntregados: acc.gananciaEntregados + r.gananciaEntregados,
      perdidaDevoluciones: acc.perdidaDevoluciones + r.perdidaDevoluciones,
    }),
    { pedidos: 0, entregados: 0, devueltos: 0, enTransito: 0, gananciaEntregados: 0, perdidaDevoluciones: 0 },
  );
  const netoTotal = t.gananciaEntregados - t.perdidaDevoluciones;

  return {
    dimension: opts.dimension,
    ...(opts.desde ? { desde: opts.desde } : {}),
    ...(opts.hasta ? { hasta: opts.hasta } : {}),
    ...(opts.catalogProductId ? { catalogProductId: opts.catalogProductId } : {}),
    totales: {
      pedidos: t.pedidos,
      entregados: t.entregados,
      devueltos: t.devueltos,
      enTransito: t.enTransito,
      pctEntrega: pct(t.entregados, t.pedidos),
      pctDevolucion: pct(t.devueltos, t.pedidos),
      pctPendiente: pct(t.enTransito, t.pedidos),
      gananciaEntregados: round2(t.gananciaEntregados),
      perdidaDevoluciones: round2(t.perdidaDevoluciones),
      gananciaNeta: round2(netoTotal),
      gananciaPorPedido: t.pedidos > 0 ? round2(netoTotal / t.pedidos) : 0,
    },
    rows,
    notas: [
      `Se omiten ubicaciones con menos de ${minPedidos} pedidos: con menos que eso el porcentaje es ruido.`,
      "El rango filtra por fecha del PEDIDO, no de entrega. Mira `pctPendiente`: si es alto, esos pedidos aún están en tránsito y los porcentajes van a cambiar.",
      "`gananciaPorPedido` es el CPA máximo que tolera esa ubicación: pagar más que eso por un pedido de ahí es perder plata.",
      "Cancelados y rechazados quedan fuera de todos los conteos.",
    ],
  };
}
