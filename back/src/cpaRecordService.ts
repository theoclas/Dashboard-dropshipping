/**
 * @deprecated Servicio CPA clásico (tabla `cpas`, import Excel manual).
 * El producto usa CPA experimental (`cpaExperimentalService`); estas rutas se mantienen por compatibilidad.
 */
import { Prisma, type CpaRecord, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { applyCpaDerivedFields, type CpaRowLike } from "./cpaDerivedFields";

function decOrNull(n: number | null | undefined): Prisma.Decimal | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return new Prisma.Decimal(String(n));
}

const numOpt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  });

const intOpt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
    const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const fechaStr = z
  .string()
  .trim()
  .min(1)
  .refine((s) => /^\d{4}-\d{2}-\d{2}/.test(s), "Fecha inválida (YYYY-MM-DD)");

export const cpaRecordCreateBodySchema = z.object({
  semana: z.string().max(50).optional().nullable(),
  fecha: fechaStr,
  producto: z.string().min(1).max(255),
  cuentaPublicitaria: z.string().max(255).optional().nullable(),
  gastoPublicidad: numOpt,
  conversaciones: intOpt,
  totalFacturado: numOpt,
  gananciaPromedio: numOpt,
  ventas: intOpt,
});

export const cpaRecordUpdateBodySchema = cpaRecordCreateBodySchema.partial();

export type CpaCreateBody = z.infer<typeof cpaRecordCreateBodySchema>;
export type CpaUpdateBody = z.infer<typeof cpaRecordUpdateBodySchema>;

function parseFecha(s: string): Date {
  const d = s.slice(0, 10);
  return new Date(`${d}T12:00:00.000Z`);
}

export function buildCpaRowLikeFromCreateBody(body: CpaCreateBody): CpaComputedRow {
  const row: CpaComputedRow = {
    semana: body.semana ?? undefined,
    fecha: parseFecha(body.fecha),
    producto: body.producto,
    cuenta_publicitaria: body.cuentaPublicitaria ?? "",
    gasto_publicidad: body.gastoPublicidad ?? null,
    conversaciones: body.conversaciones ?? null,
    total_facturado: body.totalFacturado ?? null,
    ganancia_promedio: body.gananciaPromedio ?? null,
    ventas: body.ventas ?? null,
    ticket_promedio_producto: null,
    cpa: null,
    conversion_rate: null,
    costo_publicitario: null,
    rentabilidad: null,
    utilidad_aproximada: null,
  };
  applyCpaDerivedFields(row);
  return row;
}

function recordToCreateBodyShape(r: CpaRecord): CpaCreateBody {
  const ymd = r.fecha ? r.fecha.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return {
    semana: r.semana,
    fecha: ymd,
    producto: r.producto ?? "",
    cuentaPublicitaria: r.cuentaPublicitaria,
    gastoPublicidad: r.gastoPublicidad != null ? Number(r.gastoPublicidad) : null,
    conversaciones: r.conversaciones,
    totalFacturado: r.totalFacturado != null ? Number(r.totalFacturado) : null,
    gananciaPromedio: r.gananciaPromedio != null ? Number(r.gananciaPromedio) : null,
    ventas: r.ventas,
  };
}

export function mergeCpaUpdate(existing: CpaRecord, patch: CpaUpdateBody): CpaComputedRow {
  const base = recordToCreateBodyShape(existing);
  const merged: CpaCreateBody = {
    ...base,
    ...(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as CpaUpdateBody),
  };
  if (!merged.fecha?.trim() && existing.fecha) merged.fecha = existing.fecha.toISOString().slice(0, 10);
  if (!merged.producto?.trim() && existing.producto) merged.producto = existing.producto ?? "";
  return buildCpaRowLikeFromCreateBody(merged);
}

export type CpaComputedRow = CpaRowLike & {
  semana?: string | null;
  fecha?: Date;
  producto: string;
  cuenta_publicitaria?: string;
};

export function rowLikeToPrismaCreateManyInput(companyId: string, cpaData: CpaComputedRow): Prisma.CpaRecordCreateManyInput {
  return {
    companyId,
    semana: cpaData.semana ?? null,
    fecha: cpaData.fecha ?? null,
    producto: cpaData.producto ?? null,
    cuentaPublicitaria: cpaData.cuenta_publicitaria || null,
    gastoPublicidad: decOrNull(cpaData.gasto_publicidad ?? null),
    conversaciones: cpaData.conversaciones != null ? Math.trunc(cpaData.conversaciones) : null,
    totalFacturado: decOrNull(cpaData.total_facturado ?? null),
    gananciaPromedio: decOrNull(cpaData.ganancia_promedio ?? null),
    ventas: cpaData.ventas != null ? Math.trunc(cpaData.ventas) : null,
    ticketPromedioProducto: decOrNull(cpaData.ticket_promedio_producto ?? null),
    cpa: decOrNull(cpaData.cpa ?? null),
    conversionRate: decOrNull(cpaData.conversion_rate ?? null),
    costoPublicitario: decOrNull(cpaData.costo_publicitario ?? null),
    rentabilidad: decOrNull(cpaData.rentabilidad ?? null),
    utilidadAproximada: decOrNull(cpaData.utilidad_aproximada ?? null),
  };
}

export async function createCpaRecord(prisma: PrismaClient, companyId: string, body: unknown): Promise<CpaRecord> {
  const parsed = cpaRecordCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const parts = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()];
    throw new Error(parts.filter(Boolean).join("; ") || "Datos inválidos");
  }
  const row = buildCpaRowLikeFromCreateBody(parsed.data);
  const data = rowLikeToPrismaCreateManyInput(companyId, row);
  return prisma.cpaRecord.create({
    data: data as Prisma.CpaRecordUncheckedCreateInput,
  });
}

export async function updateCpaRecord(
  prisma: PrismaClient,
  companyId: string,
  id: string,
  body: unknown,
): Promise<CpaRecord> {
  const existing = await prisma.cpaRecord.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error("Registro CPA no encontrado.");
  const parsed = cpaRecordUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const parts = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()];
    throw new Error(parts.filter(Boolean).join("; ") || "Datos inválidos");
  }
  const row = mergeCpaUpdate(existing, parsed.data);
  const data = rowLikeToPrismaCreateManyInput(companyId, row);
  const { companyId: _cid, ...rest } = data;
  return prisma.cpaRecord.update({
    where: { id },
    data: rest,
  });
}

export async function deleteCpaRecord(prisma: PrismaClient, companyId: string, id: string): Promise<void> {
  const r = await prisma.cpaRecord.deleteMany({ where: { id, companyId } });
  if (r.count === 0) throw new Error("Registro CPA no encontrado.");
}
