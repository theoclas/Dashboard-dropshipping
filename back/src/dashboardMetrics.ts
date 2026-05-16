import { Prisma, type PrismaClient } from "@prisma/client";

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
 *
 * Pedidos cuyo estado operativo / movimiento indica novedad logística (etiqueta naranja en la grilla de pedidos).
 */
const SQL_ES_NOVEDAD = `(
  UPPER(TRIM(COALESCE(p.estado_unificado,''))) = 'NOVEDAD'
  OR UPPER(COALESCE(p.estado_operativo,'')) LIKE '%NOVEDAD%'
  OR UPPER(COALESCE(p.ultimo_mov,'')) LIKE '%NOVEDAD%'
  OR UPPER(COALESCE(p.estatus_original,'')) LIKE '%NOVEDAD%'
)`;

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
  pedidos_cancelados: bigint | number;
  entregados: bigint | number;
  devoluciones: bigint | number;
  en_proceso: bigint | number;
  total_ventas: unknown;
  pedidos_cartera_sin_ok: bigint | number;
  pedidos_cartera_sin_ok_entregados: bigint | number;
  pedidos_cartera_ok_entregados: bigint | number;
  pedidos_cartera_ok_devoluciones: bigint | number;
  pedidos_novedad: bigint | number;
};

type FinRow = {
  ganancia_total_mov: unknown;
  ganancia_estimada_extra: unknown;
  ganancia_proyectada_transito: unknown;
};

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numBI(v: bigint | number): number {
  return typeof v === "bigint" ? Number(v) : Number(v ?? 0);
}

