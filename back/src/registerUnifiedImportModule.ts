import type express from "express";
import { z } from "zod";
import { authRequired, companyRequired, requirePermission } from "./middleware";
import type { JwtPayload } from "./types";
import { AD_API_MAX_RANGE_DAYS, validateAdApiDateRange } from "./metaAdsAdInsightsService";
import { normalizeCampaignMapKey } from "./metaCampaignExcelParse";
import { prisma } from "./prisma";
import {
  chunkRange,
  runUnifiedImport,
  UNIFIED_CHUNK_DAYS,
  type PlannedCampaignRow,
} from "./unifiedImportService";
import type { UnifiedImportScope } from "./unifiedImportTypes";

/**
 * Rutas del import unificado.
 *
 * Tres niveles de compromiso, y el permiso sube con ellos:
 * - `validate-range` y `preview` solo leen de Meta;
 * - `dry-run` calcula exactamente lo que escribiría, sin tocar la base;
 * - `meta-api` escribe, y es la única que exige el permiso de acción.
 */

function user(req: express.Request): JwtPayload {
  return (req as express.Request & { user?: JwtPayload }).user!;
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa formato YYYY-MM-DD.");

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("product"),
    catalogProductId: z.string().min(1, "Elige un producto."),
    advertisingAccountIds: z.array(z.string().min(1)).optional(),
    selectedCampaignIds: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    kind: z.literal("all"),
    advertisingAccountIds: z.array(z.string().min(1)).optional(),
    selectedCampaignIds: z.array(z.string().min(1)).optional(),
  }),
]);

const bodySchema = z.object({
  scope: scopeSchema,
  desde: ymd,
  hasta: ymd,
  runId: z.string().min(1).optional(),
  withCampaignLevelPass: z.boolean().optional(),
  useShopifySessions: z.boolean().optional(),
  shopifySessionsByDayAndCampaign: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  metaAdsAppId: z.string().min(1).nullable().optional(),
  metaAdsSystemUserId: z.string().min(1).nullable().optional(),
});

/** IDs externos normalizados de las campañas ya vinculadas a un producto. */
async function campaignsLinkedToProduct(
  companyId: string,
  catalogProductId: string,
): Promise<Set<string>> {
  const links = await prisma.catalogProductAdvertisingCampaign.findMany({
    where: { companyId, catalogProductId },
    select: { campaign: { select: { externalCampaignId: true } } },
  });
  return new Set(links.map((l) => normalizeCampaignMapKey(l.campaign.externalCampaignId)));
}

/** Resumen por campaña de lo que traería el import, para la lista de selección. */
function summarizeByCampaign(
  planned: PlannedCampaignRow[],
  yaVinculadas: Set<string>,
): Array<{
  externalCampaignId: string;
  displayName: string | null;
  days: number;
  spend: number;
  linkedToProduct: boolean;
}> {
  const porCampaña = new Map<
    string,
    { externalCampaignId: string; displayName: string | null; days: number; spend: number }
  >();

  for (const p of planned) {
    const key = normalizeCampaignMapKey(p.externalCampaignId);
    const acc = porCampaña.get(key) ?? {
      externalCampaignId: p.externalCampaignId,
      displayName: p.campaignName,
      days: 0,
      spend: 0,
    };
    if (p.campaignName && !acc.displayName) acc.displayName = p.campaignName;
    acc.days += 1;
    acc.spend += p.spend;
    porCampaña.set(key, acc);
  }

  return [...porCampaña.entries()]
    .map(([key, v]) => ({
      externalCampaignId: v.externalCampaignId,
      displayName: v.displayName,
      days: v.days,
      spend: Math.round(v.spend * 100) / 100,
      linkedToProduct: yaVinculadas.has(key),
    }))
    .sort((a, b) => b.spend - a.spend);
}

