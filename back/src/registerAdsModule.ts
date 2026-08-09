import type express from "express";
import { z } from "zod";
import { authRequired, companyRequired, requirePermission } from "./middleware";
import type { JwtPayload } from "./types";
import { getAdsHierarchy, queryAdMetrics, type AdLevel } from "./adAnalyticsService";
import { importAdsForAccounts } from "./adImportService";
import { AD_API_MAX_RANGE_DAYS, validateAdApiDateRange } from "./metaAdsAdInsightsService";

function user(req: express.Request): JwtPayload {
  return (req as express.Request & { user?: JwtPayload }).user!;
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa formato YYYY-MM-DD.");

/** `a,b,c` o `?x=a&x=b` → string[] */
function csvList(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const arr = Array.isArray(raw) ? raw.map(String) : String(raw).split(",");
  const out = arr.map((s) => s.trim()).filter(Boolean);
  return out.length > 0 ? out : undefined;
}

const querySchema = z.object({
  desde: ymd,
  hasta: ymd,
  level: z.enum(["campaign", "adset", "ad"]).default("ad"),
  daily: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
  cpaObjetivo: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    }),
});

const importSchema = z.object({
  advertisingAccountIds: z.array(z.string().min(1)).min(1, "Elige al menos una cuenta publicitaria."),
  desde: ymd,
  hasta: ymd,
  metaAdsAppId: z.string().min(1).nullable().optional(),
  metaAdsSystemUserId: z.string().min(1).nullable().optional(),
  deriveCampaignMetrics: z.boolean().optional(),
});

export function registerAdsModule(app: express.Express): void {
  /** Cuentas → campañas → conjuntos con anuncios, para los filtros de la vista. */
  app.get(
    "/api/ads/hierarchy",
    authRequired,
    companyRequired,
    requirePermission("moduleAnuncios"),
    async (req, res) => {
      const u = user(req);
      try {
        return res.json(await getAdsHierarchy(u.companyId));
      } catch (e) {
        return res.status(500).json({ message: e instanceof Error ? e.message : "Error al leer la jerarquía." });
      }
    },
  );

  /** Métricas agregadas por nivel, con desglose día a día opcional y semáforo de descarte. */
  app.get(
    "/api/ads/metrics",
    authRequired,
    companyRequired,
    requirePermission("moduleAnuncios"),
    async (req, res) => {
      const u = user(req);
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." });
      }
      try {
        const result = await queryAdMetrics(u.companyId, {
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          level: parsed.data.level as AdLevel,
          daily: parsed.data.daily,
          cpaObjetivo: parsed.data.cpaObjetivo,
          advertisingAccountIds: csvList(req.query.advertisingAccountIds),
          campaignIds: csvList(req.query.campaignIds),
          adSetIds: csvList(req.query.adSetIds),
        });
        return res.json(result);
      } catch (e) {
        return res.status(400).json({ message: e instanceof Error ? e.message : "Error al consultar anuncios." });
      }
    },
  );

  /** Valida el rango antes de gastar una llamada a Meta. */
  app.get(
    "/api/ads/import/validate-range",
    authRequired,
    companyRequired,
    requirePermission("moduleAnuncios"),
    (req, res) => {
      const desde = String(req.query.desde ?? "");
      const hasta = String(req.query.hasta ?? "");
      const v = validateAdApiDateRange(desde, hasta);
      if (!v.ok) return res.status(400).json({ ok: false, message: v.message, maxDays: AD_API_MAX_RANGE_DAYS });
      return res.json({
        ok: true,
        desde: v.desde,
        hasta: v.hasta,
        days: v.days,
        maxDays: AD_API_MAX_RANGE_DAYS,
      });
    },
  );

  /**
   * Trae anuncios desde la API de Meta y los persiste.
   * Es una sola llamada por cuenta gracias a `time_increment=1`, así que no hay
   * progreso por día que reportar como en el import de campañas.
   */
  app.post(
    "/api/ads/import/meta-api",
    authRequired,
    companyRequired,
    requirePermission("actionImportarAnuncios"),
    async (req, res) => {
      const u = user(req);
      const parsed = importSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Payload inválido." });
      }

      const v = validateAdApiDateRange(parsed.data.desde, parsed.data.hasta);
      if (!v.ok) return res.status(400).json({ message: v.message });

      try {
        const { results, errors } = await importAdsForAccounts(
          u.companyId,
          parsed.data.advertisingAccountIds,
          {
            desde: v.desde,
            hasta: v.hasta,
            metaAdsAppId: parsed.data.metaAdsAppId ?? null,
            metaAdsSystemUserId: parsed.data.metaAdsSystemUserId ?? null,
            deriveCampaignMetrics: parsed.data.deriveCampaignMetrics,
          },
        );

        const totals = results.reduce(
          (acc, r) => ({
            campaignsCreated: acc.campaignsCreated + r.campaignsCreated,
            adSetsCreated: acc.adSetsCreated + r.adSetsCreated,
            adsCreated: acc.adsCreated + r.adsCreated,
            adMetricsWritten: acc.adMetricsWritten + r.adMetricsWritten,
            campaignMetricsWritten: acc.campaignMetricsWritten + r.campaignMetricsWritten,
          }),
          {
            campaignsCreated: 0,
            adSetsCreated: 0,
            adsCreated: 0,
            adMetricsWritten: 0,
            campaignMetricsWritten: 0,
          },
        );

        if (results.length === 0) {
          return res.status(502).json({ message: errors[0] ?? "Ninguna cuenta pudo importarse.", errors });
        }

        return res.json({ desde: v.desde, hasta: v.hasta, results, totals, errors });
      } catch (e) {
        return res.status(502).json({ message: e instanceof Error ? e.message : "Error al consultar Meta API." });
      }
    },
  );
}
