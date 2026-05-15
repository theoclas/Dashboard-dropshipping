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

export function parseDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;

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
