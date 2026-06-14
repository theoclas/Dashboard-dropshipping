import { Prisma } from "@prisma/client";
import { toMetricRecordDate } from "./excelImportHelpers";
import { prisma } from "./prisma";

/** Clave estable para omitir duplicados en CSV, API y reimportaciones. */
export function billingImportDedupeKey(
  metaId: string,
  concepto: string,
  fecha: Date,
  amount: number,
): string {
  const day = toMetricRecordDate(fecha).toISOString().slice(0, 10);
  return `${metaId}|${concepto}|${day}|${amount}`;
}

function utcDayRange(fecha: Date): { gte: Date; lt: Date } {
  const gte = toMetricRecordDate(fecha);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

async function findExistingOperationalExpense(
  companyId: string,
  concepto: string,
  fecha: Date,
  amount: number,
  metaId: string,
): Promise<{ id: string } | null> {
  const byConcepto = await prisma.operationalExpense.findFirst({
    where: { companyId, concepto },
    select: { id: true },
  });
  if (byConcepto) return byConcepto;

  const { gte, lt } = utcDayRange(fecha);
  return prisma.operationalExpense.findFirst({
    where: {
      companyId,
      cuentaPublicitaria: metaId,
      fecha: { gte, lt },
      monto: new Prisma.Decimal(amount),
    },
    select: { id: true },
  });
}

export async function upsertOperationalExpenseFromBilling(
  companyId: string,
  createdByUserId: string | null,
  metaId: string,
  businessName: string | null,
  fecha: Date,
  amount: number,
  concepto: string,
): Promise<{ accountCreated: boolean; created: boolean; updated: boolean }> {
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

  const recordDate = toMetricRecordDate(fecha);
  const existing = await findExistingOperationalExpense(companyId, concepto, recordDate, amount, metaId);

  if (existing) {
    // Misma regla que import CSV: solo actualiza datos de facturación; no toca pagado/categoría/notas.
    await prisma.operationalExpense.update({
      where: { id: existing.id },
      data: {
        fecha: recordDate,
        monto: new Prisma.Decimal(amount),
        concepto,
        cuentaPublicitaria: metaId,
        advertisingAccountId: acc.id,
      },
    });
    return { accountCreated, created: false, updated: true };
  }

  await prisma.operationalExpense.create({
    data: {
      companyId,
      fecha: recordDate,
      monto: new Prisma.Decimal(amount),
      concepto,
      categoria: "OTRO",
      cuentaPublicitaria: metaId,
      advertisingAccountId: acc.id,
      pagado: false,
      createdByUserId,
    },
  });
  return { accountCreated, created: true, updated: false };
}
