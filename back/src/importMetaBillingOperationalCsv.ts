import { parse } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import { normalizeExcelHeaderKey } from "./excelImportHelpers";
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

function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/[$€\s]/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
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

    const amount = parseMoney(csvCell(row, "Amount", "Monto", "Importe", "Total", "Charge"));
    if (amount === null) {
      errors.push(`Línea ${line}: monto inválido.`);
      continue;
    }

    const dateRaw = csvCell(row, "Date", "Fecha", "Day", "Transaction date");
    const fecha = dateRaw ? new Date(String(dateRaw)) : null;
    if (!fecha || isNaN(fecha.getTime())) {
      errors.push(`Línea ${line}: fecha inválida.`);
      continue;
    }

    const businessName =
      String(csvCell(row, "Account name", "Nombre de cuenta", "Business name", "Negocio") ?? "").trim() || null;
    const concepto =
      String(csvCell(row, "Description", "Descripción", "Concept", "Campaign name", "Detalle") ?? "").trim() ||
      `Facturación Meta ${metaId}`;

    try {
      let acc = await prisma.advertisingAccount.findUnique({
        where: { companyId_metaAccountId: { companyId, metaAccountId: metaId } },
      });
      if (!acc) {
        acc = await prisma.advertisingAccount.create({
          data: { companyId, metaAccountId: metaId, businessName },
        });
        accountsCreated += 1;
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
      expensesCreated += 1;
    } catch (e) {
      errors.push(`Línea ${line}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { accountsCreated, expensesCreated, errors };
}
