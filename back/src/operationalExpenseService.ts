import type { OperationalExpenseCategory, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

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
      fecha: data.fecha,
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
      ...(data.fecha !== undefined ? { fecha: data.fecha } : {}),
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
