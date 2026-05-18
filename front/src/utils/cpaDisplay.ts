import { fmtMoney } from "./format";

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Gasto publicitario ese día sin ventas atribuidas en pedidos. */
export function isCpaPerdida(gasto: unknown, ventas: unknown): boolean {
  const g = num(gasto);
  if (g <= 0) return false;
  if (ventas === null || ventas === undefined || ventas === "") return true;
  return num(ventas) === 0;
}

export function fmtCpaDisplay(cpa: unknown, gasto: unknown, ventas: unknown): string {
  if (isCpaPerdida(gasto, ventas)) return "Pérdida";
  if (cpa === null || cpa === undefined) return "—";
  if (typeof cpa === "number") return fmtMoney(cpa);
  const n = Number(cpa);
  return Number.isFinite(n) ? fmtMoney(n) : String(cpa);
}
