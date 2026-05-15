import * as XLSX from "xlsx";
import { Prisma, type PrismaClient } from "@prisma/client";
import { applyCpaDerivedFields, type CpaRowLike } from "./cpaDerivedFields";
import { rowLikeToPrismaCreateManyInput, type CpaComputedRow } from "./cpaRecordService";
import { getExcelCell, parseDate, toCpaNullableNumber, toString } from "./excelImportHelpers";

/**
 * Import de CPA desde Excel: hoja `input_data` / `Sheet1`, cabeceras flexibles.
 * Reemplaza todos los registros CPA de la empresa (import completo).
 */
export async function importCpaExcel(
  prisma: PrismaClient,
  companyId: string,
  buffer: Buffer,
): Promise<{ imported: number; errors: string[] }> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName =
    wb.SheetNames.find((s) => s.toLowerCase().replace(/\s+/g, "_") === "input_data") ||
    wb.SheetNames.find((s) => s === "Sheet1") ||
    wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;

  if (!ws) {
    throw new Error(`No se encontró una hoja válida en el Excel. Hojas: ${wb.SheetNames.join(", ")}`);
  }

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
    defval: null,
  });

  const errors: string[] = [];
  const toCreate: Prisma.CpaRecordCreateManyInput[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const excelRow = idx + 2;

    try {
      const fecha = parseDate(getExcelCell(row, "Fecha", "FECHA", "Date", "DATE", "Día", "Dia"));
      const producto = toString(
        getExcelCell(row, "Producto", "PRODUCTO", "Product", "SKU", "Nombre producto"),
      );

      if (!fecha && !producto) continue;
      if (!fecha || !producto) {
        errors.push(`Fila ${excelRow}: se requieren fecha y producto`);
        continue;
      }

      const cuentaRaw = toString(
        getExcelCell(
          row,
          "Cuenta publicitaria",
          "Cuenta Publicitaria",
          "CUENTA PUBLICITARIA",
          "Cuenta",
          "CUENTA",
          "Cuenta pub",
          "Cuenta Pub.",
          "Account",
        ),
      );
      const cuenta_publicitaria = cuentaRaw ?? "";

      const cpaData: CpaRowLike & { semana?: string; fecha?: Date; producto?: string; cuenta_publicitaria?: string } = {
        semana: toString(getExcelCell(row, "SEMANA", "Semana", "Week", "Semana mes")),
        fecha,
        producto,
        cuenta_publicitaria,
        gasto_publicidad: toCpaNullableNumber(
          getExcelCell(
            row,
            "GASTO PUBLICIDAD",
            "Gasto publicidad",
            "Gasto Publicidad",
            "Gasto pub",
            "Gasto Pub.",
            "Gasto Pub",
            "GASTO PUB",
          ),
        ),
        conversaciones: toCpaNullableNumber(
          getExcelCell(row, "CONVERSACIONES", "Conversaciones", "Conversiones"),
        ),
        total_facturado: toCpaNullableNumber(
          getExcelCell(row, "TOTAL FACTURADO", "Total facturado", "Total Facturado"),
        ),
        ganancia_promedio: toCpaNullableNumber(
          getExcelCell(row, "GANANCIA PROMEDIO", "Ganancia promedio", "Ganancia Promedio"),
        ),
        ventas: toCpaNullableNumber(getExcelCell(row, "VENTAS", "Ventas", "Unidades", "Cantidad ventas")),
        ticket_promedio_producto: toCpaNullableNumber(
          getExcelCell(
            row,
            "TICKET PROMEDIO DE PRODUCTO   ",
            "TICKET PROMEDIO DE PRODUCTO",
            "Ticket promedio de producto",
            "Ticket promedio producto",
            "Ticket Promedio",
          ),
        ),
        cpa: toCpaNullableNumber(getExcelCell(row, "CPA", "Cpa", "Costo por adquisición")),
        conversion_rate: toCpaNullableNumber(
          getExcelCell(row, "CONVERSION RATE", "Conversion rate", "Conversion Rate", "Tasa conversión"),
        ),
        costo_publicitario: toCpaNullableNumber(
          getExcelCell(row, "COSTO PUBLICITARIO", "Costo publicitario", "Costo Publicitario"),
        ),
        rentabilidad: toCpaNullableNumber(getExcelCell(row, "RENTABILIDAD", "Rentabilidad")),
        utilidad_aproximada: toCpaNullableNumber(
          getExcelCell(
            row,
            "UTILIDAD APROXIMADA",
            "Utilidad aproximada",
            "Utilidad Aproximada",
            "UTILIDAD APROX",
          ),
        ),
      };

      applyCpaDerivedFields(cpaData);

      toCreate.push(rowLikeToPrismaCreateManyInput(companyId, cpaData as CpaComputedRow));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Fila ${excelRow}: ${msg}`);
    }
  }

  const imported = await prisma.$transaction(async (tx) => {
    await tx.cpaRecord.deleteMany({ where: { companyId } });
    if (toCreate.length === 0) return 0;
    const BATCH = 500;
    let n = 0;
    for (let i = 0; i < toCreate.length; i += BATCH) {
      const slice = toCreate.slice(i, i + BATCH);
      const r = await tx.cpaRecord.createMany({ data: slice });
      n += r.count;
    }
    return n;
  });

  return { imported, errors };
}
