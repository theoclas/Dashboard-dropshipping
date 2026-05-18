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

export async function listCpaExperimental(
  companyId: string,
  opts: {
    catalogProductId?: string;
    desde?: string;
    hasta?: string;
  },
) {
  const where: Prisma.CpaExperimentalRecordWhereInput = { companyId };
  if (opts.catalogProductId) where.catalogProductId = opts.catalogProductId;

  const d0 = opts.desde ? parseYmd(opts.desde) : null;
  const h0 = opts.hasta ? parseYmd(opts.hasta) : null;
  if (d0 && h0) {
    where.fecha = {
      gte: utcDayStart(d0.y, d0.m, d0.d),
      lte: utcDayStart(h0.y, h0.m, h0.d),
    };
  }

  return prisma.cpaExperimentalRecord.findMany({
    where,
    orderBy: [{ fecha: "desc" }],
    include: {
      catalogProduct: { select: { id: true, name: true, sku: true } },
    },
  });
}

/** CPA por producto y día: suma campañas Meta del producto (todas las cuentas) + pedidos Dropi vinculados. */
export async function rebuildCpaExperimentalByProduct(
  companyId: string,
  catalogProductId: string,
  desdeYmd: string,
  hastaYmd: string,
): Promise<{ daysWritten: number; warnings: string[] }> {
  const warnings: string[] = [];
  const desde = parseYmd(desdeYmd);
  const hasta = parseYmd(hastaYmd);
  if (!desde || !hasta || !dateLTE(desde, hasta)) {
    throw new Error("Rango de fechas inválido (usa YYYY-MM-DD).");
  }

  const product = await prisma.catalogProduct.findFirst({ where: { id: catalogProductId, companyId } });
  if (!product) throw new Error("Producto de catálogo no encontrado.");

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
    where: { companyId, productId: catalogProductId },
    select: { id: true, advertisingAccountId: true },
  });
  const campaignIds = campaigns.map((c) => c.id);
  const campaignsSinCuenta = campaigns.filter((c) => !c.advertisingAccountId).length;
  if (campaignIds.length === 0) {
    warnings.push(
      "No hay campañas Meta para este producto; el gasto publicitario será cero (las ventas pueden venir de pedidos Dropi).",
    );
  } else if (campaignsSinCuenta > 0) {
    warnings.push(
      `${campaignsSinCuenta} campaña(s) sin cuenta publicitaria asignada; sus métricas sí suman al gasto si están importadas.`,
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

    const gastoPublicidad = metaSpendFilasConImporte > 0 ? metaSpendSum : 0;
    const conversaciones = metaConv + shopifySum;

    const rowLike: CpaRowLike = {
      fecha: dayStart,
      semana: semanaDelMesLabel(cur.y, cur.m, cur.d),
      producto: product.name,
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
      advertisingAccountId: null,
      fecha: dayStart,
      semana: rowLike.semana ?? null,
      producto: rowLike.producto ?? null,
      cuentaPublicitaria: null,
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
      `Hay día(s) con métricas Meta pero sin «Importe gastado» en el Excel (${sample}${more}); el gasto de ese día queda en cero.`,
    );
  }
  if (daysImporteMetaParcial.size > 0) {
    const sample = [...daysImporteMetaParcial].slice(0, 3).join(", ");
    const more = daysImporteMetaParcial.size > 3 ? ` (+${daysImporteMetaParcial.size - 3} más)` : "";
    warnings.push(
      `Hay día(s) donde solo parte de las métricas traía «Importe gastado» (${sample}${more}); el gasto es la suma de las filas donde sí aparece.`,
    );
  }

  return { daysWritten: rowsToCreate.length, warnings };
}
