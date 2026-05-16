const intFmt = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

const moneyFmt = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pctFmt = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Enteros: ej. 2.000.000 */
export function fmtInteger(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? intFmt.format(n) : String(v);
}

/** Moneda (solo número): ej. 2.000.000,00 — anteponer $ en la UI si aplica. */
export function fmtMoney(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? moneyFmt.format(n) : String(v);
}

/** Porcentaje: ej. 12,5% */
export function fmtPercent(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${pctFmt.format(n)}%` : String(v);
}

/** Ratio 0–1 (p. ej. tasa de conversión guardada como ventas/conv) → "1,09%". */
export function fmtPercentRatio(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const pct = n * 100;
  return `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(pct)}%`;
}

/** Valor ya en puntos porcentuales (p. ej. 72,97 para costo publicitario % sobre facturación). */
export function fmtPercentPoints(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}%`;
}
