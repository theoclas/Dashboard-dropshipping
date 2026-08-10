import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type AdLevel = "campaign" | "adset" | "ad";

export type AdQueryOptions = {
  desde: string;
  hasta: string;
  level: AdLevel;
  advertisingAccountIds?: string[];
  campaignIds?: string[];
  adSetIds?: string[];
  /** Incluye el desglose día a día dentro de cada fila. */
  daily?: boolean;
  /**
   * CPA objetivo del producto que se está probando. Sin esto no se emite veredicto:
   * un CPA "malo" solo existe contra un número que tú defines.
   */
  cpaObjetivo?: number | null;
};

export type AdDailyRow = {
  ymd: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  conversations: number;
  purchases: number;
  conversionValue: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  costPerPurchase: number | null;
  costPerConversation: number | null;
  roas: number | null;
};

export type AdVerdictCode =
  | "SIN_SEÑAL"
  | "SIN_CONVERSACION"
  | "SIN_VENTA"
  | "CTR_BAJO"
  | "CPA_ALTO"
  | "OK";

export type AdVerdict = {
  code: AdVerdictCode;
  /** matar | vigilar | dejar_correr | ok */
  action: "matar" | "vigilar" | "dejar_correr" | "ok";
  reason: string;
};

export type AdNodeRow = {
  key: string;
  level: AdLevel;
  id: string;
  externalId: string;
  name: string;
  accountName: string | null;
  campaignName: string | null;
  adSetName: string | null;
  effectiveStatus: string | null;
  /** Solo en nivel `ad`. URL del CDN de Meta: puede caducar, la UI debe tolerarlo. */
  creativeThumbUrl: string | null;
  creativeImageUrl: string | null;
  creativeObjectType: string | null;

  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  conversations: number;
  purchases: number;
  conversionValue: number;

  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  costPerPurchase: number | null;
  costPerConversation: number | null;
  roas: number | null;

  daysWithData: number;
  firstDay: string | null;
  lastDay: string | null;

  verdict: AdVerdict | null;
  daily?: AdDailyRow[];
};

export type AdQueryResult = {
  desde: string;
  hasta: string;
  level: AdLevel;
  cpaObjetivo: number | null;
  rows: AdNodeRow[];
  totals: Omit<
    AdNodeRow,
    | "key"
    | "level"
    | "id"
    | "externalId"
    | "name"
    | "accountName"
    | "campaignName"
    | "adSetName"
    | "effectiveStatus"
    | "creativeThumbUrl"
    | "creativeImageUrl"
    | "creativeObjectType"
    | "verdict"
    | "daily"
  >;
  notes: string[];
};

/** Umbrales del semáforo, expresados en múltiplos del CPA objetivo. */
export const KILL_SPEND_NO_CONVERSATION = 1;
export const KILL_SPEND_NO_PURCHASE = 2.5;
/** Un CTR por debajo de esta fracción de la mediana de sus hermanos es señal de creativo muerto. */
export const CTR_LOW_FRACTION_OF_MEDIAN = 0.5;

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function utcDayStart(p: { y: number; m: number; d: number }): Date {
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

function ymdOf(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

function round(n: number | null, scale = 2): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** scale;
  return Math.round(n * f) / f;
}

function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1]! + xs[mid]!) / 2 : xs[mid]!;
}

type Acc = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  conversations: number;
  purchases: number;
  conversionValue: number;
  days: Set<string>;
};

function emptyAcc(): Acc {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    conversations: 0,
    purchases: 0,
    conversionValue: 0,
    days: new Set(),
  };
}

function rates(a: {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  conversations: number;
  conversionValue: number;
}) {
  return {
    ctr: a.impressions > 0 ? round((a.clicks / a.impressions) * 100, 4) : null,
    cpm: a.impressions > 0 ? round((a.spend / a.impressions) * 1000) : null,
    cpc: a.clicks > 0 ? round(a.spend / a.clicks) : null,
    costPerPurchase: a.purchases > 0 ? round(a.spend / a.purchases) : null,
    costPerConversation: a.conversations > 0 ? round(a.spend / a.conversations) : null,
    roas: a.spend > 0 && a.conversionValue > 0 ? round(a.conversionValue / a.spend, 4) : null,
  };
}

/**
 * Semáforo de descarte para testeo de creativos.
 *
 * La regla se evalúa sobre **gasto acumulado**, no sobre días transcurridos: un anuncio con
 * $5.000/día y otro con $50.000/día no maduran al mismo ritmo, y juzgarlos por días mata
 * anuncios buenos que apenas empezaban.
 */
