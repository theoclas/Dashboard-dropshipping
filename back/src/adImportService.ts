import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import * as advertisingAccountService from "./advertisingAccountService";
import {
  fetchAdInsightsForAccountRange,
  fetchAdMetadata,
  validateAdApiDateRange,
} from "./metaAdsAdInsightsService";
import {
  addToRollup,
  deriveRates,
  emptyRollup,
  mapAdInsightRows,
  type AdRollup,
  type ParsedAdRow,
} from "./metaAdInsightNormalize";

const CHUNK = 200;

export type AdImportResult = {
  advertisingAccountId: string;
  metaAccountId: string;
  desde: string;
  hasta: string;
  rowsFetched: number;
  pagesFetched: number;
  campaignsCreated: number;
  adSetsCreated: number;
  adsCreated: number;
  adMetricsWritten: number;
  campaignMetricsWritten: number;
  errors: string[];
};

function chunked<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dec(n: number | null | undefined): Prisma.Decimal | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

function utcDay(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Trae anuncios de una cuenta para un rango y los persiste en la jerarquía
 * campaña → conjunto → anuncio, con una fila de métricas por anuncio y día.
 *
 * Además **deriva** el nivel campaña hacia `advertising_campaign_metrics`, que es lo que
 * consume CPA experimental y el gasto publicitario del dashboard. Así un solo import
 * alimenta todo y no hay dos cifras de gasto que puedan divergir.
 */
export async function importAdsForAccount(
  companyId: string,
  advertisingAccountId: string,
  opts: {
    desde: string;
    hasta: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
    /** Si es false no se tocan las filas de nivel campaña (útil para depurar). */
    deriveCampaignMetrics?: boolean;
  },
): Promise<AdImportResult> {
  const account = await advertisingAccountService.getAdvertisingAccount(companyId, advertisingAccountId);
  if (!account) throw new Error("Cuenta publicitaria no encontrada.");

  const v = validateAdApiDateRange(opts.desde, opts.hasta);
  if (!v.ok) throw new Error(v.message);

  const fetched = await fetchAdInsightsForAccountRange(account.metaAccountId, {
    desde: v.desde,
    hasta: v.hasta,
    metaAdsAppId: opts.metaAdsAppId,
    metaAdsSystemUserId: opts.metaAdsSystemUserId,
  });

  const { parsed, errors: mapErrors } = mapAdInsightRows(fetched.rows);
  const errors = [...fetched.errors, ...mapErrors];

  const result: AdImportResult = {
    advertisingAccountId,
    metaAccountId: account.metaAccountId,
    desde: v.desde,
    hasta: v.hasta,
    rowsFetched: fetched.rows.length,
    pagesFetched: fetched.pagesFetched,
    campaignsCreated: 0,
    adSetsCreated: 0,
    adsCreated: 0,
    adMetricsWritten: 0,
    campaignMetricsWritten: 0,
    errors,
  };

  if (parsed.length === 0) return result;

  // ── 1. Campañas ────────────────────────────────────────────────────────────
  const campaignNameByExt = new Map<string, string | null>();
  for (const r of parsed) {
    if (!campaignNameByExt.has(r.externalCampaignId) || r.campaignName) {
      campaignNameByExt.set(r.externalCampaignId, r.campaignName);
    }
  }
  const campaignIdByExt = new Map<string, string>();
  for (const [ext, name] of campaignNameByExt) {
    const existing = await prisma.advertisingCampaign.findUnique({
      where: { companyId_externalCampaignId: { companyId, externalCampaignId: ext } },
      select: { id: true, displayName: true, advertisingAccountId: true },
    });
    if (existing) {
      campaignIdByExt.set(ext, existing.id);
      if ((name && name !== existing.displayName) || existing.advertisingAccountId !== advertisingAccountId) {
        await prisma.advertisingCampaign.update({
          where: { id: existing.id },
          data: { displayName: name ?? existing.displayName, advertisingAccountId },
        });
      }
    } else {
      const created = await prisma.advertisingCampaign.create({
        data: { companyId, externalCampaignId: ext, displayName: name, advertisingAccountId },
        select: { id: true },
      });
      campaignIdByExt.set(ext, created.id);
      result.campaignsCreated += 1;
    }
  }

  // ── 2. Conjuntos ───────────────────────────────────────────────────────────
  const adSetInfoByExt = new Map<string, { name: string | null; campaignExt: string }>();
  for (const r of parsed) {
    const prev = adSetInfoByExt.get(r.externalAdSetId);
    if (!prev || (r.adSetName && !prev.name)) {
      adSetInfoByExt.set(r.externalAdSetId, {
        name: r.adSetName ?? prev?.name ?? null,
        campaignExt: r.externalCampaignId,
      });
    }
  }
  const adSetIdByExt = new Map<string, string>();
  for (const [ext, info] of adSetInfoByExt) {
    const campaignId = campaignIdByExt.get(info.campaignExt);
    if (!campaignId) continue;
    const existing = await prisma.adSet.findUnique({
      where: { companyId_externalAdSetId: { companyId, externalAdSetId: ext } },
      select: { id: true, name: true, campaignId: true, advertisingAccountId: true },
    });
    if (existing) {
      adSetIdByExt.set(ext, existing.id);
      if (
        (info.name && info.name !== existing.name) ||
        existing.campaignId !== campaignId ||
        existing.advertisingAccountId !== advertisingAccountId
      ) {
        await prisma.adSet.update({
          where: { id: existing.id },
          data: { name: info.name ?? existing.name, campaignId, advertisingAccountId },
        });
      }
    } else {
      const created = await prisma.adSet.create({
        data: {
          companyId,
          externalAdSetId: ext,
          name: info.name,
          campaignId,
          advertisingAccountId,
        },
        select: { id: true },
      });
      adSetIdByExt.set(ext, created.id);
      result.adSetsCreated += 1;
    }
  }

  // ── 3. Anuncios ────────────────────────────────────────────────────────────
  const metaRes = await fetchAdMetadata(account.metaAccountId, {
    metaAdsAppId: opts.metaAdsAppId,
    metaAdsSystemUserId: opts.metaAdsSystemUserId,
  });
  if (metaRes.error) {
    errors.push(
      `No se pudo leer el estado ni el creativo de los anuncios (se importa igual): ${metaRes.error}`,
    );
  }

  const adInfoByExt = new Map<string, { name: string | null; adSetExt: string; campaignExt: string }>();
  for (const r of parsed) {
    const prev = adInfoByExt.get(r.externalAdId);
    if (!prev || (r.adName && !prev.name)) {
      adInfoByExt.set(r.externalAdId, {
        name: r.adName ?? prev?.name ?? null,
        adSetExt: r.externalAdSetId,
        campaignExt: r.externalCampaignId,
      });
    }
  }
  const adIdByExt = new Map<string, string>();
  for (const [ext, info] of adInfoByExt) {
    const adSetId = adSetIdByExt.get(info.adSetExt);
    const campaignId = campaignIdByExt.get(info.campaignExt);
    if (!adSetId || !campaignId) continue;
    const meta = metaRes.byAdId.get(ext);

    // Solo se pisa el creativo si Meta devolvió algo: si la llamada falló, es
    // mejor conservar la miniatura vieja que dejar la fila sin imagen.
    const creativeData = meta?.creativeId
      ? {
          creativeId: meta.creativeId,
          creativeThumbUrl: meta.creativeThumbUrl,
          creativeImageUrl: meta.creativeImageUrl,
          creativeObjectType: meta.creativeObjectType,
          creativeUpdatedAt: new Date(),
        }
      : {};

    const existing = await prisma.ad.findUnique({
      where: { companyId_externalAdId: { companyId, externalAdId: ext } },
      select: { id: true },
    });
    if (existing) {
      adIdByExt.set(ext, existing.id);
      await prisma.ad.update({
        where: { id: existing.id },
        data: {
          name: info.name ?? undefined,
          adSetId,
          campaignId,
          advertisingAccountId,
          ...(meta?.effectiveStatus ? { effectiveStatus: meta.effectiveStatus } : {}),
          ...creativeData,
        },
      });
    } else {
      const created = await prisma.ad.create({
        data: {
          companyId,
          externalAdId: ext,
          name: info.name,
          adSetId,
          campaignId,
          advertisingAccountId,
          effectiveStatus: meta?.effectiveStatus ?? null,
          ...creativeData,
        },
        select: { id: true },
      });
      adIdByExt.set(ext, created.id);
      result.adsCreated += 1;
    }
  }

  // ── 4. Métricas por anuncio y día ──────────────────────────────────────────
  // Se borra el rango de los anuncios que sí vinieron en esta consulta y se reinserta:
  // Meta omite los días sin entrega, así que reinsertar refleja su verdad actual.
  // Los anuncios que no vinieron conservan lo que ya tenían.
  const rangeStart = utcDay(v.desde);
  const rangeEnd = utcDay(v.hasta);
  const touchedAdIds = [...adIdByExt.values()];

  const metricRows: Prisma.AdMetricCreateManyInput[] = [];
  for (const r of parsed) {
    const adId = adIdByExt.get(r.externalAdId);
    const adSetId = adSetIdByExt.get(r.externalAdSetId);
    const campaignId = campaignIdByExt.get(r.externalCampaignId);
    if (!adId || !adSetId || !campaignId) continue;

    metricRows.push({
      companyId,
      adId,
      adSetId,
      campaignId,
      advertisingAccountId,
      recordDate: r.recordDate,
      spend: dec(r.spend),
      impressions: r.impressions ?? null,
      reach: r.reach ?? null,
      clicks: r.clicks ?? null,
      linkClicks: r.linkClicks ?? null,
      ctr: dec(r.ctr),
      cpc: dec(r.cpc),
      cpm: dec(r.cpm),
      conversations: r.conversations ?? null,
      purchases: r.purchases ?? null,
      conversionValue: dec(r.conversionValue),
      roas: dec(r.roas),
      rawSnapshot: r.raw as Prisma.InputJsonValue,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const ids of chunked(touchedAdIds)) {
      await tx.adMetric.deleteMany({
        where: { companyId, adId: { in: ids }, recordDate: { gte: rangeStart, lte: rangeEnd } },
      });
    }
    for (const slice of chunked(metricRows)) {
      await tx.adMetric.createMany({ data: slice });
    }
  });
  result.adMetricsWritten = metricRows.length;

  // ── 5. Derivar nivel campaña ───────────────────────────────────────────────
  if (opts.deriveCampaignMetrics !== false) {
    result.campaignMetricsWritten = await deriveCampaignMetricsFromAds(
      companyId,
      parsed,
      campaignIdByExt,
      errors,
    );
  }

  return result;
}

/**
 * Suma los anuncios de cada campaña-día y escribe `advertising_campaign_metrics`.
 *
 * El snapshot conserva la clave `Importe gastado (COP)` porque es la que leen
 * `metaCampaignSpend` y `cpaExperimentalService`; cambiarla rompería el CPA.
 *
 * Ojo: el gasto y las conversiones suman bien entre anuncios, pero el **alcance no**
 * (Meta deduplica personas). Por eso el alcance derivado se marca como estimado.
 */
async function deriveCampaignMetricsFromAds(
  companyId: string,
  parsed: ParsedAdRow[],
  campaignIdByExt: Map<string, string>,
  errors: string[],
): Promise<number> {
  type Bucket = {
    campaignExt: string;
    campaignName: string | null;
    ymd: string;
    recordDate: Date;
    acc: AdRollup;
    adCount: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const r of parsed) {
    const key = `${r.externalCampaignId}|${r.ymd}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        campaignExt: r.externalCampaignId,
        campaignName: r.campaignName,
        ymd: r.ymd,
        recordDate: r.recordDate,
        acc: emptyRollup(),
        adCount: 0,
      };
      buckets.set(key, b);
    }
    if (r.campaignName && !b.campaignName) b.campaignName = r.campaignName;
    addToRollup(b.acc, r);
    b.adCount += 1;
  }

  let written = 0;
  for (const b of buckets.values()) {
    const campaignId = campaignIdByExt.get(b.campaignExt);
    if (!campaignId) continue;

    const rates = deriveRates(b.acc);
    const snapshot: Record<string, string | number | boolean | null> = {
      "Campaign ID": b.campaignExt,
      "Campaign name": b.campaignName,
      "Importe gastado (COP)": b.acc.spend,
      "Link clicks": b.acc.linkClicks || null,
      "Conversaciones con mensajes iniciadas": b.acc.conversations || null,
      Compras: b.acc.purchases,
      "Valor de conversión": b.acc.conversionValue,
      "Costo por compra": rates.costPerPurchase,
      ROAS: rates.roas,
      Impressions: b.acc.impressions || null,
      Reach: b.acc.reach || null,
      Clicks: b.acc.clicks || null,
      CTR: rates.ctr,
      CPC: rates.cpc,
      CPM: rates.cpm,
      Day: b.ymd,
      _metaApiSource: true,
      _derivedFromAds: true,
      _adRowsAggregated: b.adCount,
      _reachIsSumNotDeduped: true,
    };

    try {
      await prisma.advertisingCampaignMetric.upsert({
        where: { campaignId_recordDate: { campaignId, recordDate: b.recordDate } },
        create: {
          companyId,
          campaignId,
          recordDate: b.recordDate,
          metaLinkClicks: b.acc.linkClicks || null,
          metaConversationsStarted: b.acc.conversations || null,
          shopifySessions: null,
          metaExcelSnapshot: snapshot as Prisma.InputJsonValue,
        },
        update: {
          metaLinkClicks: b.acc.linkClicks || null,
          metaConversationsStarted: b.acc.conversations || null,
          // shopifySessions se deja intacto: puede haberlo puesto el usuario a mano.
          metaExcelSnapshot: snapshot as Prisma.InputJsonValue,
        },
      });
      written += 1;
    } catch (e) {
      errors.push(
        `Nivel campaña ${b.campaignExt} ${b.ymd}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return written;
}

/** Import sobre varias cuentas; una cuenta que falle no tumba a las demás. */
export async function importAdsForAccounts(
  companyId: string,
  advertisingAccountIds: string[],
  opts: {
    desde: string;
    hasta: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
    deriveCampaignMetrics?: boolean;
  },
): Promise<{ results: AdImportResult[]; errors: string[] }> {
  const results: AdImportResult[] = [];
  const errors: string[] = [];

  for (const accountId of advertisingAccountIds) {
    try {
      results.push(await importAdsForAccount(companyId, accountId, opts));
    } catch (e) {
      errors.push(`Cuenta ${accountId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { results, errors };
}
