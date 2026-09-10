import type { PrismaClient } from "@prisma/client";

/**
 * Pedidos agregados para la API del agente.
 *
 * Los datos ya estaban en `pedidos`: transportadora, estado, fletes, costo de devolución y
 * días desde el último movimiento. Nunca se habían podido consultar, y responden preguntas
 * que el CPA no puede — si una transportadora entrega al 65% y otra al 85%, eso mueve más
 * plata que cualquier ajuste de puja.
 *
 * **Solo agregados.** Ni teléfono, ni dirección, ni nombre, ni correo: esta superficie no
 * existe para mirar pedidos, existe para contarlos.
 */

export type OrdersDimension = "transportadora" | "estado" | "departamento" | "dias_transito";

export type OrdersBreakdownRow = {
  clave: string;
  pedidos: number;
  entregados: number;
  devueltos: number;
  enTransito: number;
  pctEntrega: number | null;
  pctDevolucion: number | null;
  /** Entrega sobre pedidos ya RESUELTOS. La única no sesgada por los que siguen en camino. */
  pctEntregaResueltos: number | null;
  venta: number;
  flete: number;
  costoProveedor: number;
  costoDevoluciones: number;
  /** venta − flete − costo de proveedor − costo de las devoluciones. Sin publicidad. */
  margenBruto: number;
  margenPorPedido: number | null;
  /**
   * Mediana de días de tránsito: del pedido hasta su último movimiento, solo de los ya
   * resueltos. En contra entrega un tramo lento suele traer más devoluciones.
   */
  diasHastaResolver: number | null;
};

const COLUMNA: Record<OrdersDimension, string> = {
  transportadora: "transportadora",
  estado: "estado_unificado",
  departamento: "departamento",
  dias_transito: "dias_desde_ult_mov",
};

