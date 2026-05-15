import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

function parseYmd(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00.000Z`);
}

function cpaDateWhere(desde?: string, hasta?: string): Prisma.CpaRecordWhereInput {
  const d0 = parseYmd(desde);
  const h0 = parseYmd(hasta);
  if (!d0 || !h0) return {};
  const start = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(h0.getUTCFullYear(), h0.getUTCMonth(), h0.getUTCDate(), 23, 59, 59, 999));
  return { fecha: { gte: start, lte: end } };
}

/**
 * Bucket por fila en MySQL (misma idea que reportes logística + columnas Dropi).
 * Usa TRIM/UPPER para coincidir con lo que muestra la grilla aunque venga con espacios o collation rara.
 */
const SQL_ENTREGA_BUCKET = `(CASE
  WHEN LOWER(COALESCE(p.estado_unificado,'')) LIKE '%cancel%' OR LOWER(COALESCE(p.estado_operativo,'')) LIKE '%cancel%' THEN 'cancelado'
  WHEN LOWER(COALESCE(p.estado_unificado,'')) LIKE '%rechaz%' OR LOWER(COALESCE(p.estado_operativo,'')) LIKE '%rechaz%' THEN 'rechazado'
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

type AggRow = {
  total_orders: bigint | number;
  total_guias: bigint | number;
  sin_mapear: bigint | number;
  entregados: bigint | number;
  devoluciones: bigint | number;
  en_proceso: bigint | number;
  total_ventas: unknown;
  ganancia_total: unknown;
  ganancia_proyectada: unknown;
};

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numBI(v: bigint | number): number {
  return typeof v === "bigint" ? Number(v) : Number(v ?? 0);
}

export type DashboardMetricsPayload = {
  companyId: string;
  desde: string | null;
  hasta: string | null;
  totalOrders: number;
  totalGuias: number;
  productosVendidos: number;
  sinMapear: number;
  entregados: number;
  entregadosPct: number;
  devoluciones: number;
  devolucionesPct: number;
  enProceso: number;
  enProcesoPct: number;
  totalVentas: number;
  gananciaTotal: number;
  gananciaProyectada: number;
  cpaPromedio: number;
  totalCpaSpend: number;
};

export async function getDashboardMetrics(
  prisma: PrismaClient,
  companyId: string,
  opts: { desde?: string; hasta?: string },
): Promise<DashboardMetricsPayload> {
  const d0 = parseYmd(opts.desde);
  const h0 = parseYmd(opts.hasta);
  const hasRange = Boolean(d0 && h0);
  const start = hasRange
    ? new Date(Date.UTC(d0!.getUTCFullYear(), d0!.getUTCMonth(), d0!.getUTCDate(), 0, 0, 0, 0))
    : null;
  const end = hasRange
    ? new Date(Date.UTC(h0!.getUTCFullYear(), h0!.getUTCMonth(), h0!.getUTCDate(), 23, 59, 59, 999))
    : null;

  const whereDate = hasRange ? `AND p.fecha >= ? AND p.fecha <= ?` : "";
  const aggParams: unknown[] = hasRange ? [companyId, start, end] : [companyId];

  const aggSql = `
SELECT
  COUNT(*) AS total_orders,
  SUM(CASE WHEN p.guia IS NOT NULL AND TRIM(COALESCE(p.guia,'')) <> '' THEN 1 ELSE 0 END) AS total_guias,
  SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) = 'sin_mapear' THEN 1 ELSE 0 END) AS sin_mapear,
  SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) = 'entregado' THEN 1 ELSE 0 END) AS entregados,
  SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) = 'devolucion' THEN 1 ELSE 0 END) AS devoluciones,
  SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) IN ('cancelado','rechazado','transito') THEN 1 ELSE 0 END) AS en_proceso,
  COALESCE(SUM(p.venta), 0) AS total_ventas,
  COALESCE(SUM(
    CASE
      WHEN (${SQL_ENTREGA_BUCKET}) IN ('entregado','devolucion')
        AND TRIM(COALESCE(p.estado_cartera,'')) = 'OK'
        THEN COALESCE(p.cartera_aplicada, 0)
      WHEN (${SQL_ENTREGA_BUCKET}) = 'entregado'
        THEN COALESCE(p.cartera, p.ganancia_calc, 0)
      WHEN (${SQL_ENTREGA_BUCKET}) = 'devolucion'
        THEN COALESCE(p.cartera, p.costo_devolucion_estimado, 0)
      ELSE 0
    END
  ), 0) AS ganancia_total,
  COALESCE(SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) IN ('cancelado','rechazado','transito') THEN p.ganancia_calc ELSE 0 END), 0) AS ganancia_proyectada
FROM pedidos p
WHERE p.companyId = ?
${whereDate}
`;

  const productSql = `
SELECT COALESCE(SUM(pd.cantidad), 0) AS productos_vendidos
FROM productos_detalle pd
INNER JOIN pedidos p ON p.companyId = pd.companyId AND p.id_dropi = pd.pedido_id_dropi
WHERE p.companyId = ?
${whereDate}
`;

  const [aggRows, productRows, cpaSpend, cpaAvgRow] = await Promise.all([
    prisma.$queryRawUnsafe<AggRow[]>(aggSql, ...aggParams),
    prisma.$queryRawUnsafe<{ productos_vendidos: unknown }[]>(productSql, ...aggParams),
    prisma.cpaRecord.aggregate({
      _sum: { gastoPublicidad: true },
      where: { companyId, ...cpaDateWhere(opts.desde, opts.hasta) },
    }),
    prisma.cpaRecord.aggregate({
      _avg: { cpa: true },
      where: { companyId, ...cpaDateWhere(opts.desde, opts.hasta) },
    }),
  ]);

  const a = aggRows[0];
  const totalOrders = a ? numBI(a.total_orders) : 0;
  const totalGuias = a ? numBI(a.total_guias) : 0;
  const sinMapear = a ? numBI(a.sin_mapear) : 0;
  const entregados = a ? numBI(a.entregados) : 0;
  const devoluciones = a ? numBI(a.devoluciones) : 0;
  const enProceso = a ? numBI(a.en_proceso) : 0;
  const totalVentas = a ? num(a.total_ventas) : 0;
  const gananciaTotal = a ? num(a.ganancia_total) : 0;
  const gananciaProyectada = a ? num(a.ganancia_proyectada) : 0;

  const productosVendidos = productRows[0] ? num(productRows[0].productos_vendidos) : 0;

  const totalCpaSpend = Number(cpaSpend._sum.gastoPublicidad ?? 0);
  const cpaAvg = cpaAvgRow._avg.cpa != null ? Number(cpaAvgRow._avg.cpa) : 0;

  const safeDiv = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

  return {
    companyId,
    desde: opts.desde && opts.hasta ? opts.desde : null,
    hasta: opts.desde && opts.hasta ? opts.hasta : null,
    totalOrders,
    totalGuias,
    productosVendidos,
    sinMapear,
    entregados,
    entregadosPct: safeDiv(entregados, totalOrders),
    devoluciones,
    devolucionesPct: safeDiv(devoluciones, totalOrders),
    enProceso,
    enProcesoPct: safeDiv(enProceso, totalOrders),
    totalVentas,
    gananciaTotal,
    gananciaProyectada,
    cpaPromedio: cpaAvg,
    totalCpaSpend,
  };
}
