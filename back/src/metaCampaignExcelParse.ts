import { parse as parseCsvSync } from "csv-parse/sync";
import * as XLSX from "xlsx";
import {
  getExcelCell,
  normalizeExcelHeaderKey,
  parseDate,
  toMetricRecordDate,
  toNumber,
  toNumberLoose,
  toString,
} from "./excelImportHelpers";

export type ParsedMetaCampaignRow = {
  externalCampaignId: string;
  /** Si el Excel trae ID de anuncio; opcional. No se persiste en BD (solo campaña). */
  externalAdId?: string;
  displayName?: string;
  recordDate: Date;
  metaLinkClicks?: number;
  metaConversationsStarted?: number;
  shopifySessions?: number;
  /** Copia serializable de la fila para `metaExcelSnapshot`. */
  rawRow: Record<string, string | number | boolean | null>;
};

export function normalizeCampaignMapKey(id: string): string {
  return String(id).trim().replace(/\s+/g, "");
}

export type ParseMetaMetricsFileOptions = {
  /** Nombre original del archivo; si termina en `.csv` se usa el parser CSV. */
  sourceFilename?: string;
};

function stripLeadingBom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

function tryDecodeTextBuffer(buf: Buffer): string {
  const utf = stripLeadingBom(buf.toString("utf8"));
  const bad = (utf.match(/\uFFFD/g) ?? []).length;
  if (bad >= 3) return stripLeadingBom(buf.toString("latin1"));
  return utf;
}

function detectCsvDelimiter(sample: string): string {
  const first = sample.split(/\r?\n/).find((l) => l.trim().length > 0) ?? sample;
  const semi = (first.match(/;/g) ?? []).length;
  const comma = (first.match(/,/g) ?? []).length;
  return semi > comma ? ";" : ",";
}

function normalizeRowHeaderKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[stripLeadingBom(k).trim()] = v;
  }
  return out;
}

function readCsvRows(buffer: Buffer): Record<string, unknown>[] {
  const text = tryDecodeTextBuffer(buffer);
  const delim = detectCsvDelimiter(text.slice(0, 12_000));
  const records = parseCsvSync(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter: delim,
    relax_column_count: true,
    relax_quotes: true,
  }) as Record<string, unknown>[];
  return records.map(normalizeRowHeaderKeys);
}

function readXlsxRows(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return json.map(normalizeRowHeaderKeys);
}

/** Primera hoja (xlsx/xls) o CSV con coma o punto y coma. */
function readMetricsTableRows(buffer: Buffer, sourceFilename?: string): Record<string, unknown>[] {
  const lower = (sourceFilename ?? "").toLowerCase();
  if (lower.endsWith(".csv")) {
    return readCsvRows(buffer);
  }
  return readXlsxRows(buffer);
}

function rowToSnapshot(row: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

/**
 * «Importe gastado» del Excel Meta guardado en `metaExcelSnapshot` (misma fila que el modal de métricas).
 * `found`: hubo columna reconocible con valor numérico (incluye 0).
 */
export function spendFromMetaExcelSnapshot(snapshot: unknown): { amount: number; found: boolean } {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { amount: 0, found: false };
  }
  const row = snapshot as Record<string, unknown>;

  const raw = getExcelCell(
    row,
    "Importe gastado (COP)",
    "Importe gastado (USD)",
    "Importe gastado",
    "Amount spent (USD)",
    "Amount spent",
    "Spend (COP)",
  );
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const n = toNumberLoose(raw);
    if (n !== undefined && !Number.isNaN(n)) return { amount: n, found: true };
  }

  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeExcelHeaderKey(k);
    if (nk.includes("importe gastado") || nk.includes("amount spent")) {
      if (v === undefined || v === null || String(v).trim() === "") return { amount: 0, found: false };
      const n = toNumberLoose(v);
      if (n !== undefined && !Number.isNaN(n)) return { amount: n, found: true };
      return { amount: 0, found: false };
    }
  }

  return { amount: 0, found: false };
}

/**
 * Varias filas (p. ej. un anuncio por fila) mismo día y misma campaña → una métrica por campaña/día,
 * sumando clics, conversaciones, sesiones e importe gastado en el snapshot.
 */
