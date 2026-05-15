import { Prisma } from "@prisma/client";

export type PedidoFinInput = {
  venta: Prisma.Decimal | null | undefined;
  flete: Prisma.Decimal | null | undefined;
  costoProveedor: Prisma.Decimal | null | undefined;
  transportadora: string | null | undefined;
  estadoUnificado: string | null | undefined;
  estadoOperativo: string | null | undefined;
};

export function computePedidoFinancials(p: PedidoFinInput): {
  gananciaCalc: number;
  costoDevolucionEstimado: number;
  cartera: number;
} {
  const ventaN = Number(p.venta ?? 0);
  const fleteN = Number(p.flete ?? 0);
  const costoProvN = Number(p.costoProveedor ?? 0);
  const gananciaCalc = ventaN - fleteN - costoProvN;
  const transportadora = (p.transportadora || "").toUpperCase();
  const esInterrapidisimo = transportadora.includes("INTERRAPIDISIMO");
  const costoDevolucionEstimado = esInterrapidisimo ? -fleteN : -(fleteN * 0.8);
  const estado = (p.estadoUnificado || p.estadoOperativo || "").toUpperCase();
  let cartera = 0;
  if (estado === "ENTREGADO") {
    cartera = gananciaCalc;
  } else if (estado === "DEVOLUCION" || estado === "DEVOLUCIÓN") {
    cartera = costoDevolucionEstimado;
  }
  return { gananciaCalc, costoDevolucionEstimado, cartera };
}

export function toDec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(String(n));
}