/** Cómo se reconoce un estado final en `estado_unificado`. */
function clasificar(estado: string | null): "entregado" | "devuelto" | "transito" {
  const e = (estado ?? "").toUpperCase();
  if (e.includes("ENTREG")) return "entregado";
  if (e.includes("DEVU") || e.includes("RECHAZ") || e.includes("CANCEL")) return "devuelto";
  return "transito";
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function redondear(n: number | null, d = 2): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Agrupa los días de tránsito en tramos, que es como se leen: exacto no dice nada. */
function tramoDias(dias: number | null): string {
  if (dias === null) return "sin dato";
  if (dias <= 2) return "0-2 días";
  if (dias <= 5) return "3-5 días";
  if (dias <= 8) return "6-8 días";
  if (dias <= 15) return "9-15 días";
  return "más de 15 días";
}

export async function queryOrdersBreakdown(
  prisma: PrismaClient,
  companyId: string,
  opts: {
    dimension: OrdersDimension;
    desde?: string;
    hasta?: string;
    /** Descarta grupos con pocos pedidos: un 100% sobre 2 pedidos no significa nada. */
    minPedidos?: number;
  },
): Promise<{ dimension: OrdersDimension; rows: OrdersBreakdownRow[]; totales: OrdersBreakdownRow; notas: string[] }> {
  const where: Record<string, unknown> = { companyId };
  if (opts.desde || opts.hasta) {
    const fecha: Record<string, Date> = {};
    if (opts.desde) fecha.gte = new Date(`${opts.desde}T00:00:00.000Z`);
    if (opts.hasta) fecha.lte = new Date(`${opts.hasta}T23:59:59.999Z`);
    where.fecha = fecha;
  }

  const pedidos = await prisma.order.findMany({
    where,
    select: {
      transportadora: true,
      estadoUnificado: true,
      departamento: true,
      // El tránsito se calcula con estas dos, NO con `diasDesdeUltMov`: ese campo cuenta
      // días desde el último movimiento hasta HOY, así que en pedidos viejos vale 60 o 90
      // y no tiene nada que ver con lo que tardó en llegar.
      fecha: true,
      fechaUltMov: true,
      venta: true,
      flete: true,
      costoProveedor: true,
      costoDevolucionEstimado: true,
    },
  });

  type Acc = {
    pedidos: number;
    entregados: number;
    devueltos: number;
    enTransito: number;
    venta: number;
    flete: number;
    costoProveedor: number;
    costoDevoluciones: number;
    diasResueltos: number[];
  };
  const vacio = (): Acc => ({
    pedidos: 0,
    entregados: 0,
    devueltos: 0,
    enTransito: 0,
    venta: 0,
    flete: 0,
    costoProveedor: 0,
    costoDevoluciones: 0,
    diasResueltos: [],
  });

  const grupos = new Map<string, Acc>();
  const total = vacio();

  for (const p of pedidos) {
    // Días reales de tránsito: del pedido hasta su último movimiento. Solo tiene sentido en
    // pedidos ya resueltos; en los que siguen en camino el último movimiento es intermedio.
    const transito =
      p.fecha && p.fechaUltMov
        ? Math.max(0, Math.round((p.fechaUltMov.getTime() - p.fecha.getTime()) / 86_400_000))
        : null;

    let clave: string;
    if (opts.dimension === "transportadora") clave = p.transportadora?.trim() || "sin transportadora";
    else if (opts.dimension === "estado") clave = p.estadoUnificado?.trim() || "sin estado";
    else if (opts.dimension === "departamento") clave = p.departamento?.trim() || "sin departamento";
    else clave = tramoDias(transito);

    const tipo = clasificar(p.estadoUnificado);
    for (const acc of [grupos.get(clave) ?? grupos.set(clave, vacio()).get(clave)!, total]) {
      acc.pedidos += 1;
      if (tipo === "entregado") acc.entregados += 1;
      else if (tipo === "devuelto") acc.devueltos += 1;
      else acc.enTransito += 1;

      acc.venta += num(p.venta);
      acc.flete += num(p.flete);
      acc.costoProveedor += num(p.costoProveedor);
      // El costo de devolución solo se cobra si el pedido efectivamente se devolvió.
      if (tipo === "devuelto") acc.costoDevoluciones += num(p.costoDevolucionEstimado);
      if (tipo !== "transito" && transito !== null) acc.diasResueltos.push(transito);
    }
  }

  const aFila = (clave: string, a: Acc): OrdersBreakdownRow => {
    const resueltos = a.entregados + a.devueltos;
    const margen = a.venta - a.flete - a.costoProveedor - a.costoDevoluciones;
    return {
      clave,
      pedidos: a.pedidos,
      entregados: a.entregados,
      devueltos: a.devueltos,
      enTransito: a.enTransito,
      pctEntrega: a.pedidos > 0 ? redondear((a.entregados / a.pedidos) * 100) : null,
      pctDevolucion: a.pedidos > 0 ? redondear((a.devueltos / a.pedidos) * 100) : null,
      pctEntregaResueltos: resueltos > 0 ? redondear((a.entregados / resueltos) * 100) : null,
      venta: redondear(a.venta)!,
      flete: redondear(a.flete)!,
      costoProveedor: redondear(a.costoProveedor)!,
      costoDevoluciones: redondear(a.costoDevoluciones)!,
      margenBruto: redondear(margen)!,
      margenPorPedido: a.pedidos > 0 ? redondear(margen / a.pedidos) : null,
      diasHastaResolver: redondear(mediana(a.diasResueltos), 1),
    };
  };

  const min = opts.minPedidos ?? 0;
  const rows = [...grupos.entries()]
    .map(([k, a]) => aFila(k, a))
    .filter((r) => r.pedidos >= min)
    .sort((a, b) => b.pedidos - a.pedidos);

  return {
    dimension: opts.dimension,
    rows,
    totales: aFila("TOTAL", total),
    notas: [
      "El rango filtra por fecha del PEDIDO, no de la entrega. Los pedidos recientes siguen en tránsito, así que `pctEntrega` sale artificialmente bajo. Para comparar grupos usa `pctEntregaResueltos`, que solo mira los ya resueltos.",
      "`margenBruto` es venta menos flete, costo de proveedor y costo de las devoluciones. NO descuenta publicidad: eso está en /api/agent/cpa/daily.",
      "`diasHastaResolver` es la mediana de días entre la fecha del pedido y la de su último movimiento, solo de los ya resueltos. NO usa `dias_desde_ult_mov`, que cuenta desde el último movimiento hasta hoy y en pedidos viejos vale 60 o 90 días sin decir nada del tránsito.",
      "Los estados se clasifican por texto de `estado_unificado`: ENTREG… cuenta como entregado; DEVU…, RECHAZ… y CANCEL… como devuelto; el resto, en tránsito.",
    ],
  };
}
