import type { Dayjs } from "dayjs";

/**
 * Etiqueta de semana del mes según el día calendario:
 * días 1–7 → SEMANA 1, 8–14 → 2, 15–21 → 3, 22–31 → 4.
 */
export function semanaDelMesDesdeFecha(d: Dayjs | null | undefined): string {
  if (!d || !d.isValid()) return "";
  const day = d.date();
  const n = Math.min(4, Math.ceil(day / 7));
  return `SEMANA ${n}`;
}
