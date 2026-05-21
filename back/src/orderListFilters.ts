import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

/** Express puede entregar el mismo query param como array si viene duplicado en la URL. */
export function flattenParams(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    out[k] = Array.isArray(v) ? v[0] : v;
  }
  return out;
}

/** Zod 4: evitar `preprocess(..., z.string().optional())` con claves ausentes (falla con «expected nonoptional»). */
function zTrimmedOptional() {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null) return undefined;
      const s = String(v).trim();
      return s === "" ? undefined : s;
    });
}

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(800).default(50),
  q: zTrimmedOptional(),
  sortField: zTrimmedOptional(),
  sortOrder: z
    .string()
    .optional()
    .transform((v) => {
      if (v == null || v.trim() === "") return undefined;
      const u = v.trim().toUpperCase();
      return u === "ASC" || u === "DESC" ? (u as "ASC" | "DESC") : undefined;
    }),
  startDate: zTrimmedOptional(),
  endDate: zTrimmedOptional(),
  id: zTrimmedOptional(),
  id_dropi: zTrimmedOptional(),
  estado_unificado: zTrimmedOptional(),
  transportadora: zTrimmedOptional(),
  ciudad: zTrimmedOptional(),
  cliente: zTrimmedOptional(),
  telefono: zTrimmedOptional(),
  guia: zTrimmedOptional(),
  notas_manuales: zTrimmedOptional(),
  estado_operativo: zTrimmedOptional(),
  notas: zTrimmedOptional(),
  estatus_original: zTrimmedOptional(),
  ultimo_mov: zTrimmedOptional(),
  estado_cartera: zTrimmedOptional(),
  venta: zTrimmedOptional(),
  ganancia_calc: zTrimmedOptional(),
  flete: zTrimmedOptional(),
  cartera: zTrimmedOptional(),
  dias_desde_ult_mov: zTrimmedOptional(),
  fecha_contains: zTrimmedOptional(),
  departamento: zTrimmedOptional(),
  direccion: zTrimmedOptional(),
  cartera_aplicada: zTrimmedOptional(),
  fecha_ult_mov: zTrimmedOptional(),
  tipo_tienda: zTrimmedOptional(),
  tienda: zTrimmedOptional(),
  vendedor: zTrimmedOptional(),
  tipo_envio: zTrimmedOptional(),
  email_cliente: zTrimmedOptional(),
  observacion_dropi: zTrimmedOptional(),
  tags: zTrimmedOptional(),
  codigo_postal: zTrimmedOptional(),
  id_orden_tienda: zTrimmedOptional(),
  numero_pedido_tienda: zTrimmedOptional(),
  usuario_generacion_guia: zTrimmedOptional(),
  costo_proveedor: zTrimmedOptional(),
  costo_devolucion_estimado: zTrimmedOptional(),
  /** `true` / `1` / `ok`: cartera en OK; `false` / `0` / `no`: sin OK o vacío. */
  cartera_ok: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === "boolean") return v;
      const s = String(v).trim().toLowerCase();
      if (s === "1" || s === "true" || s === "ok" || s === "yes" || s === "si") return true;
      if (s === "0" || s === "false" || s === "no") return false;
      return undefined;
    }),
  /** Producto del catálogo (vínculos Dropi en Productos de pedidos). */
  catalog_product_id: zTrimmedOptional(),
  /** `1` / `true`: solo pedidos sin número de guía (logística). */
  guia_blank: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null) return false;
      if (typeof v === "boolean") return v;
      const s = String(v).trim().toLowerCase();
      return s === "1" || s === "true" || s === "yes";
    }),
});

export type OrderListQueryParsed = z.infer<typeof orderListQuerySchema>;

export const orderExportBodySchema = orderListQuerySchema.omit({ page: true, limit: true });

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function likePattern(t: string): string {
  return `%${escapeLike(t.trim())}%`;
}

async function idsCastLike(
  prisma: PrismaClient,
  companyId: string,
  column: Prisma.Sql,
  search: string,
): Promise<string[]> {
  const pat = likePattern(search);
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT \`id\` FROM \`pedidos\` WHERE \`companyId\` = ${companyId} AND ${column} IS NOT NULL AND CAST(${column} AS CHAR) LIKE ${pat}`,
  );
  return rows.map((r) => r.id);
}

