import type { DropiWithdrawal } from "@prisma/client";
import { prisma } from "./prisma";

export type DropiWithdrawalDto = {
  id: string;
  dropiMovementId: string;
  fecha: string | null;
  monto: string | null;
  descripcion: string | null;
  conceptoRetiro: string | null;
  notaAdicional: string | null;
};

function serialize(r: DropiWithdrawal): DropiWithdrawalDto {
  return {
    id: r.id,
    dropiMovementId: r.dropiMovementId.toString(),
    fecha: r.fecha?.toISOString() ?? null,
    monto: r.monto != null ? r.monto.toString() : null,
    descripcion: r.descripcion,
    conceptoRetiro: r.conceptoRetiro,
    notaAdicional: r.notaAdicional,
  };
}

export async function listDropiWithdrawals(companyId: string): Promise<DropiWithdrawalDto[]> {
  const rows = await prisma.dropiWithdrawal.findMany({
    where: { companyId },
    orderBy: [{ fecha: "desc" }, { dropiMovementId: "desc" }],
  });
  return rows.map(serialize);
}

export async function patchDropiWithdrawalNota(
  companyId: string,
  id: string,
  notaAdicional: string | null,
): Promise<DropiWithdrawalDto | null> {
  const row = await prisma.dropiWithdrawal.findFirst({ where: { id, companyId } });
  if (!row) return null;
  const updated = await prisma.dropiWithdrawal.update({
    where: { id },
    data: { notaAdicional },
  });
  return serialize(updated);
}
