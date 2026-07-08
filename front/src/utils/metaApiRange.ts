import type { Dayjs } from "dayjs";

export const META_API_MAX_RANGE_DAYS = 30;
/** Pausa entre consultas Meta API (evitar saturar / rate limit). */
export const META_API_DAY_DELAY_MS = 1600;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lista inclusive de YYYY-MM-DD entre dos fechas (máx. META_API_MAX_RANGE_DAYS). */
export function enumerateYmdDays(desde: Dayjs, hasta: Dayjs): string[] {
  const start = desde.startOf("day");
  const end = hasta.startOf("day");
  if (!start.isValid() || !end.isValid()) return [];
  const [a, b] = start.isAfter(end) ? [end, start] : [start, end];
  const out: string[] = [];
  let cur = a;
  while (cur.isBefore(b) || cur.isSame(b, "day")) {
    out.push(cur.format("YYYY-MM-DD"));
    if (out.length >= META_API_MAX_RANGE_DAYS) break;
    cur = cur.add(1, "day");
  }
  return out;
}

export function countInclusiveDays(desde: Dayjs, hasta: Dayjs): number {
  return enumerateYmdDays(desde, hasta).length;
}