function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function registerUnifiedImportModule(app: express.Express): void {
  /** Valida el rango y avisa de en cuántos tramos se va a consultar. */
  app.get(
    "/api/import-unificado/validate-range",
    authRequired,
    companyRequired,
    requirePermission("moduleImportUnificado"),
    (req, res) => {
      const desde = String(req.query.desde ?? "");
      const hasta = String(req.query.hasta ?? "");
      const v = validateAdApiDateRange(desde, hasta);
      if (!v.ok) {
        return res
          .status(400)
          .json({ ok: false, message: v.message, maxDays: AD_API_MAX_RANGE_DAYS });
      }
      const chunks = chunkRange(v.desde, v.hasta);
      return res.json({
        ok: true,
        desde: v.desde,
        hasta: v.hasta,
        days: v.days,
        maxDays: AD_API_MAX_RANGE_DAYS,
        chunks,
        chunkDays: UNIFIED_CHUNK_DAYS,
      });
    },
  );

  /**
   * Consulta Meta y devuelve qué campañas hay, para poder elegirlas antes de escribir.
   *
   * Devuelve un `runId`: si se manda de vuelta en `dry-run` o en el import, se reutilizan
   * las filas ya traídas y no se vuelve a consultar a Meta.
   */
  app.post(
    "/api/import-unificado/preview",
    authRequired,
    companyRequired,
    requirePermission("moduleImportUnificado"),
    async (req, res) => {
      const u = user(req);
      const parsed = bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? "Payload inválido." });
      }

      try {
        // La vista previa nunca filtra por campañas: son justamente las que hay que elegir.
        const scope = { ...parsed.data.scope, selectedCampaignIds: undefined } as UnifiedImportScope;
        const r = await runUnifiedImport(u.companyId, {
          scope,
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          dryRun: true,
          withCampaignLevelPass: parsed.data.withCampaignLevelPass,
          metaAdsAppId: parsed.data.metaAdsAppId ?? null,
          metaAdsSystemUserId: parsed.data.metaAdsSystemUserId ?? null,
          runId: parsed.data.runId,
        });

        const yaVinculadas =
          r.scope.kind === "product" && r.scope.catalogProductId
            ? await campaignsLinkedToProduct(u.companyId, r.scope.catalogProductId)
            : new Set<string>();

        const campaigns = summarizeByCampaign(r.planned, yaVinculadas);

        return res.json({
          runId: r.runId,
          scope: r.scope,
          desde: r.desde,
          hasta: r.hasta,
          chunks: r.chunks,
          accountsQueried: r.counters.accountsQueried,
          adRowsFetched: r.counters.adRowsFetched,
          campaigns,
          // Preselección: lo que ya es del producto viene marcado.
          defaultSelectedCampaignIds: campaigns
            .filter((c) => c.linkedToProduct)
            .map((c) => c.externalCampaignId),
          warnings: r.warnings,
          errors: r.errors,
        });
      } catch (e) {
        return res.status(400).json({ message: mensajeDeError(e) });
      }
    },
  );

  /**
   * Simulación completa: calcula fila por fila lo que escribiría y lo compara con lo que
   * hay hoy. No toca la base. Es la comprobación más barata antes de un import de verdad.
   */
  app.post(
    "/api/import-unificado/dry-run",
    authRequired,
    companyRequired,
    requirePermission("moduleImportUnificado"),
    async (req, res) => {
      const u = user(req);
      const parsed = bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? "Payload inválido." });
      }

      try {
        const r = await runUnifiedImport(u.companyId, {
          scope: parsed.data.scope,
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          dryRun: true,
          withCampaignLevelPass: parsed.data.withCampaignLevelPass,
          useShopifySessions: parsed.data.useShopifySessions,
          shopifySessionsByDayAndCampaign: parsed.data.shopifySessionsByDayAndCampaign,
          metaAdsAppId: parsed.data.metaAdsAppId ?? null,
          metaAdsSystemUserId: parsed.data.metaAdsSystemUserId ?? null,
          runId: parsed.data.runId,
        });

        const spendNuevo = r.planned.reduce((n, p) => n + p.spend, 0);
        const spendAnterior = r.planned.reduce((n, p) => n + (p.previousSpend ?? 0), 0);

        return res.json({
          runId: r.runId,
          scope: r.scope,
          desde: r.desde,
          hasta: r.hasta,
          chunks: r.chunks,
          counters: r.counters,
          totals: {
            campaignDayRows: r.planned.length,
            spend: Math.round(spendNuevo * 100) / 100,
            previousSpend: Math.round(spendAnterior * 100) / 100,
            spendDelta: Math.round((spendNuevo - spendAnterior) * 100) / 100,
            // Filas que hoy no existen: el import las crearía.
            newRows: r.planned.filter((p) => p.previousSpend === null).length,
          },
          rows: r.planned.map((p) => ({
            externalCampaignId: p.externalCampaignId,
            campaignName: p.campaignName,
            ymd: p.ymd,
            spend: p.spend,
            previousSpend: p.previousSpend,
            metaLinkClicks: p.metaLinkClicks,
            metaConversationsStarted: p.metaConversationsStarted,
            shopifySessions: p.shopifySessions,
            snapshot: p.snapshot,
          })),
          unlinkedCampaigns: r.unlinkedCampaigns,
          linkConflicts: r.linkConflicts,
          warnings: r.warnings,
          errors: r.errors,
        });
      } catch (e) {
        return res.status(400).json({ message: mensajeDeError(e) });
      }
    },
  );

  /** El import de verdad. Única ruta que escribe, y la única con permiso de acción. */
  app.post(
    "/api/import-unificado/meta-api",
    authRequired,
    companyRequired,
    requirePermission("actionImportUnificadoApi"),
    async (req, res) => {
      const u = user(req);
      const parsed = bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? "Payload inválido." });
      }

      try {
        const r = await runUnifiedImport(u.companyId, {
          scope: parsed.data.scope,
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          dryRun: false,
          withCampaignLevelPass: parsed.data.withCampaignLevelPass,
          useShopifySessions: parsed.data.useShopifySessions,
          shopifySessionsByDayAndCampaign: parsed.data.shopifySessionsByDayAndCampaign,
          metaAdsAppId: parsed.data.metaAdsAppId ?? null,
          metaAdsSystemUserId: parsed.data.metaAdsSystemUserId ?? null,
          runId: parsed.data.runId,
        });

        return res.json({
          runId: r.runId,
          scope: r.scope,
          desde: r.desde,
          hasta: r.hasta,
          chunks: r.chunks,
          counters: r.counters,
          spend:
            Math.round(r.planned.reduce((n, p) => n + p.spend, 0) * 100) / 100,
          unlinkedCampaigns: r.unlinkedCampaigns,
          linkConflicts: r.linkConflicts,
          warnings: r.warnings,
          errors: r.errors,
        });
      } catch (e) {
        return res.status(400).json({ message: mensajeDeError(e) });
      }
    },
  );
}
