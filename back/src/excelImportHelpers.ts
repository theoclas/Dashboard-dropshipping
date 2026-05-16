/** Utilidades de parsing para importaciones desde Excel (fechas, cabeceras flexibles, etc.). */

export function toString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const str = String(value).trim();
  if (str === "") return undefined;
  const num = Number(str);
  return Number.isNaN(num) ? undefined : num;
}

export function excelSerialToDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const fractionalDay = serial - Math.floor(serial);
  const totalSeconds = Math.floor(86400 * fractionalDay);

  const date = new Date(utcValue * 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  date.setUTCHours(hours, minutes, 0, 0);

  return date;
}

/**
 * Día calendario (año-mes-día) para fechas “de informe”.
 * Si el instante es medianoche UTC exacta, usa el día en UTC (ISO / seriales Excel en UTC).
 * Si no, el día en hora local (fechas construidas con calendario local).
 */
export function utcCalendarParts(d: Date): { y: number; m: number; day: number } {
  const utcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;

  if (utcMidnight) {
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
  }
  return { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() };
}

/** Fecha-only estable para `@db.Date` (métricas Meta; alinea reimport con filas existentes). */
export function toMetricRecordDate(d: Date): Date {
  const { y, m, day } = utcCalendarParts(d);
  return new Date(Date.UTC(y, m, day));
}

export function parseDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  const str = String(value).trim();
  if (!str) return undefined;

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const mo = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    const date = new Date(y, mo - 1, d);
    if (!isNaN(date.getTime())) return date;
  }

  const slash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const month = parseInt(slash[2], 10);
    const year = parseInt(slash[3], 10);
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) return date;
  }

  const parts = str.split("-");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    if (!isNaN(date.getTime())) return date;
  }

  const date = new Date(str);
  return isNaN(date.getTime()) ? undefined : date;
}

export function parseDateTime(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  const str = String(value).trim();
  if (!str) return undefined;

  const match = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (match) {
    const [, day, month, year, hour, minute] = match;
    return new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
    );
  }

  return parseDate(value);
}

export function parseTime(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") return value;

  const str = String(value).trim();
  const match = str.match(/^(\d{2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return (hours + minutes / 60) / 24;
  }

  return undefined;
}

export function normalizeExcelHeaderKey(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\u00A0/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getExcelCell(row: Record<string, unknown>, ...headerAliases: string[]): unknown {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normalizeExcelHeaderKey(k), v);
  }
  for (const alias of headerAliases) {
    const key = normalizeExcelHeaderKey(alias);
    const v = map.get(key);
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return v;
    }
  }
  return undefined;
}

export function toCpaNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const str = String(value).trim();
  if (str === "" || str === "-" || str === "—" || /^#N\/A$/i.test(str)) return null;
  const num = Number(str);
  return Number.isNaN(num) ? null : num;
}

/**
 * Número desde celdas de informes Meta (COP): entero, "58.301", "1.234.567,89", "1,234.56", etc.
 */
export function toNumberLoose(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  let s = String(value).trim();
  if (!s || s === "-" || s === "—" || /^#N\/A$/i.test(s)) return undefined;
  s = s.replace(/\$/g, "").replace(/\u00A0/g, " ").replace(/\s/g, "");

  if (/^-?\d+$/.test(s)) return Number(s);

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }

  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) {
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }

  if (/^-?\d+,\d+$/.test(s)) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }

  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
