import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { applyCpaDerivedFields, type CpaRowLike } from "./cpaDerivedFields";
import { spendFromMetaExcelSnapshot } from "./metaCampaignExcelParse";
import { isPedidoCanceladoORechazado } from "./pedidoFinancials";

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** Inicio del día UTC para `@db.Date` / comparaciones estables. */
function utcDayStart(y: number, mo: number, d: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

function utcDayEnd(y: number, mo: number, d: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
}

const MES_ABR_ES = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

/** Misma idea que la plantilla Excel: "SEMANA 1 - MAYO". */
function semanaDelMesLabel(_y: number, mo: number, d: number): string {
  const n = Math.min(4, Math.ceil(d / 7));
  const mes = MES_ABR_ES[mo - 1] ?? String(mo);
  return `SEMANA ${n} - ${mes}`;
}

function addUtcDays(y: number, mo: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, mo - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function dateLTE(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): boolean {
  if (a.y !== b.y) return a.y < b.y;
  if (a.m !== b.m) return a.m < b.m;
  return a.d <= b.d;
}

function fechaYmdKey(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

type CpaExperimentalDbRow = Awaited<
  ReturnType<
    typeof prisma.cpaExperimentalRecord.findMany<{
      include: {
        catalogProduct: { select: { id: true; name: true; sku: true } };
        advertisingAccount: { select: { id: true; metaAccountId: true; businessName: true } };
      };
    }>
  >
>[number];

/** Suma filas diarias de varias cuentas en una fila por producto + día y recalcula columnas derivadas. */
function aggregateCpaExperimentalByDay(rows: CpaExperimentalDbRow[]): CpaExperimentalDbRow[] {
  const byDay = new Map<string, CpaExperimentalDbRow[]>();
  for (const r of rows) {
    const key = fechaYmdKey(r.fecha);
    const list = byDay.get(key);
    if (list) list.push(r);
    else byDay.set(key, [r]);
  }

  const aggregated: CpaExperimentalDbRow[] = [];
  for (const [dayKey, group] of byDay) {
    const first = group[0]!;
    let gasto = 0;
    let conversaciones = 0;
    let totalFacturado = 0;
    let ventas = 0;
    let ganWeighted = 0;
    let ventasForGan = 0;

    for (const r of group) {
      if (r.gastoPublicidad != null) {
        const n = Number(r.gastoPublicidad);
        if (Number.isFinite(n)) gasto += n;
      }
      conversaciones += r.conversaciones ?? 0;
      if (r.totalFacturado != null) {
        const n = Number(r.totalFacturado);
        if (Number.isFinite(n)) totalFacturado += n;
      }
      const v = r.ventas ?? 0;
      ventas += v;
      if (v > 0 && r.gananciaPromedio != null) {
        const g = Number(r.gananciaPromedio);
        if (Number.isFinite(g)) {
          ganWeighted += g * v;
          ventasForGan += v;
        }
      }
    }

    const gananciaPromedio = ventasForGan > 0 ? ganWeighted / ventasForGan : null;
    const rowLike: CpaRowLike = {
      semana: first.semana ?? undefined,
      fecha: first.fecha,
      producto: first.producto ?? first.catalogProduct?.name ?? undefined,
      cuenta_publicitaria: "Todas las cuentas",
      gasto_publicidad: gasto > 0 ? gasto : null,
      conversaciones: conversaciones > 0 ? conversaciones : null,
      total_facturado: totalFacturado > 0 ? totalFacturado : null,
      ganancia_promedio: gananciaPromedio,
      ventas,
    };
    applyCpaDerivedFields(rowLike);

    aggregated.push({
      ...first,
      id: `agg:${first.catalogProductId}:${dayKey}`,
      advertisingAccountId: "",
      fecha: first.fecha,
      semana: rowLike.semana ?? null,
      producto: rowLike.producto ?? null,
      cuentaPublicitaria: rowLike.cuenta_publicitaria ?? null,
      gastoPublicidad: rowLike.gasto_publicidad ?? null,
      conversaciones: rowLike.conversaciones != null ? Math.trunc(rowLike.conversaciones) : null,
      totalFacturado: rowLike.total_facturado ?? null,
      gananciaPromedio: rowLike.ganancia_promedio ?? null,
      ventas: rowLike.ventas != null ? Math.trunc(rowLike.ventas) : null,
      ticketPromedioProducto: rowLike.ticket_promedio_producto ?? null,
      cpa: rowLike.cpa ?? null,
      conversionRate: rowLike.conversion_rate ?? null,
      costoPublicitario: rowLike.costo_publicitario ?? null,
      rentabilidad: rowLike.rentabilidad ?? null,
      utilidadAproximada: rowLike.utilidad_aproximada ?? null,
    } as CpaExperimentalDbRow);
  }

  aggregated.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  return aggregated;
}

export async function listCpaExperimental(
  companyId: string,
  opts: {
    catalogProductId?: string;
    advertisingAccountId?: string;
    desde?: string;
    hasta?: string;
  },
) {
  const where: Prisma.CpaExperimentalRecordWhereInput = { companyId };
  if (opts.catalogProductId) where.catalogProductId = opts.catalogProductId;
  if (opts.advertisingAccountId) where.advertisingAccountId = opts.advertisingAccountId;

  const d0 = opts.desde ? parseYmd(opts.desde) : null;
  const h0 = opts.hasta ? parseYmd(opts.hasta) : null;
  if (d0 && h0) {
    where.fecha = {
      gte: utcDayStart(d0.y, d0.m, d0.d),
      lte: utcDayStart(h0.y, h0.m, h0.d),
    };
  }

  const rows = await prisma.cpaExperimentalRecord.findMany({
    where,
    orderBy: [{ fecha: "desc" }, { catalogProductId: "asc" }, { advertisingAccountId: "asc" }],
    include: {
      catalogProduct: { select: { id: true, name: true, sku: true } },
      advertisingAccount: { select: { id: true, metaAccountId: true, businessName: true } },
    },
  });

  if (opts.catalogProductId && !opts.advertisingAccountId) {
    return aggregateCpaExperimentalByDay(rows);
  }
  return rows;
}

/** Calcula CPA experimental para cada cuenta que tenga campañas del producto. */
export async function rebuildCpaExperimentalByProduct(
  companyId: string,
  catalogProductId: string,
  desdeYmd: string,
  hastaYmd: string,
): Promise<{ daysWritten: number; warnings: string[]; accountsProcessed: number }> {
  const campaigns = await prisma.advertisingCampaign.findMany({
    where: { companyId, productId: catalogProductId },
    select: { advertisingAccountId: true },
  });
  const accountIds = [
    ...new Set(
      campaigns.map((c) => c.advertisingAccountId).filter((id): id is string => id != null && id !== ""),
    ),
  ];
  const d0 = parseYmd(desdeYmd);
  const h0 = parseYmd(hastaYmd);
  if (!d0 || !h0) {
    throw new Error("Rango de fechas inválido (usa YYYY-MM-DD).");
  }

  if (accountIds.length === 0) {
    await prisma.cpaExperimentalRecord.deleteMany({
      where: {
        companyId,
        catalogProductId,
        fecha: {
          gte: utcDayStart(d0.y, d0.m, d0.d),
          lte: utcDayStart(h0.y, h0.m, h0.d),
        },
      },
    });
    return {
      daysWritten: 0,
      warnings: [
        "No hay campañas Meta con cuenta para este producto. Se borraron filas guardadas del rango. Crea campañas en Campañas Meta y vuelve a calcular; sin campañas no hay gasto publicitario (las ventas vienen solo de pedidos importados).",
      ],
      accountsProcessed: 0,
    };
  }

  const warnings: string[] = [];
  let daysWritten = 0;
  for (const advertisingAccountId of accountIds) {
    const result = await rebuildCpaExperimentalRange(
      companyId,
      catalogProductId,
      advertisingAccountId,
      desdeYmd,
      hastaYmd,
    );
    daysWritten += result.daysWritten;
    warnings.push(...result.warnings);
  }

  return {
    daysWritten,
    warnings: [...new Set(warnings)],
    accountsProcessed: accountIds.length,
  };
}

export async function rebuildCpaExperimentalRange(
  companyId: string,
  catalogProductId: string,
  advertisingAccountId: string,
  desdeYmd: string,
  hastaYmd: string,
): Promise<{ daysWritten: number; warnings: string[] }> {
  const warnings: string[] = [];
  const desde = parseYmd(desdeYmd);
  const hasta = parseYmd(hastaYmd);
  if (!desde || !hasta || !dateLTE(desde, hasta)) {
    throw new Error("Rango de fechas inválido (usa YYYY-MM-DD).");
  }

  const [product, account] = await Promise.all([
    prisma.catalogProduct.findFirst({ where: { id: catalogProductId, companyId } }),
    prisma.advertisingAccount.findFirst({ where: { id: advertisingAccountId, companyId } }),
  ]);
  if (!product) throw new Error("Producto de catálogo no encontrado.");
  if (!account) throw new Error("Cuenta publicitaria no encontrada.");

  const links = await prisma.catalogProductDropiLink.findMany({
    where: { companyId, catalogProductId },
  });
  if (links.length === 0) {
    warnings.push("Este producto no tiene variantes Dropi vinculadas; ventas y facturación quedarán en cero.");
  }

  const validLinks = links.filter((l) => l.productoId != null && String(l.productoId).trim() !== "");
  if (links.length > 0 && validLinks.length === 0) {
    warnings.push("Los vínculos Dropi no tienen producto_id; no se pueden atribuir pedidos.");
  }

  const orClause: Prisma.ProductDetailWhereInput[] = validLinks.map((l) => ({
    companyId,
    productoId: l.productoId!,
    sku: l.sku,
    variacionId: l.variacionId,
  }));

  const detailMatches =
    orClause.length === 0
      ? []
      : await prisma.productDetail.findMany({
          where: { OR: orClause },
          select: { pedidoIdDropi: true },
        });
  const orderExternalIds = [...new Set(detailMatches.map((r) => r.pedidoIdDropi).filter(Boolean))];

  const campaigns = await prisma.advertisingCampaign.findMany({
    where: {
      companyId,
      productId: catalogProductId,
      advertisingAccountId,
    },
    select: { id: true },
  });
  const campaignIds = campaigns.map((c) => c.id);
  const cuentaLabel =
    account.businessName?.trim() ? `${account.metaAccountId} — ${account.businessName.trim()}` : account.metaAccountId;
  if (campaignIds.length === 0) {
    warnings.push(
      `La cuenta «${cuentaLabel}» no tiene campañas Meta asignadas a este producto. Quita el filtro de cuenta (suma todas) o asigna la cuenta correcta en Campañas Meta. Mientras tanto solo se usarán gastos operacionales de esa cuenta, si existen.`,
    );
  }

  const rowsToCreate: Prisma.CpaExperimentalRecordCreateManyInput[] = [];
  const daysSinImporteMetaEnSnapshot = new Set<string>();
  const daysImporteMetaParcial = new Set<string>();

  let cur = desde;
  while (dateLTE(cur, hasta)) {
    const dayStart = utcDayStart(cur.y, cur.m, cur.d);
    const dayEnd = utcDayEnd(cur.y, cur.m, cur.d);

    let ventas = 0;
    let totalFacturado = 0;
    let gananciaPromedio: number | null = null;

    if (orderExternalIds.length > 0) {
      const orders = await prisma.order.findMany({
        where: {
          companyId,
          externalOrderId: { in: orderExternalIds },
          fecha: { gte: dayStart, lte: dayEnd },
        },
        select: { venta: true, gananciaCalc: true, estadoUnificado: true, estadoOperativo: true },
      });
      const ordersActivos = orders.filter(
        (o) => !isPedidoCanceladoORechazado(o.estadoUnificado, o.estadoOperativo),
      );
      ventas = ordersActivos.length;
      for (const o of ordersActivos) {
        if (o.venta != null) totalFacturado += Number(o.venta);
      }
      const ganVals = ordersActivos
        .map((o) => (o.gananciaCalc != null ? Number(o.gananciaCalc) : null))
        .filter((x): x is number => x != null && !Number.isNaN(x));
      if (ganVals.length > 0) {
        gananciaPromedio = ganVals.reduce((a, b) => a + b, 0) / ganVals.length;
      }
    }

    const gastoAgg = await prisma.operationalExpense.aggregate({
      where: {
        companyId,
        advertisingAccountId,
        fecha: { gte: dayStart, lte: dayEnd },
      },
      _sum: { monto: true },
    });
    const gastoOperacional =
      gastoAgg._sum.monto != null && !Number.isNaN(Number(gastoAgg._sum.monto))
        ? Number(gastoAgg._sum.monto)
        : 0;

    let metaConv = 0;
    let shopifySum = 0;
    let metaSpendSum = 0;
    let metaSpendFilasConImporte = 0;
    let metricasDelDia = 0;

    if (campaignIds.length > 0) {
      const dayMetrics = await prisma.advertisingCampaignMetric.findMany({
        where: {
          companyId,
          campaignId: { in: campaignIds },
          recordDate: dayStart,
        },
        select: {
          metaConversationsStarted: true,
          shopifySessions: true,
          metaExcelSnapshot: true,
        },
      });
      metricasDelDia = dayMetrics.length;
      for (const m of dayMetrics) {
        metaConv += Number(m.metaConversationsStarted ?? 0);
        shopifySum += Number(m.shopifySessions ?? 0);
        const sp = spendFromMetaExcelSnapshot(m.metaExcelSnapshot);
        if (sp.found) {
          metaSpendSum += sp.amount;
          metaSpendFilasConImporte += 1;
        }
      }
    }

    const ymdKey = `${cur.y}-${String(cur.m).padStart(2, "0")}-${String(cur.d).padStart(2, "0")}`;
    if (campaignIds.length > 0 && metricasDelDia > 0 && metaSpendFilasConImporte === 0) {
      daysSinImporteMetaEnSnapshot.add(ymdKey);
    }
    if (metricasDelDia > metaSpendFilasConImporte && metaSpendFilasConImporte > 0) {
      daysImporteMetaParcial.add(ymdKey);
    }

    /**
     * Gasto = suma «Importe gastado» del Excel Meta (campañas de este producto+cuenta).
     * Solo si hay campañas y falta importe en métricas → gasto operacional de la cuenta ese día.
     * Sin campañas del producto no se usa facturación Meta de la cuenta (evita atribuir gasto ajeno al producto).
     */
    const gastoPublicidad =
      metaSpendFilasConImporte > 0
        ? metaSpendSum
        : campaignIds.length > 0 && gastoOperacional > 0
          ? gastoOperacional
          : 0;

    const conversaciones = metaConv + shopifySum;

    const rowLike: CpaRowLike & { fecha?: Date; producto?: string; cuenta_publicitaria?: string } = {
      fecha: dayStart,
      semana: semanaDelMesLabel(cur.y, cur.m, cur.d),
      producto: product.name,
      cuenta_publicitaria: cuentaLabel,
      gasto_publicidad: gastoPublicidad > 0 ? gastoPublicidad : null,
      ventas,
      conversaciones: conversaciones > 0 ? conversaciones : null,
      total_facturado: totalFacturado > 0 ? totalFacturado : null,
      ganancia_promedio: gananciaPromedio,
    };
    applyCpaDerivedFields(rowLike);

    rowsToCreate.push({
      companyId,
      catalogProductId,
      advertisingAccountId,
      fecha: dayStart,
      semana: rowLike.semana ?? null,
      producto: rowLike.producto ?? null,
      cuentaPublicitaria: rowLike.cuenta_publicitaria ?? null,
      gastoPublicidad: rowLike.gasto_publicidad != null ? rowLike.gasto_publicidad : null,
      conversaciones: rowLike.conversaciones != null ? Math.trunc(rowLike.conversaciones) : null,
      totalFacturado: rowLike.total_facturado != null ? rowLike.total_facturado : null,
      gananciaPromedio: rowLike.ganancia_promedio != null ? rowLike.ganancia_promedio : null,
      ventas: rowLike.ventas != null ? Math.trunc(rowLike.ventas) : null,
      ticketPromedioProducto: rowLike.ticket_promedio_producto ?? null,
      cpa: rowLike.cpa ?? null,
      conversionRate: rowLike.conversion_rate ?? null,
      costoPublicitario: rowLike.costo_publicitario ?? null,
      rentabilidad: rowLike.rentabilidad ?? null,
      utilidadAproximada: rowLike.utilidad_aproximada ?? null,
    });

    cur = addUtcDays(cur.y, cur.m, cur.d, 1);
  }

  await prisma.$transaction(async (tx) => {
    await tx.cpaExperimentalRecord.deleteMany({
      where: {
        companyId,
        catalogProductId,
        advertisingAccountId,
        fecha: {
          gte: utcDayStart(desde.y, desde.m, desde.d),
          lte: utcDayStart(hasta.y, hasta.m, hasta.d),
        },
      },
    });
    const chunk = 50;
    for (let i = 0; i < rowsToCreate.length; i += chunk) {
      const slice = rowsToCreate.slice(i, i + chunk);
      await tx.cpaExperimentalRecord.createMany({ data: slice });
    }
  });

  if (daysSinImporteMetaEnSnapshot.size > 0) {
    const sample = [...daysSinImporteMetaEnSnapshot].slice(0, 3).join(", ");
    const more =
      daysSinImporteMetaEnSnapshot.size > 3 ? ` (+${daysSinImporteMetaEnSnapshot.size - 3} más)` : "";
    warnings.push(
      `Hay día(s) con métricas Meta pero sin «Importe gastado» en la copia del Excel (${sample}${more}); en esos días se usó el gasto operacional si existe.`,
    );
  }
  if (daysImporteMetaParcial.size > 0) {
    const sample = [...daysImporteMetaParcial].slice(0, 3).join(", ");
    const more = daysImporteMetaParcial.size > 3 ? ` (+${daysImporteMetaParcial.size - 3} más)` : "";
    warnings.push(
      `Hay día(s) donde solo parte de las métricas traía «Importe gastado» (${sample}${more}); el gasto publicado es la suma de las filas donde sí aparece.`,
    );
  }

  return { daysWritten: rowsToCreate.length, warnings };
}