export function evaluateVerdict(
  row: {
    spend: number;
    conversations: number;
    purchases: number;
    ctr: number | null;
    costPerPurchase: number | null;
  },
  cpaObjetivo: number | null,
  siblingMedianCtr: number | null,
): AdVerdict | null {
  if (!cpaObjetivo || cpaObjetivo <= 0) return null;

  const ctrBajo =
    row.ctr != null &&
    siblingMedianCtr != null &&
    siblingMedianCtr > 0 &&
    row.ctr < siblingMedianCtr * CTR_LOW_FRACTION_OF_MEDIAN;

  // El CTR bajo se juzga primero: es la señal más barata y la que evita quemar plata.
  if (ctrBajo) {
    return {
      code: "CTR_BAJO",
      action: "matar",
      reason: `CTR ${row.ctr!.toFixed(2)} % está por debajo de la mitad de la mediana de sus hermanos (${siblingMedianCtr!.toFixed(2)} %). El gancho no llama la atención.`,
    };
  }

  if (row.spend < cpaObjetivo * KILL_SPEND_NO_CONVERSATION) {
    return {
      code: "SIN_SEÑAL",
      action: "dejar_correr",
      reason: `Lleva gastado menos de 1 CPA objetivo. Todavía no hay con qué decidir; dejarlo correr.`,
    };
  }

  if (row.conversations === 0 && row.purchases === 0) {
    return {
      code: "SIN_CONVERSACION",
      action: "matar",
      reason: `Gastó más de 1 CPA objetivo sin una sola conversación ni compra.`,
    };
  }

  if (row.spend >= cpaObjetivo * KILL_SPEND_NO_PURCHASE && row.purchases === 0) {
    return {
      code: "SIN_VENTA",
      action: "matar",
      reason: `Gastó más de ${KILL_SPEND_NO_PURCHASE} CPA objetivo sin ninguna compra. Hay conversaciones pero no cierran.`,
    };
  }

  if (row.costPerPurchase != null && row.costPerPurchase > cpaObjetivo) {
    return {
      code: "CPA_ALTO",
      action: "vigilar",
      reason: `CPA de ${Math.round(row.costPerPurchase).toLocaleString("es-CO")} por encima del objetivo.`,
    };
  }

  return {
    code: "OK",
    action: "ok",
    reason:
      row.costPerPurchase != null
        ? `CPA de ${Math.round(row.costPerPurchase).toLocaleString("es-CO")}, dentro del objetivo.`
        : `Sin compras aún pero con conversaciones y gasto todavía bajo el umbral de descarte.`,
  };
}

