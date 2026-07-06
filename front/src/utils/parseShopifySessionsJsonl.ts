export type ParseShopifySessionsResult =
  | { ok: true; byDate: Map<string, number>; parsedCount: number; invalidLines: string[] }
  | { ok: false; message: string; invalidLines: string[] };

const DATE_KEYS = ["day", "date", "fecha"] as const;
const SESSION_KEYS = ["sessions", "sesiones"] as const;

function normalizeYmd(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseSessionsValue(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Math.round(Number(raw));
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

function extractRow(obj: Record<string, unknown>): { date: string; sessions: number } | null {
  let date: string | null = null;
  for (const k of DATE_KEYS) {
    if (k in obj) {
      date = normalizeYmd(obj[k]);
      if (date) break;
    }
  }
  let sessions: number | null = null;
  for (const k of SESSION_KEYS) {
    if (k in obj) {
      sessions = parseSessionsValue(obj[k]);
      if (sessions != null) break;
    }
  }
  if (!date || sessions == null) return null;
  return { date, sessions };
}

function parseJsonObjects(text: string): { objects: Record<string, unknown>[]; invalidLines: string[] } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { objects: [], invalidLines: [] };
  }

  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(arr)) {
        return { objects: [], invalidLines: ["El JSON debe ser un array de objetos."] };
      }
      const objects: Record<string, unknown>[] = [];
      const invalidLines: string[] = [];
      arr.forEach((item, i) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          objects.push(item as Record<string, unknown>);
        } else {
          invalidLines.push(`Índice ${i}: no es un objeto válido.`);
        }
      });
      return { objects, invalidLines };
    } catch {
      return { objects: [], invalidLines: ["JSON array inválido."] };
    }
  }

  const objects: Record<string, unknown>[] = [];
  const invalidLines: string[] = [];
  const lines = trimmed.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as unknown;
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        invalidLines.push(`Línea ${i + 1}: se esperaba un objeto JSON.`);
        continue;
      }
      objects.push(obj as Record<string, unknown>);
    } catch {
      invalidLines.push(`Línea ${i + 1}: JSON inválido.`);
    }
  }
  return { objects, invalidLines };
}

/** Parsea informe Shopify (JSONL o array JSON) → mapa YYYY-MM-DD → sesiones. */
export function parseShopifySessionsJsonl(text: string): ParseShopifySessionsResult {
  const { objects, invalidLines } = parseJsonObjects(text);
  if (objects.length === 0 && invalidLines.length > 0) {
    return { ok: false, message: invalidLines[0] ?? "No se pudo leer el informe.", invalidLines };
  }
  if (objects.length === 0) {
    return { ok: false, message: "No hay filas válidas en el texto pegado.", invalidLines };
  }

  const byDate = new Map<string, number>();
  for (let i = 0; i < objects.length; i++) {
    const row = extractRow(objects[i]!);
    if (!row) {
      invalidLines.push(`Fila ${i + 1}: falta fecha (day/date/fecha) o sesiones (sessions/sesiones).`);
      continue;
    }
    byDate.set(row.date, row.sessions);
  }

  if (byDate.size === 0) {
    return {
      ok: false,
      message: "Ninguna fila tiene fecha y sesiones reconocibles.",
      invalidLines,
    };
  }

  return { ok: true, byDate, parsedCount: byDate.size, invalidLines };
}

function shopifyInputFromPreviewIds(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) out[id] = "";
  return out;
}

export function shopifySessionsInputForDay(
  preview: { uniqueCampaignIds?: string[] },
  selectedCampaignIds: string[],
  sessions: number,
): Record<string, string> {
  const base = shopifyInputFromPreviewIds(preview.uniqueCampaignIds ?? []);
  const targets =
    selectedCampaignIds.length > 0 ? selectedCampaignIds : (preview.uniqueCampaignIds ?? []);
  const val = String(sessions);
  for (const id of targets) {
    base[id] = val;
  }
  return base;
}

export function applySessionsToBatchDays<T extends {
  reportDate: string;
  status: string;
  preview: { uniqueCampaignIds?: string[] } | null;
  selectedCampaignIds: string[];
  shopifySessionsInput: Record<string, string>;
}>(
  days: T[],
  byDate: Map<string, number>,
): { updated: T[]; applied: number; batchWithoutJson: number; jsonWithoutBatch: number } {
  const batchOkDates = new Set(
    days.filter((d) => d.status === "ok" && d.preview).map((d) => d.reportDate),
  );
  let applied = 0;
  let batchWithoutJson = 0;
  const updated = days.map((day) => {
    if (day.status !== "ok" || !day.preview) return day;
    const sessions = byDate.get(day.reportDate);
    if (sessions == null) {
      batchWithoutJson++;
      return day;
    }
    applied++;
    return {
      ...day,
      shopifySessionsInput: shopifySessionsInputForDay(day.preview, day.selectedCampaignIds, sessions),
    };
  });
  let jsonWithoutBatch = 0;
  for (const date of byDate.keys()) {
    if (!batchOkDates.has(date)) jsonWithoutBatch++;
  }
  return { updated, applied, batchWithoutJson, jsonWithoutBatch };
}
