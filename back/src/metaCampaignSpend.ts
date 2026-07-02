import type { PrismaClient } from "@prisma/client";
import { spendFromMetaExcelSnapshot } from "./metaCampaignExcelParse";

function parseYmdRange(desde?: string, hasta?: string): { start: Date; end: Date } | null {
  if (!desde || !hasta || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return null;
  }
  const [y0, m0, d0] = desde.split("-").map(Number);
  const [y1, m1, d1] = hasta.split("-").map(Number);
  const start = new Date(Date.UTC(y0, m0 - 1, d0, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y1, m1 - 1, d1, 23, 59, 59, 999));
  return { start, end };
}

export type MetaSpendByProductRow = {
  productId: string;
  productName: string;
  amount: number;
  metricDays: number;
};

export type MetaAdvertisingSpendSummary = {
  total: number;
  metricRowsWithSpend: number;
  byProduct: MetaSpendByProductRow[];
};

/** Suma «Importe gastado» de métricas Meta importadas en Campañas, agrupado por producto del catálogo. */
export async function getMetaAdvertisingSpendSummary(
  prisma: PrismaClient,
  companyId: string,
  opts: { desde?: string; hasta?: string },
): Promise<MetaAdvertisingSpendSummary> {
  const range = parseYmdRange(opts.desde, opts.hasta);
  const metrics = await prisma.advertisingCampaignMetric.findMany({
    where: {
      companyId,
      ...(range
        ? {
            recordDate: {
              gte: range.start,
              lte: range.end,
            },
          }
        : {}),
    },
    select: {
      id: true,
      recordDate: true,
      metaExcelSnapshot: true,
      campaign: {
        select: {
          productLinks: {
            select: {
              catalogProduct: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  let total = 0;
  let metricRowsWithSpend = 0;
  const byProduct = new Map<
    string,
    { productId: string; productName: string; amount: number; days: Set<string> }
  >();

  for (const m of metrics) {
    const sp = spendFromMetaExcelSnapshot(m.metaExcelSnapshot);
    if (!sp.found || sp.amount <= 0) continue;
    total += sp.amount;
    metricRowsWithSpend += 1;

    const dayKey = m.recordDate.toISOString().slice(0, 10);
    const links = m.campaign.productLinks;
    if (links.length === 0) continue;

    for (const link of links) {
      const pid = link.catalogProduct.id;
      let row = byProduct.get(pid);
      if (!row) {
        row = {
          productId: pid,
          productName: link.catalogProduct.name,
          amount: 0,
          days: new Set<string>(),
        };
        byProduct.set(pid, row);
      }
      row.amount += sp.amount;
      row.days.add(dayKey);
    }
  }

  const byProductList: MetaSpendByProductRow[] = [...byProduct.values()]
    .map((r) => ({
      productId: r.productId,
      productName: r.productName,
      amount: Math.round(r.amount * 100) / 100,
      metricDays: r.days.size,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    total: Math.round(total * 100) / 100,
    metricRowsWithSpend,
    byProduct: byProductList,
  };
}
