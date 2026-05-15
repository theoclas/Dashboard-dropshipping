import * as XLSX from "xlsx";
import type { PrismaClient } from "@prisma/client";
import { toString } from "./excelImportHelpers";

const BATCH_TX_OPTIONS = { maxWait: 60_000, timeout: 300_000 } as const;

/**
 * Import de mapeo de estados desde Excel (misma idea que Petho).
 * Filas y reglas equivalentes al original; el alcance es solo la empresa (`companyId`).
 */
export async function importMapeoEstadosExcel(
  prisma: PrismaClient,
  companyId: string,
  buffer: Buffer,
): Promise<{ imported: number; errors: string[] }> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.find((s) => s.toLowerCase().includes("mapeo")) || wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;

  if (!ws) {
    throw new Error("No se encontró la hoja en el archivo Excel");
  }

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
  });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, rawRows.length); i++) {
    const row = rawRows[i];
    if (
      Array.isArray(row) &&
      row.some((cell) => typeof cell === "string" && cell.toLowerCase().includes("estatus_original"))
    ) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('No se encontró la columna "estatus_original" en las primeras filas del Excel');
  }

  const headers = (rawRows[headerRowIndex] as unknown[]).map((h) => (h ? String(h).toLowerCase().trim() : ""));

  const errors: string[] = [];
  const records: Array<{
    transportadora: string;
    estatusOriginal: string;
    ultimoMovimiento: string;
    estadoUnificado: string;
  }> = [];

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!Array.isArray(row) || row.length === 0 || row.every((cell) => cell === null || cell === "")) continue;

    try {
      const getVal = (colNameMatches: string[]) => {
        const index = headers.findIndex((h) => colNameMatches.some((m) => h.includes(m)));
        return index !== -1 ? toString(row[index]) : undefined;
      };

      const estatusOriginal = getVal(["estatus_original", "estatus original"]);
      if (!estatusOriginal) continue;

      records.push({
        transportadora: getVal(["transportadora"]) || "",
        estatusOriginal,
        ultimoMovimiento:
          getVal(["ultimo_movimiento", "último movimiento", "ultimo movimiento"]) || "",
        estadoUnificado: getVal(["estado_unificado", "estado unificado"]) || "SIN MAPEAR",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error en fila ${i + 1}: ${msg}`);
    }
  }

  let imported = 0;
  const CHUNK = 40;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = records.slice(i, i + CHUNK);
    await prisma.$transaction(
      async (tx) => {
        for (const r of batch) {
          await tx.mapeoEstado.upsert({
            where: {
              companyId_transportadora_estatusOriginal_ultimoMovimiento: {
                companyId,
                transportadora: r.transportadora,
                estatusOriginal: r.estatusOriginal,
                ultimoMovimiento: r.ultimoMovimiento,
              },
            },
            update: { estadoUnificado: r.estadoUnificado },
            create: {
              companyId,
              transportadora: r.transportadora,
              estatusOriginal: r.estatusOriginal,
              ultimoMovimiento: r.ultimoMovimiento,
              estadoUnificado: r.estadoUnificado,
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
