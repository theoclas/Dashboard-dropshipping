import type { CpaExperimentalRecordRow } from "../types";
import { isCpaPerdida } from "./cpaDisplay";

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundDec(n: number, scale: number): number {
  const f = 10 ** scale;
  return Math.round(n * f) / f;
}

export type CpaExperimentalTotals = {
  dias: number;
  gastoPublicidad: number;
  conversaciones: number;
  totalFacturado: number;
  gananciaPromedio: number | null;
  ventas: number;
  ticketPromedioProducto: number | null;
  cpa: number | null;
  cpaEsPerdida: boolean;
  conversionRate: number | null;
  costoPublicitario: number | null;
  rentabilidad: number | null;
  utilidadAproximada: number | null;
};

/** Totales del rango: suma bases y recalcula columnas derivadas (plantilla CPA). */
export function computeCpaExperimentalTotals(
  rows: CpaExperimentalRecordRow[],
): CpaExperimentalTotals | null {
  if (rows.length === 0) return null;

  let gasto = 0;
  let conversaciones = 0;
  let totalFacturado = 0;
  let ventas = 0;
  let ganWeighted = 0;
  let ventasForGan = 0;

  for (const r of rows) {
    gasto += num(r.gastoPublicidad);
    conversaciones += r.conversaciones ?? 0;
    totalFacturado += num(r.totalFacturado);
    const v = r.ventas ?? 0;
    ventas += v;
    if (v > 0 && r.gananciaPromedio != null) {
      const g = num(r.gananciaPromedio);
      if (g !== 0) {
        ganWeighted += g * v;
        ventasForGan += v;
      }
    }
  }

  const gananciaPromedio = ventasForGan > 0 ? ganWeighted / ventasForGan : null;
  const gastoPublicidad = gasto;

  let ticketPromedioProducto: number | null = null;
  let cpa: number | null = null;
  if (ventas > 0) {
    ticketPromedioProducto = roundDec(totalFacturado / ventas, 2);
    cpa = gastoPublicidad > 0 ? roundDec(gastoPublicidad / ventas, 2) : null;
  }

  let conversionRate: number | null = null;
  if (conversaciones > 0) {
    conversionRate = roundDec(ventas / conversaciones, 4);
  }

  let costoPublicitario: number | null = null;
  if (cpa != null && ticketPromedioProducto != null && ticketPromedioProducto > 0) {
    costoPublicitario = roundDec((cpa / ticketPromedioProducto) * 100, 2);
  }

  let utilidadAproximada: number | null = null;
  if (ventas === 0) {
    utilidadAproximada = gastoPublicidad > 0 ? roundDec(-gastoPublicidad, 2) : null;
  } else if (gananciaPromedio != null) {
    utilidadAproximada = roundDec((gananciaPromedio * ventas - gastoPublicidad) * 0.75, 2);
  }

  let rentabilidad: number | null = null;
  if (ventas === 0) {
    rentabilidad = 100;
  } else if (cpa != null && gananciaPromedio != null && gananciaPromedio !== 0) {
    rentabilidad = roundDec((cpa / gananciaPromedio) * 100, 2);
  }

  return {
    dias: rows.length,
    gastoPublicidad,
    conversaciones,
    totalFacturado,
    gananciaPromedio,
    ventas,
    ticketPromedioProducto,
    cpa,
    cpaEsPerdida: isCpaPerdida(gastoPublicidad, ventas),
    conversionRate,
    costoPublicitario,
    rentabilidad,
    utilidadAproximada,
  };
}
