import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

/**
 * Fechas ISO (…T00:00:00.000Z) como día calendario; evita desfase al formatear en zona local.
 */
export function parseCalendarYmdFromIsoDate(raw: string | null | undefined): [number, number, number] | null {
  if (raw == null || raw === "") return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function fmtCalendarDateDdMmYyyy(raw: string | null | undefined, emptyLabel = "—"): string {
  const p = parseCalendarYmdFromIsoDate(raw);
  if (p) {
    const [y, mo, d] = p;
    return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
  }
  if (raw == null || raw === "") return emptyLabel;
  const fallback = dayjs(raw);
  return fallback.isValid() ? fallback.format("DD/MM/YYYY") : emptyLabel;
}

/** YYYY-MM-DD desde API (campo DATE / ISO `…T00:00:00.000Z`) sin desfase por zona local del navegador. */
export function fmtApiDateIsoYmd(raw: string | null | undefined, emptyLabel = "—"): string {
  const p = parseCalendarYmdFromIsoDate(raw);
  if (p) {
    const [y, mo, d] = p;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (raw == null || raw === "") return emptyLabel;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return emptyLabel;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Ayer como Dayjs (inicio de día local). */
export function dayjsYesterday(): Dayjs {
  return dayjs().subtract(1, "day").startOf("day");
}

/** Rango guardado como YYYY-MM-DD → instancia local para RangePicker. */
export function dayjsFromYmdFilterString(ymd: string): Dayjs {
  const p = parseCalendarYmdFromIsoDate(ymd);
  if (p) {
    const [y, mo, d] = p;
    return dayjs(new Date(y, mo - 1, d));
  }
  return dayjs(ymd);
}