export function aggregateMetricRowsByCampaignAndDate(rows: ParsedMetaCampaignRow[]): ParsedMetaCampaignRow[] {
  const groups = new Map<string, ParsedMetaCampaignRow[]>();
  for (const r of rows) {
    const d = toMetricRecordDate(r.recordDate);
    const key = `${normalizeCampaignMapKey(r.externalCampaignId)}|${d.toISOString().slice(0, 10)}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const out: ParsedMetaCampaignRow[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const last = list[list.length - 1];
    let linkSum = 0;
    let convSum = 0;
    let shopSum = 0;
    let linkAny = false;
    let convAny = false;
    let shopAny = false;
    let spendSum = 0;
    let spendAny = false;
    for (const r of list) {
      if (r.metaLinkClicks != null && !Number.isNaN(Number(r.metaLinkClicks))) {
        linkSum += Number(r.metaLinkClicks);
        linkAny = true;
      }
      if (r.metaConversationsStarted != null && !Number.isNaN(Number(r.metaConversationsStarted))) {
        convSum += Number(r.metaConversationsStarted);
        convAny = true;
      }
      if (r.shopifySessions != null && !Number.isNaN(Number(r.shopifySessions))) {
        shopSum += Number(r.shopifySessions);
        shopAny = true;
      }
      const sp = spendFromMetaExcelSnapshot(r.rawRow as Record<string, unknown>);
      if (sp.found) {
        spendSum += sp.amount;
        spendAny = true;
      }
    }
    const mergedRaw: Record<string, string | number | boolean | null> = {
      ...(last.rawRow as Record<string, string | number | boolean | null>),
    };
    if (spendAny) mergedRaw["Importe gastado (COP)"] = spendSum;

    out.push({
      externalCampaignId: last.externalCampaignId,
      ...(last.externalAdId ? { externalAdId: last.externalAdId } : {}),
      displayName: last.displayName,
      recordDate: last.recordDate,
      metaLinkClicks: linkAny ? linkSum : undefined,
      metaConversationsStarted: convAny ? convSum : undefined,
      shopifySessions: shopAny ? shopSum : undefined,
      rawRow: mergedRaw,
    });
  }
  return out;
}

export function parseMetaCampaignMetricsExcel(
  buffer: Buffer,
  opts?: ParseMetaMetricsFileOptions,
): {
  rows: ParsedMetaCampaignRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: ParsedMetaCampaignRow[] = [];
  let skippedWithoutDate = 0;

  let json: Record<string, unknown>[];
  try {
    json = readMetricsTableRows(buffer, opts?.sourceFilename);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    return { rows, errors };
  }

  if (json.length === 0) {
    errors.push("El archivo no tiene filas de datos en la primera hoja (Excel) o en el CSV.");
    return { rows, errors };
  }

  json.forEach((row, idx) => {
    const line = idx + 2;
    const dateRaw = getExcelCell(
      row,
      "Day",
      "Día",
      "Date",
      "Fecha",
      "Fecha de inicio",
      "Start date",
      "Reporting starts",
      "Reporting ends",
      "Inicio del informe",
      "Fin del informe",
      "Final del informe",
      "Reporting period",
      "Periodo del informe",
      "Período del informe",
    );

    const extRaw = getExcelCell(
      row,
      "Campaign ID",
      "Campaign id",
      "Campaign Id",
      "ID de campaña",
      "Id de campaña",
      "Id. de campaña",
      "ID de la campaña",
      "Identificador de la campaña",
      "Identificador de campaña",
      "ID campaña",
      "Id campaña",
      "campaign id",
      "campaign_id",
    );
    const adRaw = getExcelCell(
      row,
      "Ad ID",
      "Ad id",
      "ID de anuncio",
      "Id de anuncio",
      "Id. de anuncio",
      "ID del anuncio",
      "Id del anuncio",
      "Identificador de anuncio",
      "Identificador del anuncio",
      "Identificador de anuncios",
      "ad id",
      "ad_id",
    );

    const externalCampaignId = toString(extRaw)?.trim();
    const externalAdId = toString(adRaw)?.trim();

    const nameProbe =
      toString(
        getExcelCell(row, "Campaign name", "Nombre de la campaña", "Campaign", "Nombre de campaña"),
      )?.trim() ||
      toString(getExcelCell(row, "Ad name", "Nombre del anuncio", "Nombre de anuncio"))?.trim();
    const clicksProbe = toNumber(getExcelCell(row, "Link clicks", "Clics en el enlace", "Clics", "Link Clicks"));
    const dateProbe = parseDate(dateRaw);
    const rowLooksEmpty =
      !externalCampaignId && !dateProbe && !nameProbe && clicksProbe === undefined;

    if (rowLooksEmpty) return;

    if (!externalCampaignId) {
      errors.push(`Fila ${line}: falta ID de campaña Meta (columna «ID de campaña» / «Campaign ID», etc.).`);
      return;
    }

    const recordDateRaw = parseDate(dateRaw);
    if (!recordDateRaw) {
      skippedWithoutDate += 1;
      return;
    }
    const recordDate = toMetricRecordDate(recordDateRaw);

    const displayName =
      toString(
        getExcelCell(row, "Campaign name", "Nombre de la campaña", "Campaign", "Nombre de campaña"),
      )?.trim() ||
      toString(getExcelCell(row, "Ad name", "Nombre del anuncio", "Nombre de anuncio"))?.trim() ||
      undefined;

    const linkClicks = toNumber(getExcelCell(row, "Link clicks", "Clics en el enlace", "Clics", "Link Clicks"));
    /** No usar «Resultados»: es la métrica de objetivo del anuncio, no conversaciones por mensajes. */
    const conversations = toNumber(
      getExcelCell(
        row,
        "Conversaciones con mensajes iniciadas",
        "Messaging conversations started",
        "Conversations started",
        "Conversaciones iniciadas",
        "Conversaciones",
      ),
    );
    const shopifySessions = toNumber(
      getExcelCell(row, "Shopify sessions", "Sesiones Shopify", "Sessions", "Sesiones"),
    );

    rows.push({
      externalCampaignId,
      ...(externalAdId ? { externalAdId } : {}),
      displayName,
      recordDate,
      metaLinkClicks: linkClicks,
      metaConversationsStarted: conversations,
      shopifySessions,
      rawRow: rowToSnapshot(row),
    });
  });

  if (skippedWithoutDate > 0) {
    errors.push(
      `Aviso: se omitieron ${skippedWithoutDate} fila(s) sin fecha reconocida (añade una columna tipo «Inicio del informe» / «Fecha» o revisa el formato). Las demás filas se importan con normalidad.`,
    );
  }

  return { rows, errors };
}
