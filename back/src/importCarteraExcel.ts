import * as XLSX from "xlsx";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getExcelCell, parseDateTime, toNumber, toString } from "./excelImportHelpers";

const BATCH_TX_OPTIONS = { maxWait: 60_000, timeout: 300_000 } as const;

/**
 * Import de cartera desde Excel (Dropi).
 * Paridad con Petho `importCartera`; cada movimiento queda ligado a `companyId`.
 * - Hoja `HISTORIAL DE CARTERA` si existe; si no, la primera.
 * - Columnas: ID, FECHA, TIPO, MONTO, MONTO PREVIO, ORDEN ID, NUMERO DE GUIA, DESCRIPCIÓN, CONCEPTO DE RETIRO
 */
export async function importCarteraExcel(
  prisma: PrismaClient,
  companyId: string,
  buffer: Buffer,
): Promise<{ imported: number; errors: string[] }> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName =
    wb.SheetNames.find((s) => s === "HISTORIAL DE CARTERA") || wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;

  if (!ws) {
    throw new Error("No se encontró la hoja HISTORIAL DE CARTERA");
  }

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
    defval: null,
  });

  const errors: string[] = [];
  const registros: Array<{
    id: bigint;
    fecha?: Date;
    tipo?: string;
    monto?: number;
    monto_previo?: number;
    orden_id?: string;
    numero_guia?: string;
    descripcion?: string;
    concepto_retiro?: string;
  }> = [];

  for (const row of rows) {
    try {
      const idNum = toNumber(getExcelCell(row, "ID"));
      if (!idNum) continue;
      const id = BigInt(Math.floor(idNum));

      registros.push({
        id,
        fecha: parseDateTime(getExcelCell(row, "FECHA")),
        tipo: toString(getExcelCell(row, "TIPO")),
        monto: toNumber(getExcelCell(row, "MONTO")),
        monto_previo: toNumber(getExcelCell(row, "MONTO PREVIO")),
        orden_id: toString(getExcelCell(row, "ORDEN ID")),
        numero_guia: toString(getExcelCell(row, "NUMERO DE GUIA", "NÚMERO DE GUIA")),
        descripcion: toString(getExcelCell(row, "DESCRIPCIÓN", "DESCRIPCION")),
        concepto_retiro: toString(getExcelCell(row, "CONCEPTO DE RETIRO")),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Fila cartera ID ${getExcelCell(row, "ID") ?? "?"}: ${msg}`);
    }
  }

  const CHUNK = 40;
  let imported = 0;
  for (let i = 0; i < registros.length; i += CHUNK) {
    const batch = registros.slice(i, i + CHUNK);
    await prisma.$transaction(
      async (tx) => {
        for (const r of batch) {
          await tx.walletMovement.upsert({
            where: {
              companyId_legacyId: { companyId, legacyId: r.id },
            },
            create: {
              companyId,
              legacyId: r.id,
              fecha: r.fecha ?? null,
              tipo: r.tipo ?? null,
              monto: r.monto !== undefined ? new Prisma.Decimal(String(r.monto)) : null,
              montoPrevio: r.monto_previo !== undefined ? new Prisma.Decimal(String(r.monto_previo)) : null,
              ordenId: r.orden_id ?? null,
              numeroGuia: r.numero_guia ?? null,
              descripcion: r.descripcion ?? null,
              conceptoRetiro: r.concepto_retiro ?? null,
            },
            update: {
              fecha: r.fecha ?? null,
              tipo: r.tipo ?? null,
              monto: r.monto !== undefined ? new Prisma.Decimal(String(r.monto)) : null,
              montoPrevio: r.monto_previo !== undefined ? new Prisma.Decimal(String(r.monto_previo)) : null,
              ordenId: r.orden_id ?? null,
              numeroGuia: r.numero_guia ?? null,
              descripcion: r.descripcion ?? null,
              conceptoRetiro: r.concepto_retiro ?? null,
            },
          });
        }
      },
      BATCH_TX_OPTIONS,
    );
    imported += batch.length;
  }

  return { imported, errors };
}