const CAST_FILTER_CONFIG: { filterKey: keyof OrderListQueryParsed; column: Prisma.Sql }[] = [
  { filterKey: "fecha_contains", column: Prisma.sql`pedidos.fecha` },
  { filterKey: "venta", column: Prisma.sql`pedidos.venta` },
  { filterKey: "ganancia_calc", column: Prisma.sql`pedidos.ganancia_calc` },
  { filterKey: "flete", column: Prisma.sql`pedidos.flete` },
  { filterKey: "cartera", column: Prisma.sql`pedidos.cartera` },
  { filterKey: "costo_proveedor", column: Prisma.sql`pedidos.costo_proveedor` },
  { filterKey: "costo_devolucion_estimado", column: Prisma.sql`pedidos.costo_devolucion_estimado` },
  { filterKey: "dias_desde_ult_mov", column: Prisma.sql`pedidos.dias_desde_ult_mov` },
  { filterKey: "cartera_aplicada", column: Prisma.sql`pedidos.cartera_aplicada` },
];

/** Restringe por id cuando hay filtros que requieren CAST en SQL (como en Petho). */
export async function narrowOrderIdsByCastFilters(
  prisma: PrismaClient,
  companyId: string,
  f: OrderListQueryParsed,
): Promise<string[] | undefined> {
  const jobs: Promise<string[]>[] = [];
  for (const { filterKey, column } of CAST_FILTER_CONFIG) {
    const v = f[filterKey];
    if (typeof v !== "string" || !v.trim()) continue;
    jobs.push(idsCastLike(prisma, companyId, column, v));
  }
  if (jobs.length === 0) return undefined;

  const results = await Promise.all(jobs);
  let acc = results[0]!;
  for (let i = 1; i < results.length; i++) {
    const set = new Set(results[i]);
    acc = acc.filter((id) => set.has(id));
    if (acc.length === 0) return [];
  }
  return acc;
}

/** Pedidos cuyas líneas en `productos_detalle` coinciden con variantes vinculadas al producto de catálogo. */
export async function externalOrderIdsForCatalogProduct(
  prisma: PrismaClient,
  companyId: string,
  catalogProductId: string,
): Promise<string[]> {
  const product = await prisma.catalogProduct.findFirst({
    where: { id: catalogProductId, companyId },
    select: { id: true },
  });
  if (!product) return [];

  const links = await prisma.catalogProductDropiLink.findMany({
    where: { companyId, catalogProductId },
    select: { productoId: true, sku: true, variacionId: true },
  });
  const validLinks = links.filter((l) => l.productoId != null && String(l.productoId).trim() !== "");
  if (validLinks.length === 0) return [];

  const orClause: Prisma.ProductDetailWhereInput[] = validLinks.map((l) => ({
    companyId,
    productoId: l.productoId!,
    sku: l.sku,
    variacionId: l.variacionId,
  }));

  const detailMatches = await prisma.productDetail.findMany({
    where: { OR: orClause },
    select: { pedidoIdDropi: true },
    distinct: ["pedidoIdDropi"],
  });
  return detailMatches.map((r) => r.pedidoIdDropi).filter(Boolean);
}

function addContains(and: Prisma.OrderWhereInput[], field: string, val?: string) {
  const t = val?.trim();
  if (!t) return;
  and.push({ [field]: { contains: t } } as Prisma.OrderWhereInput);
}

