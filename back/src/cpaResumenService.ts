import { prisma } from "./prisma";
import { applyCpaDerivedFields, type CpaRowLike } from "./cpaDerivedFields";

const MES_FULL_ES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

const MES_ABR_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"] as const;

const MES_ABR_DISPLAY = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function utcDayStart(y: number, mo: number, d: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

function ymdKey(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mesLabelFull(mo: number): string {
  return MES_FULL_ES[mo - 1] ?? String(mo);
}

export function semanaDelMesLabel(_y: number, mo: number, d: number): string {
  const n = Math.min(4, Math.ceil(d / 7));
  const mes = MES_ABR_ES[mo - 1] ?? String(mo);
  return `SEMANA ${n} - ${mes}`;
}

export function fechaDisplayDdMmm(y: number, mo: number, d: number): string {
  const abr = MES_ABR_DISPLAY[mo - 1] ?? String(mo);
  return `${d}-${abr}`;
}

export type CpaResumenMetrics = {
  gastoPublicidad: number;
  conversaciones: number;
  ventas: number;
  gananciaPromedio: number | null;
  cpa: number | null;
  utilidadAproximada: number | null;
};

type RawAggInput = {
  gastoPublicidad?: unknown;
  conversaciones?: number | null;
  ventas?: number | null;
  totalFacturado?: unknown;
  gananciaPromedio?: unknown;
};

export function aggregateCpaResumenMetrics(rows: RawAggInput[]): CpaResumenMetrics {
  let gasto = 0;
  let conversaciones = 0;
  let ventas = 0;
  let totalFacturado = 0;
  let ganWeighted = 0;
  let ventasForGan = 0;

  for (const r of rows) {
    gasto += num(r.gastoPublicidad);
    conversaciones += r.conversaciones ?? 0;
    ventas += r.ventas ?? 0;
    totalFacturado += num(r.totalFacturado);
    const v = r.ventas ?? 0;
    if (v > 0 && r.gananciaPromedio != null) {
      const g = num(r.gananciaPromedio);
      if (g !== 0) {
        ganWeighted += g * v;
        ventasForGan += v;
      }
    }
  }

  const rowLike: CpaRowLike = {
    gasto_publicidad: gasto,
    conversaciones,
    ventas,
    total_facturado: totalFacturado,
    ganancia_promedio: ventasForGan > 0 ? ganWeighted / ventasForGan : null,
  };
  applyCpaDerivedFields(rowLike);

  return {
    gastoPublicidad: gasto,
    conversaciones,
    ventas,
    gananciaPromedio: rowLike.ganancia_promedio ?? null,
    cpa: rowLike.cpa ?? null,
    utilidadAproximada: rowLike.utilidad_aproximada ?? null,
  };
}

export type CpaResumenRowKind =
  | "month"
  | "week"
  | "day"
  | "product"
  | "weekTotal"
  | "monthTotal"
  | "grandTotal";

export type CpaResumenRow = {
  key: string;
  kind: CpaResumenRowKind;
  meses: string;
  semana: string;
  fecha: string | null;
  producto: string | null;
  children?: CpaResumenRow[];
} & CpaResumenMetrics;

type ProductEntry = RawAggInput & {
  catalogProductId: string;
  producto: string;
};

type DayBucket = {
  y: number;
  m: number;
  d: number;
  ymd: string;
  mesLabel: string;
  semanaLabel: string;
  fechaLabel: string;
  products: ProductEntry[];
};

function metricsToRow(
  key: string,
  kind: CpaResumenRowKind,
  meses: string,
  semana: string,
  fecha: string | null,
  producto: string | null,
  source: RawAggInput[],
  children?: CpaResumenRow[],
): CpaResumenRow {
  return {
    key,
    kind,
    meses,
    semana,
    fecha,
    producto,
    ...aggregateCpaResumenMetrics(source),
    ...(children && children.length > 0 ? { children } : {}),
  };
}

function productToRow(day: DayBucket, product: ProductEntry): CpaResumenRow {
  return metricsToRow(
    `prod-${day.ymd}-${product.catalogProductId}`,
    "product",
    "",
    "",
    null,
    product.producto,
    [product],
  );
}

function dayToRow(day: DayBucket): CpaResumenRow {
  const products = [...day.products].sort((a, b) => a.producto.localeCompare(b.producto, "es"));
  const productRows = products.map((p) => productToRow(day, p));
  return metricsToRow(`day-${day.ymd}`, "day", "", "", day.fechaLabel, null, products, productRows);
}

function weekToRow(weekLabel: string, days: DayBucket[], mesesLabel: string): CpaResumenRow {
  const dayRows = days.map(dayToRow);
  const allProducts = days.flatMap((d) => d.products);
  const weekTotal = metricsToRow(
    `wt-${days[0]!.ymd}-${weekLabel}`,
    "weekTotal",
    "",
    `Total ${weekLabel}`,
    null,
    null,
    allProducts,
  );
  return metricsToRow(
    `week-${days[0]!.ymd}-${weekLabel}`,
    "week",
    mesesLabel,
    weekLabel,
    null,
    null,
    allProducts,
    [...dayRows, weekTotal],
  );
}

function monthToRow(monthLabel: string, weeks: Array<{ weekLabel: string; days: DayBucket[] }>): CpaResumenRow {
  const weekRows = weeks.map((w, i) => weekToRow(w.weekLabel, w.days, i === 0 ? monthLabel : ""));
  const allProducts = weeks.flatMap((w) => w.days.flatMap((d) => d.products));
  const monthTotal = metricsToRow(`mt-${monthLabel}`, "monthTotal", `Total ${monthLabel}`, "", null, null, allProducts);
  return metricsToRow(`month-${monthLabel}`, "month", monthLabel, "", null, null, allProducts, [...weekRows, monthTotal]);
}

/** Árbol mes → semana → día → producto, como tabla dinámica del Excel RESUMEN_DIARIO. */
export function buildCpaResumenTree(dayBuckets: DayBucket[]): CpaResumenRow[] {
  if (dayBuckets.length === 0) return [];

  const sorted = [...dayBuckets].sort((a, b) => a.ymd.localeCompare(b.ymd));
  const months: CpaResumenRow[] = [];

  for (const monthGroup of groupBy(sorted, (d) => `${d.y}-${d.m}`)) {
    const daysInMonth = monthGroup.items;
    const monthLabel = daysInMonth[0]!.mesLabel;
    const weeks = groupBy(daysInMonth, (d) => d.semanaLabel).map((wg) => ({
      weekLabel: wg.items[0]!.semanaLabel,
      days: wg.items,
    }));
    months.push(monthToRow(monthLabel, weeks));
  }

  const allProducts = sorted.flatMap((d) => d.products);
  const grandTotal = metricsToRow("grand-total", "grandTotal", "Total general", "", null, null, allProducts);

  return [...months, grandTotal];
}

/** @deprecated Usar buildCpaResumenTree. Aplana el árbol para tests legacy. */
export function buildCpaResumenRows(dayBuckets: DayBucket[]): CpaResumenRow[] {
  const flat: CpaResumenRow[] = [];
  const walk = (nodes: CpaResumenRow[]) => {
    for (const n of nodes) {
      const { children, ...rest } = n;
      flat.push(rest);
      if (children) walk(children);
    }
  };
  walk(buildCpaResumenTree(dayBuckets));
  return flat;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Array<{ key: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()].map(([key, groupItems]) => ({ key, items: groupItems }));
}

export async function getCpaResumen(
  companyId: string,
  opts: { desde: string; hasta: string },
): Promise<{ desde: string; hasta: string; rows: CpaResumenRow[] }> {
  const desde = parseYmd(opts.desde);
  const hasta = parseYmd(opts.hasta);
  if (!desde || !hasta) {
    throw new Error("Rango de fechas inválido (usa YYYY-MM-DD).");
  }
  if (ymdKey(desde.y, desde.m, desde.d) > ymdKey(hasta.y, hasta.m, hasta.d)) {
    throw new Error("La fecha «desde» no puede ser posterior a «hasta».");
  }

  const records = await prisma.cpaExperimentalRecord.findMany({
    where: {
      companyId,
      fecha: {
        gte: utcDayStart(desde.y, desde.m, desde.d),
        lte: utcDayStart(hasta.y, hasta.m, hasta.d),
      },
    },
    select: {
      catalogProductId: true,
      fecha: true,
      semana: true,
      producto: true,
      gastoPublicidad: true,
      conversaciones: true,
      ventas: true,
      totalFacturado: true,
      gananciaPromedio: true,
      catalogProduct: { select: { name: true } },
    },
    orderBy: [{ fecha: "asc" }, { producto: "asc" }],
  });

  const byDay = new Map<string, DayBucket>();

  for (const rec of records) {
    const dt = rec.fecha;
    const y = dt.getUTCFullYear();
    const mo = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    const ymd = ymdKey(y, mo, d);
    let bucket = byDay.get(ymd);
    if (!bucket) {
      bucket = {
        y,
        m: mo,
        d,
        ymd,
        mesLabel: mesLabelFull(mo),
        semanaLabel: rec.semana?.trim() || semanaDelMesLabel(y, mo, d),
        fechaLabel: fechaDisplayDdMmm(y, mo, d),
        products: [],
      };
      byDay.set(ymd, bucket);
    }
    const producto = rec.producto?.trim() || rec.catalogProduct?.name?.trim() || "Sin producto";
    bucket.products.push({
      catalogProductId: rec.catalogProductId,
      producto,
      gastoPublicidad: rec.gastoPublicidad,
      conversaciones: rec.conversaciones,
      ventas: rec.ventas,
      totalFacturado: rec.totalFacturado,
      gananciaPromedio: rec.gananciaPromedio,
    });
  }

  const rows = buildCpaResumenTree([...byDay.values()]);

  return {
    desde: opts.desde,
    hasta: opts.hasta,
    rows,
  };
}
