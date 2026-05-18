import { ImportBatchKind, Prisma, type PrismaClient } from "@prisma/client";
import type { ImportBatchPayload } from "./importBatchTypes";
import {
  isCarteraPayload,
  isPedidosPayload,
  isProductosPayload,
  type OrderSnapshot,
} from "./importBatchTypes";

const BATCH_TX_OPTIONS = { maxWait: 60_000, timeout: 300_000 } as const;

export async function createImportBatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    kind: ImportBatchKind;
    fileName?: string | null;
    userId?: string | null;
    imported: number;
    payload: ImportBatchPayload;
  },
) {
  return prisma.importBatch.create({
    data: {
      companyId: input.companyId,
      kind: input.kind,
      fileName: input.fileName?.slice(0, 255) ?? null,
      userId: input.userId ?? null,
      imported: input.imported,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}

export async function listImportBatches(prisma: PrismaClient, companyId: string, limit = 30) {
  return prisma.importBatch.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

function decOrNull(v: string | null | undefined) {
  return v != null && v !== "" ? new Prisma.Decimal(v) : null;
}

function snapshotToOrderUpdate(s: OrderSnapshot): Prisma.OrderUpdateInput {
  return {
    fecha: s.fecha ? new Date(s.fecha) : null,
    cliente: s.cliente,
    transportadora: s.transportadora,
    estadoOperativo: s.estadoOperativo,
    guia: s.guia,
    departamento: s.departamento,
    ciudad: s.ciudad,
    direccion: s.direccion,
    telefono: s.telefono,
    notas: s.notas,
    notasManuales: s.notasManuales,
    venta: decOrNull(s.venta),
    gananciaCalc: decOrNull(s.gananciaCalc),
    flete: decOrNull(s.flete),
    costoDevolucionEstimado: decOrNull(s.costoDevolucionEstimado),
    costoProveedor: decOrNull(s.costoProveedor),
    estatusOriginal: s.estatusOriginal,
    ultimoMov: s.ultimoMov,
    fechaUltMov: s.fechaUltMov ? new Date(s.fechaUltMov) : null,
    horaUltMov: decOrNull(s.horaUltMov),
    diasDesdeUltMov: s.diasDesdeUltMov,
    estadoUnificado: s.estadoUnificado,
    cartera: decOrNull(s.cartera),
    carteraAplicada: decOrNull(s.carteraAplicada),
    estadoCartera: s.estadoCartera,
  };
}

export async function undoImportBatch(
  prisma: PrismaClient,
  companyId: string,
  batchId: string,
): Promise<{
  kind: ImportBatchKind;
  deleted: Record<string, number>;
  restored: Record<string, number>;
}> {
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, companyId },
  });
  if (!batch) {
    throw new Error("Lote de importación no encontrado.");
  }
  if (batch.undoneAt) {
    throw new Error("Este lote ya fue deshecho.");
  }

  const payload = batch.payload as ImportBatchPayload;
  const deleted: Record<string, number> = {};
  const restored: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    if (batch.kind === ImportBatchKind.CARTERA && isCarteraPayload(payload)) {
      const legacyIds = payload.walletLegacyIds.map((id) => BigInt(id));
      if (legacyIds.length) {
        const r = await tx.walletMovement.deleteMany({
          where: { companyId, legacyId: { in: legacyIds } },
        });
        deleted.cartera_movimientos = r.count;
      }
      const dropiIds = payload.dropiMovementIds.map((id) => BigInt(id));
      if (dropiIds.length) {
        try {
          const r = await tx.dropiWithdrawal.deleteMany({
            where: { companyId, dropiMovementId: { in: dropiIds } },
          });
          deleted.retiros_dropi = r.count;
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021")) {
            throw e;
          }
        }
      }
    } else if (batch.kind === ImportBatchKind.PRODUCTOS && isProductosPayload(payload)) {
      const pedidoIds = payload.pedidoIds;
      if (pedidoIds.length) {
        const rDel = await tx.productDetail.deleteMany({
          where: { companyId, pedidoIdDropi: { in: pedidoIds } },
        });
        deleted.productos_detalle = rDel.count;
      }
      if (payload.previousProductDetails.length) {
        const r = await tx.productDetail.createMany({
          data: payload.previousProductDetails.map((p) => ({
            companyId,
            pedidoIdDropi: p.pedidoIdDropi,
            productoId: p.productoId,
            sku: p.sku,
            variacionId: p.variacionId,
            productoNombre: p.productoNombre,
            variacion: p.variacion,
            cantidad: p.cantidad,
            precioProveedor: decOrNull(p.precioProveedor ?? undefined),
            precioProveedorXCantidad: decOrNull(p.precioProveedorXCantidad ?? undefined),
          })),
        });
        restored.productos_detalle = r.count;
      }
    } else if (batch.kind === ImportBatchKind.PEDIDOS && isPedidosPayload(payload)) {
      if (payload.createdOrderIds.length) {
        const r = await tx.order.deleteMany({
          where: { companyId, externalOrderId: { in: payload.createdOrderIds } },
        });
        deleted.pedidos = r.count;
      }
      let restoredOrders = 0;
      for (const snap of payload.updatedOrders) {
        const existing = await tx.order.findUnique({
          where: {
            companyId_externalOrderId: { companyId, externalOrderId: snap.externalOrderId },
          },
        });
        if (!existing) continue;
        await tx.order.update({
          where: { id: existing.id },
          data: snapshotToOrderUpdate(snap),
        });
        restoredOrders += 1;
      }
      restored.pedidos = restoredOrders;
    } else {
      throw new Error("Tipo de lote no compatible con el payload guardado.");
    }

    await tx.importBatch.update({
      where: { id: batchId },
      data: { undoneAt: new Date() },
    });
  }, BATCH_TX_OPTIONS);

  return { kind: batch.kind, deleted, restored };
}
