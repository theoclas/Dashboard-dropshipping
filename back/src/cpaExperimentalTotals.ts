export type CpaExperimentalTotalsRow = {
  gastoPublicidad?: unknown;
  conversaciones?: number | null;
  totalFacturado?: unknown;
  gananciaPromedio?: unknown;
  ventas?: number | null;
};

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
  gastoPublicidad: number;
  ventas: number;
  cpa: number | null;
};

/** Totales del rango CPA experimental: suma bases y CPA = gasto / ventas (plantilla CPA). */
export function computeCpaExperimentalTotals(
  rows: CpaExperimentalTotalsRow[],
): CpaExperimentalTotals | null {
  if (rows.length === 0) return null;

  let gasto = 0;
  let ventas = 0;

  for (const r of rows) {
    gasto += num(r.gastoPublicidad);
    ventas += r.ventas ?? 0;
  }

  const cpa = ventas > 0 && gasto > 0 ? roundDec(gasto / ventas, 2) : ventas > 0 ? 0 : null;

  return {
    gastoPublicidad: gasto,
    ventas,
    cpa,
  };
}