export async function queryAdMetrics(
  companyId: string,
  opts: AdQueryOptions,
): Promise<AdQueryResult> {
  const d0 = parseYmd(opts.desde);
  const d1 = parseYmd(opts.hasta);
  if (!d0 || !d1) throw new Error("Rango de fechas inválido (usa YYYY-MM-DD).");

  const start = utcDayStart(d0);
  const end = utcDayStart(d1);
  if (start > end) throw new Error("La fecha «desde» no puede ser posterior a «hasta».");

  const where: Prisma.AdMetricWhereInput = {
    companyId,
    recordDate: { gte: start, lte: end },
  };
  if (opts.advertisingAccountIds?.length) {
    where.advertisingAccountId = { in: opts.advertisingAccountIds };
  }
  if (opts.campaignIds?.length) where.campaignId = { in: opts.campaignIds };
  if (opts.adSetIds?.length) where.adSetId = { in: opts.adSetIds };

  const metrics = await prisma.adMetric.findMany({
    where,
    select: {
      recordDate: true,
      spend: true,
      impressions: true,
      reach: true,
      clicks: true,
      linkClicks: true,
      conversations: true,
      purchases: true,
      conversionValue: true,
      adId: true,
      adSetId: true,
      campaignId: true,
      ad: {
        select: {
          externalAdId: true,
          name: true,
          effectiveStatus: true,
          creativeThumbUrl: true,
          creativeImageUrl: true,
          creativeObjectType: true,
        },
      },
      adSet: { select: { externalAdSetId: true, name: true, campaignId: true } },
      campaign: {
        select: {
          externalCampaignId: true,
          displayName: true,
          advertisingAccount: { select: { id: true, businessName: true, metaAccountId: true } },
        },
      },
    },
    orderBy: [{ recordDate: "asc" }],
  });

  type Node = {
    id: string;
    externalId: string;
    name: string;
    accountName: string | null;
    campaignName: string | null;
    adSetName: string | null;
    effectiveStatus: string | null;
    creativeThumbUrl: string | null;
    creativeImageUrl: string | null;
    creativeObjectType: string | null;
    parentKey: string;
    acc: Acc;
    byDay: Map<string, Acc>;
  };

  const nodes = new Map<string, Node>();
  const totalsAcc = emptyAcc();

  for (const m of metrics) {
    const accountName = m.campaign.advertisingAccount?.businessName ?? m.campaign.advertisingAccount?.metaAccountId ?? null;
    const campaignName = m.campaign.displayName ?? m.campaign.externalCampaignId;
    const adSetName = m.adSet.name ?? m.adSet.externalAdSetId;

    let id: string;
    let externalId: string;
    let name: string;
    let parentKey: string;
    let effectiveStatus: string | null = null;
    let creativeThumbUrl: string | null = null;
    let creativeImageUrl: string | null = null;
    let creativeObjectType: string | null = null;

    if (opts.level === "campaign") {
      id = m.campaignId;
      externalId = m.campaign.externalCampaignId;
      name = campaignName;
      parentKey = m.campaign.advertisingAccount?.id ?? "sin-cuenta";
    } else if (opts.level === "adset") {
      id = m.adSetId;
      externalId = m.adSet.externalAdSetId;
      name = adSetName;
      parentKey = m.campaignId;
    } else {
      id = m.adId;
      externalId = m.ad.externalAdId;
      name = m.ad.name ?? m.ad.externalAdId;
      parentKey = m.adSetId;
      effectiveStatus = m.ad.effectiveStatus;
      creativeThumbUrl = m.ad.creativeThumbUrl;
      creativeImageUrl = m.ad.creativeImageUrl;
      creativeObjectType = m.ad.creativeObjectType;
    }

    let node = nodes.get(id);
    if (!node) {
      node = {
        id,
        externalId,
        name,
        accountName,
        campaignName,
        adSetName,
        effectiveStatus,
        creativeThumbUrl,
        creativeImageUrl,
        creativeObjectType,
        parentKey,
        acc: emptyAcc(),
        byDay: new Map(),
      };
      nodes.set(id, node);
    }

    const ymd = ymdOf(m.recordDate);
    const spend = num(m.spend);
    const impressions = m.impressions ?? 0;
    const reach = m.reach ?? 0;
    const clicks = m.clicks ?? 0;
    const linkClicks = m.linkClicks ?? 0;
    const conversations = m.conversations ?? 0;
    const purchases = m.purchases ?? 0;
    const conversionValue = num(m.conversionValue);

    for (const target of [node.acc, totalsAcc]) {
      target.spend += spend;
      target.impressions += impressions;
      target.reach += reach;
      target.clicks += clicks;
      target.linkClicks += linkClicks;
      target.conversations += conversations;
      target.purchases += purchases;
      target.conversionValue += conversionValue;
      target.days.add(ymd);
    }

    if (opts.daily) {
      let day = node.byDay.get(ymd);
      if (!day) {
        day = emptyAcc();
        node.byDay.set(ymd, day);
      }
      day.spend += spend;
      day.impressions += impressions;
      day.reach += reach;
      day.clicks += clicks;
      day.linkClicks += linkClicks;
      day.conversations += conversations;
      day.purchases += purchases;
      day.conversionValue += conversionValue;
      day.days.add(ymd);
    }
  }

  // Mediana de CTR entre hermanos (mismo padre) para detectar creativos que no enganchan.
  const ctrsByParent = new Map<string, number[]>();
  for (const node of nodes.values()) {
    if (node.acc.impressions <= 0) continue;
    const ctr = (node.acc.clicks / node.acc.impressions) * 100;
    const arr = ctrsByParent.get(node.parentKey) ?? [];
    arr.push(ctr);
    ctrsByParent.set(node.parentKey, arr);
  }
  const medianCtrByParent = new Map<string, number | null>();
  for (const [k, arr] of ctrsByParent) medianCtrByParent.set(k, median(arr));

  const cpaObjetivo = opts.cpaObjetivo && opts.cpaObjetivo > 0 ? opts.cpaObjetivo : null;

  const rows: AdNodeRow[] = [...nodes.values()].map((node) => {
    const r = rates(node.acc);
    const days = [...node.acc.days].sort();

    const siblingMedian =
      (ctrsByParent.get(node.parentKey)?.length ?? 0) >= 3
        ? (medianCtrByParent.get(node.parentKey) ?? null)
        : null;

    const daily: AdDailyRow[] | undefined = opts.daily
      ? [...node.byDay.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([ymd, a]) => ({
            ymd,
            spend: round(a.spend)!,
            impressions: a.impressions,
            reach: a.reach,
            clicks: a.clicks,
            linkClicks: a.linkClicks,
            conversations: a.conversations,
            purchases: a.purchases,
            conversionValue: round(a.conversionValue)!,
            ...rates(a),
          }))
      : undefined;

    return {
      key: `${opts.level}-${node.id}`,
      level: opts.level,
      id: node.id,
      externalId: node.externalId,
      name: node.name,
      accountName: node.accountName,
      campaignName: node.campaignName,
      adSetName: node.adSetName,
      effectiveStatus: node.effectiveStatus,
      creativeThumbUrl: node.creativeThumbUrl,
      creativeImageUrl: node.creativeImageUrl,
      creativeObjectType: node.creativeObjectType,

      spend: round(node.acc.spend)!,
      impressions: node.acc.impressions,
      reach: node.acc.reach,
      clicks: node.acc.clicks,
      linkClicks: node.acc.linkClicks,
      conversations: node.acc.conversations,
      purchases: node.acc.purchases,
      conversionValue: round(node.acc.conversionValue)!,
      ...r,

      daysWithData: node.acc.days.size,
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,

      verdict: evaluateVerdict(
        {
          spend: node.acc.spend,
          conversations: node.acc.conversations,
          purchases: node.acc.purchases,
          ctr: r.ctr,
          costPerPurchase: r.costPerPurchase,
        },
        cpaObjetivo,
        siblingMedian,
      ),
      ...(daily ? { daily } : {}),
    };
  });

  rows.sort((a, b) => b.spend - a.spend);

  const totalDays = [...totalsAcc.days].sort();
  const notes: string[] = [];
  if (opts.level !== "ad") {
    notes.push(
      "El alcance es la suma de los anuncios, no el alcance deduplicado de Meta: una misma persona puede haber visto varios anuncios.",
    );
  }
  if (!cpaObjetivo) {
    notes.push("Define un CPA objetivo para que se calcule el semáforo de descarte.");
  }

  return {
    desde: opts.desde,
    hasta: opts.hasta,
    level: opts.level,
    cpaObjetivo,
    rows,
    totals: {
      spend: round(totalsAcc.spend)!,
      impressions: totalsAcc.impressions,
      reach: totalsAcc.reach,
      clicks: totalsAcc.clicks,
      linkClicks: totalsAcc.linkClicks,
      conversations: totalsAcc.conversations,
      purchases: totalsAcc.purchases,
      conversionValue: round(totalsAcc.conversionValue)!,
      ...rates(totalsAcc),
      daysWithData: totalsAcc.days.size,
      firstDay: totalDays[0] ?? null,
      lastDay: totalDays[totalDays.length - 1] ?? null,
    },
    notes,
  };
}

