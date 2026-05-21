import type { OperationalExpenseCategory, Prisma } from "@prisma/client";
import { toMetricRecordDate } from "./excelImportHelpers";
import { prisma } from "./prisma";

function expenseFechaRangeFilter(desde: Date | null, hasta: Date | null): Prisma.DateTimeFilter | undefined {
  if (!desde && !hasta) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (desde) {
    f.gte = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate(), 0, 0, 0, 0));
  }
  if (hasta) {
    f.lte = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate(), 23, 59, 59, 999));
  }
  return f.gte !== undefined || f.lte !== undefined ? f : undefined;
}

export function parseExpenseFilterDate(ymd: string | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00.000Z`);
}

export async function listOperationalExpensesByAdvertisingAccount(
  companyId: string,
  advertisingAccountId: string,
  range?: { desde: Date | null; hasta: Date | null },
) {
  const where: Prisma.OperationalExpenseWhereInput = {
    companyId,
    advertisingAccountId,
  };
  const fe = expenseFechaRangeFilter(range?.desde ?? null, range?.hasta ?? null);
  if (fe) where.fecha = fe;
  return prisma.operationalExpense.findMany({
    where,
    orderBy: { fecha: "desc" },
    include: { advertisingAccount: { select: { id: true, metaAccountId: true, businessName: true } } },
  });
}

export async function summarizeOperationalExpensesByAdvertisingAccount(
  companyId: string,
  advertisingAccountId: string,
  range?: { desde: Date | null; hasta: Date | null },
) {
  const base: Prisma.OperationalExpenseWhereInput = {
    companyId,
    advertisingAccountId,
  };
  const fe = expenseFechaRangeFilter(range?.desde ?? null, range?.hasta ?? null);
  if (fe) base.fecha = fe;

  const [totalAgg, pagadoAgg, pendienteAgg] = await Promise.all([
    prisma.operationalExpense.aggregate({ where: base, _sum: { monto: true } }),
    prisma.operationalExpense.aggregate({ where: { ...base, pagado: true }, _sum: { monto: true } }),
    prisma.operationalExpense.aggregate({ where: { ...base, pagado: false }, _sum: { monto: true } }),
  ]);

  return {
    totalGastado: Number(totalAgg._sum.monto ?? 0),
    totalPagado: Number(pagadoAgg._sum.monto ?? 0),
    pendientePorPagar: Number(pendienteAgg._sum.monto ?? 0),
  };
}

export function listOperationalExpenses(companyId: string) {
  return prisma.operationalExpense.findMany({
    where: { companyId },
    include: { advertisingAccount: true },
    orderBy: { fecha: "desc" },
  });
}

export function createOperationalExpense(
  companyId: string,
  data: {
    fecha: Date;
    monto: Prisma.Decimal | number | string;
    concepto: string;
    categoria?: OperationalExpenseCategory | null;
    banco?: string | null;
    medio?: string | null;
    cuentaPublicitaria?: string | null;
    advertisingAccountId?: string | null;
    notas?: string | null;
    pagado?: boolean;
    createdByUserId?: string | null;
  },
) {
  return prisma.operationalExpense.create({
    data: {
      companyId,
      fecha: toMetricRecordDate(data.fecha),
      monto: data.monto as Prisma.Decimal,
      concepto: data.concepto.trim(),
      categoria: data.categoria ?? null,
      banco: data.banco?.trim() || null,
      medio: data.medio?.trim() || null,
      cuentaPublicitaria: data.cuentaPublicitaria?.trim() || null,
      advertisingAccountId: data.advertisingAccountId ?? null,
      notas: data.notas?.trim() || null,
      pagado: data.pagado ?? false,
      createdByUserId: data.createdByUserId ?? null,
    },
    include: { advertisingAccount: true },
  });
}

export async function updateOperationalExpense(
  companyId: string,
  id: string,
  data: Partial<{
    fecha: Date;
    monto: Prisma.Decimal | number | string;
    concepto: string;
    categoria: OperationalExpenseCategory | null;
    banco: string | null;
    medio: string | null;
    cuentaPublicitaria: string | null;
    advertisingAccountId: string | null;
    notas: string | null;
    pagado: boolean;
  }>,
) {
  const row = await prisma.operationalExpense.findFirst({ where: { id, companyId } });
  if (!row) return null;
  return prisma.operationalExpense.update({
    where: { id },
    data: {
      ...(data.fecha !== undefined ? { fecha: toMetricRecordDate(data.fecha) } : {}),
      ...(data.monto !== undefined ? { monto: data.monto as Prisma.Decimal } : {}),
      ...(data.concepto !== undefined ? { concepto: data.concepto.trim() } : {}),
      ...(data.categoria !== undefined ? { categoria: data.categoria } : {}),
      ...(data.banco !== undefined ? { banco: data.banco } : {}),
      ...(data.medio !== undefined ? { medio: data.medio } : {}),
      ...(data.cuentaPublicitaria !== undefined ? { cuentaPublicitaria: data.cuentaPublicitaria } : {}),
      ...(data.advertisingAccountId !== undefined ? { advertisingAccountId: data.advertisingAccountId } : {}),
      ...(data.notas !== undefined ? { notas: data.notas } : {}),
      ...(data.pagado !== undefined ? { pagado: data.pagado } : {}),
    },
    include: { advertisingAccount: true },
  });
}

export async function deleteOperationalExpense(companyId: string, id: string) {
  const r = await prisma.operationalExpense.deleteMany({ where: { id, companyId } });
  return r.count > 0;
}
