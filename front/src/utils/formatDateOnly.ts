/** Día calendario (YYYY-MM-DD) sin desfase por zona horaria — alinea con fechas guardadas en UTC medianoche. */
export function formatDateOnly(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
