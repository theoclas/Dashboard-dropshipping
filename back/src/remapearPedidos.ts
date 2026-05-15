import type { PrismaClient } from "@prisma/client";
import { createEstadoResolver, getCarteraMapByOrdenIds } from "./importPedidosExcel";
import { computePedidoFinancials, toDec } from "./pedidoFinancials";

/**
 * Remapeo masivo (equivalente al flujo Petho de sincronizar estados), limitado a la empresa activa.
 * Solo toca pedidos con `estadoUnificado === "SIN MAPEAR"` de ese `companyId`.
 */
export async function remapearPedidos(
  prisma: PrismaClient,
  companyId: string,
): Promise<{ procesados: number; remapeados: number }> {
  const BATCH = 400;
  const resolveEstadoEnMemoria = await createEstadoResolver(prisma, companyId);

  const normalizeKey = (text: string): string => {
    let s = text.toLowerCase().trim();
    s = s.replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u").replace(/ü/g, "u");
    return s;
  };

  let procesados = 0;
  let remapeados = 0;
  let batchIndex = 0;

  while (true) {
    const pedidosPendientes = await prisma.order.findMany({
      where: { companyId, estadoUnificado: "SIN MAPEAR" },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });

    if (pedidosPendientes.length === 0) break;

    batchIndex++;
    const ids = pedidosPendientes.map((p) => p.externalOrderId).filter(Boolean);
    const carteraMap = await getCarteraMapByOrdenIds(prisma, companyId, ids);

    let persisted = 0;

    for (const pedido of pedidosPendientes) {
      procesados++;

      const estNorm = normalizeKey(pedido.estatusOriginal || "");
      const movNorm = pedido.ultimoMov ? normalizeKey(pedido.ultimoMov) : "";

      let pedidoKey: string | undefined;
      if (estNorm !== "" && estNorm !== "guia_generada" && estNorm !== "guia generada") {
        pedidoKey = pedido.estatusOriginal ?? undefined;
      } else if (movNorm !== "") {
        pedidoKey = pedido.ultimoMov ?? undefined;
      } else {
        pedidoKey = pedido.estatusOriginal ?? undefined;
      }

      const estadoUnificado = resolveEstadoEnMemoria(
        pedido.transportadora ?? undefined,
        pedidoKey,
        pedido.ultimoMov ?? undefined,
      );

      if (!estadoUnificado || estadoUnificado.trim() === "") continue;

      let estadoOperativo = estadoUnificado;
      if (
        estadoUnificado === "OFICINA" &&
        pedido.diasDesdeUltMov !== undefined &&
        pedido.diasDesdeUltMov !== null &&
        pedido.diasDesdeUltMov > 1
      ) {
        estadoOperativo = "OFICINA 1";
      }

      const carteraNeto = carteraMap.get(pedido.externalOrderId) ?? 0;
      const estadosConCartera = ["ENTREGADO", "DEVOLUCION", "DEVOLUCIÓN"];
      const eu = estadoUnificado.toUpperCase();
      const carteraAplicada = estadosConCartera.includes(eu) ? carteraNeto : 0;
      const estadoCartera = carteraNeto !== 0 && estadosConCartera.includes(eu) ? "OK" : "";

      const fin = computePedidoFinancials({
        venta: pedido.venta,
        flete: pedido.flete,
        costoProveedor: pedido.costoProveedor,
        transportadora: pedido.transportadora,
        estadoUnificado,
        estadoOperativo,
      });

      await prisma.order.update({
        where: { id: pedido.id },
        data: {
          estadoUnificado,
          estadoOperativo,
          carteraAplicada: toDec(carteraAplicada),
          estadoCartera,
          gananciaCalc: toDec(fin.gananciaCalc),
          costoDevolucionEstimado: toDec(fin.costoDevolucionEstimado),
          cartera: toDec(fin.cartera),
        },
      });
      remapeados++;
      persisted++;
    }

    if (persisted === 0 && pedidosPendientes.length > 0) {
      break;
    }

    if (pedidosPendientes.length < BATCH) break;
  }

  return { procesados, remapeados };
}
