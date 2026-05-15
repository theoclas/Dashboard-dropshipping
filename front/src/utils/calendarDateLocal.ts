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

/** Rango guardado como YYYY-MM-DD → instancia local para RangePicker. */
export function dayjsFromYmdFilterString(ymd: string): Dayjs {
  const p = parseCalendarYmdFromIsoDate(ymd);
  if (p) {
    const [y, mo, d] = p;
    return dayjs(new Date(y, mo - 1, d));
  }
  return dayjs(ymd);
}
