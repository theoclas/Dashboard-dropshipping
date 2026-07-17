import type { Prisma } from "@prisma/client";
import {
  clasificarEntradaCartera,
  resolveOrdenIdForEntrada,
  type CarteraEntradaCategoria,
} from "./carteraEntradaClassification";
import { prisma } from "./prisma";

function parseFilterDate(ymd: string | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00.000Z`);
}

function fechaRangeFilter(desde: Date | null, hasta: Date | null): Prisma.DateTimeFilter | undefined {
  if (!desde && !hasta) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (desde) f.gte = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  if (hasta) f.lte = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate(), 23, 59, 59, 999));
  return f;
}

export async function listCarteraEntradas(
  companyId: string,
  opts?: { desde?: string; hasta?: string; categoria?: CarteraEntradaCategoria },
) {
  const fecha = fechaRangeFilter(parseFilterDate(opts?.desde), parseFilterDate(opts?.hasta));
  const rows = await prisma.walletMovement.findMany({
    where: { companyId, ...(fecha ? { fecha } : {}) },
    orderBy: [{ fecha: "desc" }, { legacyId: "desc" }],
  });

  const entradas = rows
    .map((row) => {
      const categoria = clasificarEntradaCartera(row);
      if (!categoria) return null;
      return { row, categoria, ordenId: resolveOrdenIdForEntrada(row) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((x) => !opts?.categoria || x.categoria === opts.categoria);

  const ordenIds = [...new Set(entradas.map((e) => e.ordenId).filter((id): id is string => Boolean(id)))];
  const [pedidos, productos] = await Promise.all([
    ordenIds.length
      ? prisma.order.findMany({
          where: { companyId, externalOrderId: { in: ordenIds } },
          select: {
            externalOrderId: true,
            estadoUnificado: true,
            estadoOperativo: true,
            fecha: true,
          },
        })
      : [],
    ordenIds.length
      ? prisma.productDetail.findMany({
          where: { companyId, pedidoIdDropi: { in: ordenIds } },
          select: { pedidoIdDropi: true, productoNombre: true, cantidad: true },
        })
      : [],
  ]);

  const pedidoById = new Map(pedidos.map((p) => [p.externalOrderId, p]));
  const productosByPedido = new Map<string, Array<{ nombre: string; cantidad: number }>>();
  for (const p of productos) {
    const list = productosByPedido.get(p.pedidoIdDropi) ?? [];
    list.push({ nombre: p.productoNombre?.trim() || "Sin producto", cantidad: p.cantidad ?? 1 });
    productosByPedido.set(p.pedidoIdDropi, list);
  }

  const byCategoria: Record<CarteraEntradaCategoria, { count: number; totalMonto: number }> = {
    pedido: { count: 0, totalMonto: 0 },
    otro: { count: 0, totalMonto: 0 },
  };
  let totalMonto = 0;

  const items = entradas.map(({ row, categoria, ordenId }) => {
    const monto = row.monto == null ? null : Number(row.monto);
    const absMonto = Math.abs(monto ?? 0);
    totalMonto += absMonto;
    byCategoria[categoria].count += 1;
    byCategoria[categoria].totalMonto += absMonto;
    const pedido = ordenId ? pedidoById.get(ordenId) : undefined;
    return {
      movementId: String(row.legacyId),
      fecha: row.fecha?.toISOString() ?? null,
      monto,
      montoPrevio: row.montoPrevio == null ? null : Number(row.montoPrevio),
      descripcion: row.descripcion,
      numeroGuia: row.numeroGuia,
      categoria,
      ordenId,
      productos: ordenId ? productosByPedido.get(ordenId) ?? [] : [],
      pedido: pedido
        ? {
            externalOrderId: pedido.externalOrderId,
            estadoUnificado: pedido.estadoUnificado,
            estadoOperativo: pedido.estadoOperativo,
            fecha: pedido.fecha?.toISOString() ?? null,
          }
        : null,
    };
  });

  return { items, summary: { totalMonto, count: items.length, byCategoria } };
}
