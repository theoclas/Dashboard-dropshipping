import type { Prisma } from "@prisma/client";
import {
  clasificarSalidaCartera,
  resolveOrdenIdForSalida,
  type CarteraSalidaCategoria,
} from "./carteraSalidaClassification";
import { prisma } from "./prisma";

function parseFilterDate(ymd: string | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00.000Z`);
}

function fechaRangeFilter(desde: Date | null, hasta: Date | null): Prisma.DateTimeFilter | undefined {
  if (!desde && !hasta) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (desde) {
    f.gte = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate(), 0, 0, 0, 0));
  }
  if (hasta) {
    f.lte = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate(), 23, 59, 59, 999));
  }
  return f.gte !== undefined || f.lte !== undefined ? f : undefined;
}

export type CarteraSalidaListItem = {
  movementId: string;
  fecha: string | null;
  monto: number | null;
  montoPrevio: number | null;
  descripcion: string | null;
  conceptoRetiro: string | null;
  numeroGuia: string | null;
  categoria: CarteraSalidaCategoria;
  ordenId: string | null;
  pedido: {
    externalOrderId: string;
    estadoUnificado: string | null;
    estadoOperativo: string | null;
    fecha: string | null;
  } | null;
  productos: Array<{ nombre: string; cantidad: number }>;
};

export type CarteraSalidasSummary = {
  totalMonto: number;
  count: number;
  byCategoria: Record<CarteraSalidaCategoria, { count: number; totalMonto: number }>;
};

export async function listCarteraSalidas(
  companyId: string,
  opts?: {
    desde?: string;
    hasta?: string;
    categoria?: CarteraSalidaCategoria;
  },
): Promise<{ items: CarteraSalidaListItem[]; summary: CarteraSalidasSummary }> {
  const d0 = parseFilterDate(opts?.desde);
  const h0 = parseFilterDate(opts?.hasta);
  const fe = fechaRangeFilter(d0, h0);

  const where: Prisma.WalletMovementWhereInput = { companyId };
  if (fe) where.fecha = fe;

  const rows = await prisma.walletMovement.findMany({
    where,
    orderBy: [{ fecha: "desc" }, { legacyId: "desc" }],
  });

  const salidas = rows
    .map((r) => {
      const categoria = clasificarSalidaCartera({
        tipo: r.tipo,
        descripcion: r.descripcion,
        ordenId: r.ordenId,
      });
      if (!categoria) return null;
      const ordenId = resolveOrdenIdForSalida({ ordenId: r.ordenId, descripcion: r.descripcion });
      return {
        row: r,
        categoria,
        ordenId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const filtered =
    opts?.categoria != null ? salidas.filter((s) => s.categoria === opts.categoria) : salidas;

  const ordenIds = [...new Set(filtered.map((s) => s.ordenId).filter((id): id is string => !!id))];
  const [pedidos, productos] = await Promise.all([
    ordenIds.length > 0
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
    ordenIds.length > 0
      ? prisma.productDetail.findMany({
          where: { companyId, pedidoIdDropi: { in: ordenIds } },
          select: { pedidoIdDropi: true, productoNombre: true, cantidad: true },
        })
      : [],
  ]);
  const pedidoByOrden = new Map(pedidos.map((p) => [p.externalOrderId, p]));
  const productosByPedido = new Map<string, Array<{ nombre: string; cantidad: number }>>();
  for (const producto of productos) {
    const list = productosByPedido.get(producto.pedidoIdDropi) ?? [];
    list.push({
      nombre: producto.productoNombre?.trim() || "Sin producto",
      cantidad: producto.cantidad ?? 1,
    });
    productosByPedido.set(producto.pedidoIdDropi, list);
  }

  const byCategoria: CarteraSalidasSummary["byCategoria"] = {
    pedido: { count: 0, totalMonto: 0 },
    retiro: { count: 0, totalMonto: 0 },
    recarga_tarjeta: { count: 0, totalMonto: 0 },
    otro: { count: 0, totalMonto: 0 },
  };

  let totalMonto = 0;

  const items: CarteraSalidaListItem[] = filtered.map(({ row, categoria, ordenId }) => {
    const monto = row.monto != null ? Number(row.monto) : null;
    const absMonto = monto != null ? Math.abs(monto) : 0;
    totalMonto += absMonto;
    byCategoria[categoria].count += 1;
    byCategoria[categoria].totalMonto += absMonto;

    const ped = ordenId ? pedidoByOrden.get(ordenId) : undefined;

    return {
      movementId: String(row.legacyId),
      fecha: row.fecha?.toISOString() ?? null,
      monto,
      montoPrevio: row.montoPrevio != null ? Number(row.montoPrevio) : null,
      descripcion: row.descripcion,
      conceptoRetiro: row.conceptoRetiro,
      numeroGuia: row.numeroGuia,
      categoria,
      ordenId,
      productos: ordenId ? productosByPedido.get(ordenId) ?? [] : [],
      pedido: ped
        ? {
            externalOrderId: ped.externalOrderId,
            estadoUnificado: ped.estadoUnificado,
            estadoOperativo: ped.estadoOperativo,
            fecha: ped.fecha?.toISOString() ?? null,
          }
        : null,
    };
  });

  return {
    items,
    summary: {
      totalMonto,
      count: items.length,
      byCategoria,
    },
  };
}