/** Cuentas → campañas → conjuntos con datos, para poblar los filtros de la vista. */
export async function getAdsHierarchy(companyId: string): Promise<{
  accounts: Array<{ id: string; name: string; metaAccountId: string }>;
  campaigns: Array<{ id: string; name: string; externalId: string; advertisingAccountId: string | null }>;
  adSets: Array<{ id: string; name: string; externalId: string; campaignId: string }>;
}> {
  const [accounts, campaigns, adSets] = await Promise.all([
    prisma.advertisingAccount.findMany({
      where: { companyId },
      select: { id: true, businessName: true, metaAccountId: true },
      orderBy: { businessName: "asc" },
    }),
    prisma.advertisingCampaign.findMany({
      where: { companyId, ads: { some: {} } },
      select: { id: true, displayName: true, externalCampaignId: true, advertisingAccountId: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.adSet.findMany({
      where: { companyId },
      select: { id: true, name: true, externalAdSetId: true, campaignId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.businessName?.trim() || a.metaAccountId,
      metaAccountId: a.metaAccountId,
    })),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.displayName?.trim() || c.externalCampaignId,
      externalId: c.externalCampaignId,
      advertisingAccountId: c.advertisingAccountId,
    })),
    adSets: adSets.map((s) => ({
      id: s.id,
      name: s.name?.trim() || s.externalAdSetId,
      externalId: s.externalAdSetId,
      campaignId: s.campaignId,
    })),
  };
}