/** Si la migración `retiros_dropi` aún no está aplicada, no tumbar todo el dashboard. */
async function aggregateRetirosDropiSafe(
  prisma: PrismaClient,
  companyId: string,
  hasRange: boolean,
  start: Date | null,
  end: Date | null,
): Promise<{ _sum: { monto: unknown }; _count: { id: number } }> {
  try {
    return await prisma.dropiWithdrawal.aggregate({
      _sum: { monto: true },
      _count: { id: true },
      where: {
        companyId,
        ...(hasRange && start && end ? { fecha: { gte: start, lte: end } } : {}),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return { _sum: { monto: null }, _count: { id: 0 } };
    }
    throw e;
  }
}

export type DashboardMetricsPayload = {
  companyId: string;
  desde: string | null;
  hasta: string | null;
  totalOrders: number;
  totalGuias: number;
  productosVendidos: number;
  sinMapear: number;
  pedidosCancelados: number;
  pedidosCanceladosPct: number;
  entregados: number;
  entregadosPct: number;
  devoluciones: number;
  devolucionesPct: number;
  enProceso: number;
  enProcesoPct: number;
  totalVentas: number;
  gananciaTotal: number;
  gananciaEstimada: number;
  gananciaProyectada: number;
  cpaPromedio: number;
  totalCpaSpend: number;
  gastoOperacional: number;
  /** Suma de montos en retiros_dropi (import cartera: descripción retiro saldo) con fecha en el rango. */
  retirosDropiTotal: number;
  retirosDropiCount: number;
  pedidosCarteraSinOk: number;
  pedidosCarteraSinOkPct: number;
  pedidosCarteraSinOkEntregados: number;
  pedidosCarteraSinOkEntregadosPct: number;
  pedidosCarteraOkEntregados: number;
  pedidosCarteraOkEntregadosPct: number;
  pedidosCarteraOkDevoluciones: number;
  pedidosCarteraOkDevolucionesPct: number;
  pedidosNovedad: number;
  pedidosNovedadPct: number;
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
  SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) IN ('cancelado','rechazado') THEN 1 ELSE 0 END) AS pedidos_cancelados,
  SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) = 'entregado' THEN 1 ELSE 0 END) AS entregados,
  SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) = 'devolucion' THEN 1 ELSE 0 END) AS devoluciones,
  SUM(CASE WHEN (${SQL_ENTREGA_BUCKET}) = 'transito' THEN 1 ELSE 0 END) AS en_proceso,
  COALESCE(SUM(p.venta), 0) AS total_ventas,
  SUM(CASE
    WHEN (${SQL_ENTREGA_BUCKET}) = 'devolucion'
      AND UPPER(TRIM(COALESCE(p.estado_cartera,''))) <> 'OK'
    THEN 1 ELSE 0 END) AS pedidos_cartera_sin_ok,
  SUM(CASE
    WHEN (${SQL_ENTREGA_BUCKET}) = 'entregado'
      AND UPPER(TRIM(COALESCE(p.estado_cartera,''))) <> 'OK'
    THEN 1 ELSE 0 END) AS pedidos_cartera_sin_ok_entregados,
  SUM(CASE
    WHEN (${SQL_ENTREGA_BUCKET}) = 'entregado'
      AND UPPER(TRIM(COALESCE(p.estado_cartera,''))) = 'OK'
    THEN 1 ELSE 0 END) AS pedidos_cartera_ok_entregados,
  SUM(CASE
    WHEN (${SQL_ENTREGA_BUCKET}) = 'devolucion'
      AND UPPER(TRIM(COALESCE(p.estado_cartera,''))) = 'OK'
    THEN 1 ELSE 0 END) AS pedidos_cartera_ok_devoluciones,
  SUM(CASE WHEN (${SQL_ES_NOVEDAD}) THEN 1 ELSE 0 END) AS pedidos_novedad
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

  const finSql = `
SELECT
  (SELECT COALESCE(SUM(
        CASE
          WHEN UPPER(TRIM(COALESCE(wm.tipo,''))) = 'ENTRADA' THEN COALESCE(wm.monto, 0)
          ELSE -COALESCE(wm.monto, 0)
        END
      ), 0)
   FROM \`cartera_movimientos\` wm
   INNER JOIN \`pedidos\` p ON p.companyId = wm.companyId
     AND TRIM(COALESCE(wm.orden_id,'')) <> ''
     AND wm.orden_id = p.id_dropi
   WHERE wm.companyId = ?
     AND UPPER(TRIM(COALESCE(p.estado_cartera,''))) = 'OK'
     AND (${SQL_ENTREGA_BUCKET}) IN ('entregado','devolucion')
     ${whereDate}
  ) AS ganancia_total_mov,
  (SELECT COALESCE(SUM(
        CASE
          WHEN (${SQL_ENTREGA_BUCKET}) = 'entregado' AND UPPER(TRIM(COALESCE(p.estado_cartera,''))) <> 'OK'
          THEN COALESCE(p.ganancia_calc, 0)
          ELSE 0 END
      ), 0)
   FROM \`pedidos\` p WHERE p.companyId = ?
     ${whereDate}
  ) AS ganancia_estimada_extra,
  (SELECT COALESCE(SUM(
        CASE WHEN (${SQL_ENTREGA_BUCKET}) = 'transito' THEN COALESCE(p.ganancia_calc, 0) ELSE 0 END
      ), 0)
   FROM \`pedidos\` p WHERE p.companyId = ?
     ${whereDate}
  ) AS ganancia_proyectada_transito
`;

  const finParams: unknown[] = hasRange ? [companyId, start, end, companyId, start, end, companyId, start, end] : [companyId, companyId, companyId];

  const [aggRows, productRows, finRows, cpaSpend, cpaAvgRow, opExpenseAgg, retirosAgg] = await Promise.all([
    prisma.$queryRawUnsafe<AggRow[]>(aggSql, ...aggParams),
    prisma.$queryRawUnsafe<{ productos_vendidos: unknown }[]>(productSql, ...aggParams),
    prisma.$queryRawUnsafe<FinRow[]>(finSql, ...finParams),
    prisma.cpaRecord.aggregate({
      _sum: { gastoPublicidad: true },
      where: { companyId, ...cpaDateWhere(opts.desde, opts.hasta) },
    }),
    prisma.cpaRecord.aggregate({
      _avg: { cpa: true },
      where: { companyId, ...cpaDateWhere(opts.desde, opts.hasta) },
    }),
    prisma.operationalExpense.aggregate({
      _sum: { monto: true },
      where: {
        companyId,
        ...(hasRange && start && end ? { fecha: { gte: start, lte: end } } : {}),
      },
    }),
    aggregateRetirosDropiSafe(prisma, companyId, Boolean(hasRange && start && end), start, end),
  ]);

  const a = aggRows[0];
  const totalOrders = a ? numBI(a.total_orders) : 0;
  const totalGuias = a ? numBI(a.total_guias) : 0;
  const sinMapear = a ? numBI(a.sin_mapear) : 0;
  const pedidosCancelados = a ? numBI(a.pedidos_cancelados) : 0;
  const entregados = a ? numBI(a.entregados) : 0;
  const devoluciones = a ? numBI(a.devoluciones) : 0;
  const enProceso = a ? numBI(a.en_proceso) : 0;
  const totalVentas = a ? num(a.total_ventas) : 0;
  const fin = finRows[0];
  const gananciaTotal = fin ? num(fin.ganancia_total_mov) : 0;
  const gananciaEstimada = fin
    ? num(fin.ganancia_total_mov) + num(fin.ganancia_estimada_extra)
    : 0;
  const gananciaProyectada = fin
    ? num(fin.ganancia_total_mov) + num(fin.ganancia_estimada_extra) + num(fin.ganancia_proyectada_transito)
    : 0;
  const pedidosCarteraSinOk = a ? numBI(a.pedidos_cartera_sin_ok) : 0;
  const pedidosCarteraSinOkEntregados = a ? numBI(a.pedidos_cartera_sin_ok_entregados) : 0;
  const pedidosCarteraOkEntregados = a ? numBI(a.pedidos_cartera_ok_entregados) : 0;
  const pedidosCarteraOkDevoluciones = a ? numBI(a.pedidos_cartera_ok_devoluciones) : 0;
  const pedidosNovedad = a ? numBI(a.pedidos_novedad) : 0;

  const productosVendidos = productRows[0] ? num(productRows[0].productos_vendidos) : 0;

  const totalCpaSpend = Number(cpaSpend._sum.gastoPublicidad ?? 0);
  const cpaAvg = cpaAvgRow._avg.cpa != null ? Number(cpaAvgRow._avg.cpa) : 0;
  const gastoOperacional = Number(opExpenseAgg._sum.monto ?? 0);
  const retirosDropiTotal = Number(retirosAgg._sum.monto ?? 0);
  const retirosDropiCount = retirosAgg._count.id;

  const safeDiv = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

  return {
    companyId,
    desde: opts.desde && opts.hasta ? opts.desde : null,
    hasta: opts.desde && opts.hasta ? opts.hasta : null,
    totalOrders,
    totalGuias,
    productosVendidos,
    sinMapear,
    pedidosCancelados,
    pedidosCanceladosPct: safeDiv(pedidosCancelados, totalOrders),
    entregados,
    entregadosPct: safeDiv(entregados, totalOrders),
    devoluciones,
    devolucionesPct: safeDiv(devoluciones, totalOrders),
    enProceso,
    enProcesoPct: safeDiv(enProceso, totalOrders),
    totalVentas,
    gananciaTotal,
    gananciaEstimada,
    gananciaProyectada,
    cpaPromedio: cpaAvg,
    totalCpaSpend,
    gastoOperacional,
    retirosDropiTotal,
    retirosDropiCount,
    pedidosCarteraSinOk,
    pedidosCarteraSinOkPct: safeDiv(pedidosCarteraSinOk, totalOrders),
    pedidosCarteraSinOkEntregados,
    pedidosCarteraSinOkEntregadosPct: safeDiv(pedidosCarteraSinOkEntregados, totalOrders),
    pedidosCarteraOkEntregados,
    pedidosCarteraOkEntregadosPct: safeDiv(pedidosCarteraOkEntregados, totalOrders),
    pedidosCarteraOkDevoluciones,
    pedidosCarteraOkDevolucionesPct: safeDiv(pedidosCarteraOkDevoluciones, totalOrders),
    pedidosNovedad,
    pedidosNovedadPct: safeDiv(pedidosNovedad, totalOrders),
  };
}