export function buildPrismaOrderWhere(
  companyId: string,
  f: OrderListQueryParsed,
  narrowedIds: string[] | undefined,
  catalogProductExternalIds?: string[],
): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [{ companyId }];

  if (narrowedIds !== undefined) {
    and.push({ id: { in: narrowedIds } });
  }

  if (catalogProductExternalIds && catalogProductExternalIds.length > 0) {
    and.push({ externalOrderId: { in: catalogProductExternalIds } });
  }

  if (f.startDate && f.endDate) {
    const [y0, m0, d0] = f.startDate.split("-").map(Number);
    const [y1, m1, d1] = f.endDate.split("-").map(Number);
    if ([y0, m0, d0, y1, m1, d1].every((n) => Number.isFinite(n))) {
      const start = new Date(Date.UTC(y0, m0 - 1, d0, 0, 0, 0, 0));
      const end = new Date(Date.UTC(y1, m1 - 1, d1, 23, 59, 59, 999));
      and.push({ fecha: { gte: start, lte: end } });
    }
  }

  addContains(and, "id", f.id);
  addContains(and, "externalOrderId", f.id_dropi);
  addContains(and, "estadoUnificado", f.estado_unificado);
  addContains(and, "transportadora", f.transportadora);
  addContains(and, "ciudad", f.ciudad);
  addContains(and, "cliente", f.cliente);
  addContains(and, "telefono", f.telefono);
  addContains(and, "guia", f.guia);
  addContains(and, "notasManuales", f.notas_manuales);
  addContains(and, "estadoOperativo", f.estado_operativo);
  addContains(and, "notas", f.notas);
  addContains(and, "estatusOriginal", f.estatus_original);
  addContains(and, "ultimoMov", f.ultimo_mov);
  addContains(and, "estadoCartera", f.estado_cartera);
  if (f.cartera_ok === true) {
    and.push({ estadoCartera: "OK" });
  } else if (f.cartera_ok === false) {
    and.push({
      OR: [{ estadoCartera: null }, { estadoCartera: "" }, { estadoCartera: { not: "OK" } }],
    });
  }
  addContains(and, "departamento", f.departamento);
  addContains(and, "direccion", f.direccion);
  addContains(and, "tipoTienda", f.tipo_tienda);
  addContains(and, "tienda", f.tienda);
  addContains(and, "vendedor", f.vendedor);
  addContains(and, "tipoEnvio", f.tipo_envio);
  addContains(and, "emailCliente", f.email_cliente);
  addContains(and, "observacionDropi", f.observacion_dropi);
  addContains(and, "tags", f.tags);
  addContains(and, "codigoPostal", f.codigo_postal);
  addContains(and, "idOrdenTienda", f.id_orden_tienda);
  addContains(and, "numeroPedidoTienda", f.numero_pedido_tienda);
  addContains(and, "usuarioGeneracionGuia", f.usuario_generacion_guia);

  if (f.guia_blank) {
    and.push({
      OR: [{ guia: null }, { guia: "" }],
    });
  }

  const qt = f.q?.trim();
  if (qt) {
    and.push({
      OR: [
        { id: { contains: qt } },
        { externalOrderId: { contains: qt } },
        { cliente: { contains: qt } },
        { ciudad: { contains: qt } },
        { guia: { contains: qt } },
        { estadoUnificado: { contains: qt } },
        { telefono: { contains: qt } },
      ],
    });
  }

  return { AND: and };
}

export function buildOrderOrderBy(f: OrderListQueryParsed): Prisma.OrderOrderByWithRelationInput[] {
  const dir: Prisma.SortOrder = f.sortOrder === "ASC" ? "asc" : "desc";
  const sf = f.sortField?.trim() || "id";

  const primary = ((): Prisma.OrderOrderByWithRelationInput => {
    switch (sf) {
      case "id":
        return { id: dir };
      case "id_dropi":
        return { externalOrderId: dir };
      case "fecha":
        return { fecha: dir };
      case "cliente":
        return { cliente: dir };
      case "telefono":
        return { telefono: dir };
      case "ciudad":
        return { ciudad: dir };
      case "departamento":
        return { departamento: dir };
      case "direccion":
        return { direccion: dir };
      case "notas_manuales":
        return { notasManuales: dir };
      case "transportadora":
        return { transportadora: dir };
      case "guia":
        return { guia: dir };
      case "estado_operativo":
        return { estadoOperativo: dir };
      case "venta":
        return { venta: dir };
      case "ganancia_calc":
        return { gananciaCalc: dir };
      case "flete":
        return { flete: dir };
      case "cartera":
        return { cartera: dir };
      case "costo_proveedor":
        return { costoProveedor: dir };
      case "costo_devolucion_estimado":
        return { costoDevolucionEstimado: dir };
      case "estado_cartera":
      case "cartera_ok":
        return { estadoCartera: dir };
      case "dias_desde_ult_mov":
        return { diasDesdeUltMov: dir };
      case "notas":
        return { notas: dir };
      case "estatus_original":
        return { estatusOriginal: dir };
      case "ultimo_mov":
        return { ultimoMov: dir };
      case "estado_unificado":
        return { estadoUnificado: dir };
      case "fecha_ult_mov":
        return { fechaUltMov: dir };
      case "cartera_aplicada":
        return { carteraAplicada: dir };
      case "hora_ult_mov":
        return { horaUltMov: dir };
      case "tipo_tienda":
        return { tipoTienda: dir };
      case "tienda":
        return { tienda: dir };
      case "vendedor":
        return { vendedor: dir };
      case "tipo_envio":
        return { tipoEnvio: dir };
      case "email_cliente":
        return { emailCliente: dir };
      case "codigo_postal":
        return { codigoPostal: dir };
      case "fecha_generacion_guia":
        return { fechaGeneracionGuia: dir };
      case "created_at":
        return { createdAt: dir };
      case "updated_at":
        return { updatedAt: dir };
      default:
        return { createdAt: "desc" };
    }
  })();

  const out: Prisma.OrderOrderByWithRelationInput[] = [primary];
  if (sf !== "id") {
    out.push({ id: "desc" });
  }
  return out;
}
