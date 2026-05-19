import { parse } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import { normalizeExcelHeaderKey, parseDate } from "./excelImportHelpers";
import { prisma } from "./prisma";

export type ImportMetaBillingResult = {
  accountsCreated: number;
  expensesCreated: number;
  errors: string[];
};

function csvCell(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normalizeExcelHeaderKey(k), v);
  }
  for (const a of aliases) {
    const key = normalizeExcelHeaderKey(a);
    const v = map.get(key);
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

/** Montos Meta COP/EUR: 108.462 o 1.341.410 (punto miles) o 108,46 (coma decimal). */
export function parseMetaBillingMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/[$€\s]/g, "");
  if (!s) return null;

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    const n = Number(s.replace(/\./g, ""));
    return Number.isNaN(n) ? null : n;
  }
  if (/^\d+,\d+$/.test(s)) {
    const n = Number(s.replace(",", "."));
    return Number.isNaN(n) ? null : n;
  }

  const normalized = s.replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

/** CSV «Resumen de facturación» Meta (ES): cabecera con Cuenta/Negocio y tabla Fecha,Importe,… */
export function extractMetaBillingResumenContext(csvText: string): {
  metaAccountId: string;
  businessName: string | null;
  tableCsv: string;
} | null {
  const lines = csvText.split(/\r?\n/);
  let metaAccountId: string | null = null;
  let businessName: string | null = null;
  let headerIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!metaAccountId) {
      const cuenta = line.match(/Cuenta:\s*(\d+)/i);
      if (cuenta) metaAccountId = cuenta[1];
    }
    if (!businessName) {
      const neg = line.match(/Negocio:\s*([^,]+)/i);
      if (neg) businessName = neg[1].trim() || null;
    }
    const norm = normalizeExcelHeaderKey(line.split(",")[0] ?? "");
    if (
      headerIdx < 0 &&
      (norm === "fecha" || line.toLowerCase().startsWith("fecha,")) &&
      line.toLowerCase().includes("importe")
    ) {
      headerIdx = i;
    }
  }

  if (!metaAccountId || headerIdx < 0) return null;

  const tableLines = lines.slice(headerIdx).filter((ln) => {
    const t = ln.trim();
    if (!t) return false;
    if (/importe\s+total/i.test(t)) return false;
    if (/^vat\s/i.test(t)) return false;
    return true;
  });

  return {
    metaAccountId,
    businessName,
    tableCsv: tableLines.join("\n"),
  };
}

async function upsertExpenseFromBillingRow(
  companyId: string,
  createdByUserId: string | null,
  metaId: string,
  businessName: string | null,
  fecha: Date,
  amount: number,
  concepto: string,
): Promise<{ accountCreated: boolean }> {
  let acc = await prisma.advertisingAccount.findUnique({
    where: { companyId_metaAccountId: { companyId, metaAccountId: metaId } },
  });
  let accountCreated = false;
  if (!acc) {
    acc = await prisma.advertisingAccount.create({
      data: { companyId, metaAccountId: metaId, businessName },
    });
    accountCreated = true;
  } else if (businessName && !acc.businessName) {
    await prisma.advertisingAccount.update({
      where: { id: acc.id },
      data: { businessName },
    });
  }

  await prisma.operationalExpense.create({
    data: {
      companyId,
      fecha,
      monto: new Prisma.Decimal(amount),
      concepto,
      categoria: "OTRO",
      cuentaPublicitaria: metaId,
      advertisingAccountId: acc.id,
      pagado: false,
      createdByUserId,
    },
  });
  return { accountCreated };
}

/** Importa filas de facturación Meta (CSV) como gastos operacionales y crea cuentas publicitarias si faltan. */
export async function importMetaBillingOperationalCsv(
  companyId: string,
  csvText: string,
  createdByUserId: string | null,
): Promise<ImportMetaBillingResult> {
  const errors: string[] = [];
  let accountsCreated = 0;
  let expensesCreated = 0;

  const resumen = extractMetaBillingResumenContext(csvText);
  if (resumen) {
    let rows: Record<string, unknown>[];
    try {
      rows = parse(resumen.tableCsv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, unknown>[];
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "CSV inválido.");
      return { accountsCreated, expensesCreated, errors };
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 2;
      const dateRaw = csvCell(row, "Fecha", "Date", "Day", "Transaction date");
      const fecha = dateRaw ? parseDate(dateRaw) : undefined;
      if (!fecha) {
        errors.push(`Línea ${line}: fecha inválida.`);
        continue;
      }

      const amount = parseMetaBillingMoney(csvCell(row, "Importe", "Amount", "Monto", "Total", "Charge"));
      if (amount === null) {
        errors.push(`Línea ${line}: monto inválido.`);
        continue;
      }

      const txId = String(
        csvCell(row, "Identificador de la transacción", "Transaction ID", "Transaction id", "ID") ?? "",
      ).trim();
      const concepto = txId ? `Facturación Meta ${txId}` : `Facturación Meta ${resumen.metaAccountId}`;

      try {
        const { accountCreated } = await upsertExpenseFromBillingRow(
          companyId,
          createdByUserId,
          resumen.metaAccountId,
          resumen.businessName,
          fecha,
          amount,
          concepto,
        );
        if (accountCreated) accountsCreated += 1;
        expensesCreated += 1;
      } catch (e) {
        errors.push(`Línea ${line}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { accountsCreated, expensesCreated, errors };
  }

  let rows: Record<string, unknown>[];
  try {
    rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "CSV inválido.");
    return { accountsCreated, expensesCreated, errors };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    const metaId = String(
      csvCell(row, "Account ID", "Account id", "ID de cuenta", "Cuenta", "account id", "Ad account id") ?? "",
    ).trim();
    if (!metaId) {
      errors.push(`Línea ${line}: sin ID de cuenta.`);
      continue;
    }

    const amount = parseMetaBillingMoney(csvCell(row, "Amount", "Monto", "Importe", "Total", "Charge"));
    if (amount === null) {
      errors.push(`Línea ${line}: monto inválido.`);
      continue;
    }

    const dateRaw = csvCell(row, "Date", "Fecha", "Day", "Transaction date");
    const fecha = dateRaw ? parseDate(dateRaw) : undefined;
    if (!fecha) {
      errors.push(`Línea ${line}: fecha inválida.`);
      continue;
    }

    const businessName =
      String(csvCell(row, "Account name", "Nombre de cuenta", "Business name", "Negocio") ?? "").trim() || null;
    const concepto =
      String(csvCell(row, "Description", "Descripción", "Concept", "Campaign name", "Detalle") ?? "").trim() ||
      `Facturación Meta ${metaId}`;

    try {
      const { accountCreated } = await upsertExpenseFromBillingRow(
        companyId,
        createdByUserId,
        metaId,
        businessName,
        fecha,
        amount,
        concepto,
      );
      if (accountCreated) accountsCreated += 1;
      expensesCreated += 1;
    } catch (e) {
      errors.push(`Línea ${line}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { accountsCreated, expensesCreated, errors };
}
