import * as XLSX from "xlsx";
import { getExcelCell, parseDate, toNumber, toString } from "./excelImportHelpers";

export type ParsedMetaCampaignRow = {
  externalCampaignId: string;
  displayName?: string;
  recordDate: Date;
  metaLinkClicks?: number;
  metaConversationsStarted?: number;
  shopifySessions?: number;
  /** Copia serializable de la fila para `metaExcelSnapshot`. */
  rawRow: Record<string, unknown>;
};

export function normalizeCampaignMapKey(id: string): string {
  return String(id).trim().replace(/\s+/g, "");
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

export function parseMetaCampaignMetricsExcel(buffer: Buffer): {
  rows: ParsedMetaCampaignRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: ParsedMetaCampaignRow[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "No se pudo leer el Excel.");
    return { rows, errors };
  }
  const name = wb.SheetNames[0];
  if (!name) {
    errors.push("El archivo no tiene hojas.");
    return { rows, errors };
  }
  const sheet = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  json.forEach((row, idx) => {
    const line = idx + 2;
    const extRaw = getExcelCell(
      row,
      "Campaign ID",
      "Campaign id",
      "ID de campaña",
      "Id de campaña",
      "campaign id",
    );
    const externalCampaignId = toString(extRaw)?.trim();
    if (!externalCampaignId) {
      errors.push(`Fila ${line}: falta ID de campaña Meta.`);
      return;
    }

    const dateRaw = getExcelCell(
      row,
      "Day",
      "Día",
      "Date",
      "Fecha",
      "Reporting starts",
      "Inicio del informe",
      "Reporting period",
    );
    const recordDate = parseDate(dateRaw);
    if (!recordDate) {
      errors.push(`Fila ${line}: fecha inválida o vacía (campaña ${externalCampaignId}).`);
      return;
    }

    const displayName =
      toString(
        getExcelCell(row, "Campaign name", "Nombre de la campaña", "Campaign", "Nombre de campaña"),
      )?.trim() || undefined;

    const linkClicks = toNumber(getExcelCell(row, "Link clicks", "Clics en el enlace", "Clics", "Link Clicks"));
    const conversations = toNumber(
      getExcelCell(
        row,
        "Conversations started",
        "Conversaciones iniciadas",
        "Conversaciones",
        "Messaging conversations started",
      ),
    );
    const shopifySessions = toNumber(
      getExcelCell(row, "Shopify sessions", "Sesiones Shopify", "Sessions", "Sesiones"),
    );

    rows.push({
      externalCampaignId,
      displayName,
      recordDate,
      metaLinkClicks: linkClicks,
      metaConversationsStarted: conversations,
      shopifySessions,
      rawRow: rowToSnapshot(row),
    });
  });

  return { rows, errors };
}
