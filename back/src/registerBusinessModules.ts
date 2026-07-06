import express from "express";
import multer from "multer";
import { z } from "zod";
import { OperationalExpenseCategory, Prisma, Role } from "@prisma/client";
import { authRequired, companyRequired, requireAnyPermission, requirePermission, requireRoles } from "./middleware";
import type { JwtPayload } from "./types";
import { prisma } from "./prisma";
import * as catalogProductService from "./catalogProductService";
import * as advertisingCampaignService from "./advertisingCampaignService";
import * as advertisingCampaignMetricService from "./advertisingCampaignMetricService";
import * as advertisingAccountService from "./advertisingAccountService";
import * as operationalExpenseService from "./operationalExpenseService";
import { importAdvertisingCampaignMetricsExcel } from "./importAdvertisingCampaignMetricsExcel";
import {
  buildImportPreviewPayload,
  importAdvertisingCampaignMetrics,
} from "./importAdvertisingCampaignMetrics";
import { importMetaBillingOperationalCsv } from "./importMetaBillingOperationalCsv";
import {
  importMetaBillingApiToOperationalExpenses,
  previewMetaBillingApiImport,
} from "./metaBillingOperationalImport";
import { assertWipePassword } from "./wipeImported";
import { normalizeCampaignMapKey, parseMetaCampaignMetricsExcel } from "./metaCampaignExcelParse";
import {
  fetchMetaApiParsedRowsForAccount,
  previewMetaApiCampaignImport,
} from "./metaApiCampaignImport";

const upload = multer({ storage: multer.memoryStorage() });

/** Acepta string o número en JSON (Excel/import) para campos de variante Dropi. */
const zDropiLinkField = z.preprocess((v) => {
  if (v === undefined || v === "") return undefined;
  if (v === null) return null;
  return String(v);
}, z.string().nullable().optional());

function user(req: express.Request): JwtPayload {
  return (req as express.Request & { user?: JwtPayload }).user!;
}

async function requireOperationalExpenseEnabled(req: express.Request, res: express.Response, next: express.NextFunction) {
  const u = user(req);
  const c = await prisma.company.findUnique({
    where: { id: u.companyId },
    select: { operationalExpenseEnabled: true },
  });
  if (!c?.operationalExpenseEnabled) {
    return res.status(403).json({ message: "Módulo de gastos operacionales no habilitado para esta empresa." });
  }
  return next();
}

function normalizeShopifySessionsMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeCampaignMapKey(k);
    const n = Number(v);
    if (!Number.isNaN(n) && key) out[key] = Math.round(n);
  }
  return out;
}

const importOptionsSchema = z.object({
  useShopifySessions: z.boolean().optional().default(false),
  shopifySessionsByCampaignId: z.record(z.string(), z.coerce.number()).optional().default({}),
  applyAdvertisingAccount: z.boolean().optional().default(false),
  advertisingAccountId: z.string().nullable().optional(),
  /** IDs de campaña Meta (se normalizan en servidor). Si se omite, se importan todas las del archivo. */
  allowedCampaignIds: z.array(z.string().min(1)).min(1).max(500).optional(),
});

const metaApiImportOptionsSchema = z.object({
  advertisingAccountId: z.string().min(1),
  metaAdsAppId: z.string().min(1).optional().nullable(),
  metaAdsSystemUserId: z.string().min(1).optional().nullable(),
  reportDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).")
    .optional()
    .nullable(),
  useShopifySessions: z.boolean().optional().default(false),
  shopifySessionsByCampaignId: z.record(z.string(), z.coerce.number()).optional().default({}),
  applyAdvertisingAccount: z.boolean().optional().default(true),
  allowedCampaignIds: z.array(z.string().min(1)).min(1).max(500).optional(),
});

export function registerBusinessModules(app: express.Application) {
  app.get("/api/catalog-products", authRequired, companyRequired, requireAnyPermission(["moduleCatalogoProductos", "moduleCampanasMeta", "moduleCuentasPublicitarias"]), async (req, res) => {
    const u = user(req);
    const list = await catalogProductService.listCatalogProducts(u.companyId);
    return res.json(list);
  });

  app.post(
    "/api/catalog-products",
    authRequired,
    companyRequired,
    requirePermission("actionCatalogoProductosCrud"),
    async (req, res) => {
      const u = user(req);
      const parsed = z.object({ name: z.string().min(1), sku: z.string().optional(), notes: z.string().optional() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const row = await catalogProductService.createCatalogProduct(u.companyId, parsed.data);
      return res.status(201).json(row);
    },
  );

  app.patch(
    "/api/catalog-products/:id",
    authRequired,
    companyRequired,
    requirePermission("actionCatalogoProductosCrud"),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id);
      const parsed = z
        .object({
          name: z.string().min(1).optional(),
          sku: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          isActive: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const r = await catalogProductService.updateCatalogProduct(u.companyId, id, parsed.data);
      if (r.count === 0) return res.status(404).json({ message: "No encontrado." });
      const row = await catalogProductService.getCatalogProduct(u.companyId, id);
      return res.json(row);
    },
  );

  app.delete(
    "/api/catalog-products/:id",
    authRequired,
    companyRequired,
    requirePermission("actionCatalogoProductosCrud"),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id);
      const ok = await catalogProductService.deleteCatalogProduct(u.companyId, id);
      if (!ok) return res.status(404).json({ message: "Producto no encontrado." });
      return res.status(204).send();
    },
  );

  app.post(
    "/api/catalog-products/merge",
    authRequired,
    companyRequired,
    requirePermission("actionCatalogoProductosCrud"),
    async (req, res) => {
      const u = user(req);
      const parsed = z
        .object({
          targetId: z.string().min(1),
          sourceIds: z.array(z.string().min(1)).min(1).max(50),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });

      const result = await catalogProductService.mergeCatalogProducts(
        u.companyId,
        parsed.data.targetId,
        parsed.data.sourceIds,
      );
      if (!result.ok) {
        const msg =
          result.code === "TARGET_NOT_FOUND" || result.code === "SOURCE_NOT_FOUND"
            ? "Producto no encontrado."
            : result.code === "SAME_PRODUCT"
              ? "El producto destino no puede estar entre los que se unen."
              : "Indica al menos un producto a unir.";
        return res.status(400).json({ message: msg });
      }
      const row = await catalogProductService.getCatalogProduct(u.companyId, parsed.data.targetId);
      return res.json({
        merged: result.merged,
        skipped_dropi_links: result.skippedDropiLinks,
        product: row,
      });
    },
  );

  app.get(
    "/api/catalog-products/:productId/dropi-links",
    authRequired,
    companyRequired,
    requirePermission("moduleCatalogoProductos"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });
      const list = await catalogProductService.listDropiLinks(u.companyId, productId);
      return res.json(
        list.map((l) => ({
          id: l.id,
          variant_key: l.variantKey,
          producto_id: l.productoId,
          sku: l.sku,
          variacion_id: l.variacionId,
          producto_nombre: l.productoNombre,
          variacion: l.variacion,
          created_at: l.createdAt,
        })),
      );
    },
  );

  const dropiLinkBodySchema = z.object({
    productoId: zDropiLinkField,
    sku: zDropiLinkField,
    variacionId: zDropiLinkField,
    variacion: zDropiLinkField,
    productoNombre: z.string().nullable().optional(),
  });

  app.post(
    "/api/catalog-products/:productId/dropi-links/bulk",
    authRequired,
    companyRequired,
    requirePermission("actionCatalogoProductosCrud"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const parsed = z
        .object({
          variants: z.array(dropiLinkBodySchema).min(1).max(500),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido (variants requerido, 1–500)." });
      const result = await catalogProductService.bulkUpsertDropiLinks(u.companyId, productId, parsed.data.variants);
      if (!result.ok) {
        if (result.code === "NOT_FOUND") return res.status(404).json({ message: "Producto catálogo no encontrado." });
        return res.status(400).json({ message: "No se pudo vincular." });
      }
      return res.status(200).json({
        applied: result.applied,
        skipped_conflict: result.skippedConflict,
        conflicts: result.conflicts,
      });
    },
  );

  app.post(
    "/api/catalog-products/:productId/dropi-links",
    authRequired,
    companyRequired,
    requirePermission("actionCatalogoProductosCrud"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const parsed = dropiLinkBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const result = await catalogProductService.upsertDropiLink(u.companyId, productId, parsed.data);
      if (!result.ok) {
        if (result.code === "NOT_FOUND") return res.status(404).json({ message: "Producto catálogo no encontrado." });
        if (result.code === "VARIANT_IN_USE") {
          return res.status(409).json({
            message: "Esta variante Dropi ya está vinculada a otro producto del catálogo.",
          });
        }
        return res.status(400).json({ message: "No se pudo vincular." });
      }
      return res.status(201).json({
        id: result.row.id,
        variant_key: result.row.variantKey,
        producto_id: result.row.productoId,
        sku: result.row.sku,
        variacion_id: result.row.variacionId,
        producto_nombre: result.row.productoNombre,
        variacion: result.row.variacion,
      });
    },
  );

  app.delete(
    "/api/catalog-products/:productId/dropi-links/:linkId",
    authRequired,
    companyRequired,
    requirePermission("actionCatalogoProductosCrud"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const linkId = String(req.params.linkId);
      const ok = await catalogProductService.deleteDropiLink(u.companyId, productId, linkId);
      if (!ok) return res.status(404).json({ message: "Vínculo no encontrado." });
      return res.status(204).send();
    },
  );

  app.get(
    "/api/catalog-products/:productId/advertising-campaigns",
    authRequired,
    companyRequired,
    requirePermission("moduleCampanasMeta"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });
      const list = await advertisingCampaignService.listAdvertisingCampaigns(u.companyId, productId);
      return res.json(list);
    },
  );

  app.post(
    "/api/catalog-products/:productId/advertising-campaigns",
    authRequired,
    companyRequired,
    requirePermission("actionCampanasMetaCrud"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });
      const parsed = z
        .object({
          externalCampaignId: z.string().min(1),
          displayName: z.string().optional(),
          advertisingAccountId: z.string().nullable().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const row = await advertisingCampaignService.createAdvertisingCampaign(u.companyId, {
        catalogProductId: productId,
        externalCampaignId: parsed.data.externalCampaignId,
        displayName: parsed.data.displayName,
        advertisingAccountId: parsed.data.advertisingAccountId,
      });
      return res.status(201).json(row);
    },
  );

  app.delete(
    "/api/catalog-products/:productId/advertising-campaigns/:campaignId",
    authRequired,
    companyRequired,
    requirePermission("actionCampanasMetaCrud"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const campaignId = String(req.params.campaignId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });
      const ok = await advertisingCampaignService.unlinkCampaignFromProduct(u.companyId, productId, campaignId);
      if (!ok) return res.status(404).json({ message: "Vínculo no encontrado." });
      return res.status(204).send();
    },
  );

  app.patch(
    "/api/advertising-campaigns/:id/products",
    authRequired,
    companyRequired,
    requirePermission("actionCampanasMetaCrud"),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id);
      const parsed = z.object({ catalogProductIds: z.array(z.string().min(1)) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const row = await advertisingCampaignService.setCampaignProductLinks(
        u.companyId,
        id,
        parsed.data.catalogProductIds,
      );
      if (!row) return res.status(404).json({ message: "Campaña no encontrada." });
      return res.json(row);
    },
  );

  app.get(
    "/api/catalog-products/:productId/advertising-accounts",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleCampanasMeta", "moduleCatalogoProductos"]),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });
      const list = await catalogProductService.listProductAdvertisingAccounts(u.companyId, productId);
      return res.json(list);
    },
  );

  app.put(
    "/api/catalog-products/:productId/advertising-accounts",
    authRequired,
    companyRequired,
    requireAnyPermission(["actionCampanasMetaCrud", "actionCatalogoProductosCrud"]),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const parsed = z.object({ advertisingAccountIds: z.array(z.string()) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const result = await catalogProductService.replaceProductAdvertisingAccounts(
        u.companyId,
        productId,
        parsed.data.advertisingAccountIds,
      );
      if (!result.ok) return res.status(404).json({ message: "Producto no encontrado." });
      return res.json(result.accounts);
    },
  );

  app.patch(
    "/api/advertising-campaigns/:id",
    authRequired,
    companyRequired,
    requirePermission("actionCampanasMetaCrud"),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id);
      const parsed = z
        .object({
          displayName: z.string().nullable().optional(),
          advertisingAccountId: z.string().nullable().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const row = await advertisingCampaignService.updateAdvertisingCampaign(u.companyId, id, parsed.data);
      if (!row) return res.status(404).json({ message: "No encontrado." });
      return res.json(row);
    },
  );

  app.delete(
    "/api/advertising-campaigns/:id",
    authRequired,
    companyRequired,
    requirePermission("actionCampanasMetaCrud"),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id);
      const ok = await advertisingCampaignService.deleteAdvertisingCampaign(u.companyId, id);
      if (!ok) return res.status(404).json({ message: "No encontrado." });
      return res.status(204).send();
    },
  );

  app.get(
    "/api/advertising-campaigns/:campaignId/metrics",
    authRequired,
    companyRequired,
    requirePermission("moduleCampanasMeta"),
    async (req, res) => {
      const u = user(req);
      const campaignId = String(req.params.campaignId);
      const camp = await advertisingCampaignService.getAdvertisingCampaign(u.companyId, campaignId);
      if (!camp) return res.status(404).json({ message: "Campaña no encontrada." });
      const list = await advertisingCampaignMetricService.listMetricsForCampaign(u.companyId, campaignId);
      return res.json(list);
    },
  );

  app.patch(
    "/api/advertising-campaign-metrics/:metricId",
    authRequired,
    companyRequired,
    requirePermission("actionEditarMetricasAdvertising"),
    async (req, res) => {
      const u = user(req);
      const metricId = String(req.params.metricId);
      const parsed = z
        .object({
          metaLinkClicks: z.number().int().nullable().optional(),
          metaConversationsStarted: z.number().int().nullable().optional(),
          shopifySessions: z.number().int().nullable().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const row = await advertisingCampaignMetricService.patchAdvertisingCampaignMetric(u.companyId, metricId, parsed.data);
      if (!row) return res.status(404).json({ message: "Métrica no encontrada." });
      return res.json(row);
    },
  );

  app.delete(
    "/api/advertising-campaign-metrics/:metricId",
    authRequired,
    companyRequired,
    requirePermission("actionEditarMetricasAdvertising"),
    async (req, res) => {
      const u = user(req);
      const metricId = String(req.params.metricId);
      const ok = await advertisingCampaignMetricService.deleteAdvertisingCampaignMetric(u.companyId, metricId);
      if (!ok) return res.status(404).json({ message: "Métrica no encontrada." });
      return res.status(204).send();
    },
  );

  app.post(
    "/api/catalog-products/:productId/advertising-campaigns/import/preview",
    authRequired,
    companyRequired,
    requirePermission("moduleCampanasMeta"),
    upload.single("file"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });
      const file = req.file;
      if (!file?.buffer) return res.status(400).json({ message: "Archivo requerido." });
      const { rows, errors } = parseMetaCampaignMetricsExcel(file.buffer, {
        sourceFilename: file.originalname,
      });
      const prePayload = buildImportPreviewPayload(rows, errors, { source: "file" });
      const defaultSelectedCampaignIds = await advertisingCampaignService.resolveDefaultSelectedCampaignIds(
        u.companyId,
        productId,
        null,
        prePayload.uniqueCampaignIds,
      );
      const payload = buildImportPreviewPayload(rows, errors, {
        source: "file",
        defaultSelectedCampaignIds,
      });
      return res.json({
        ...payload,
        sampleRows: payload.sampleRows.map((r) => ({
          ...r,
          recordDate: r.recordDate instanceof Date ? r.recordDate.toISOString() : String(r.recordDate),
        })),
      });
    },
  );

  app.post(
    "/api/catalog-products/:productId/advertising-campaigns/import/meta-api/preview",
    authRequired,
    companyRequired,
    requirePermission("moduleCampanasMeta"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });

      const parsed = metaApiImportOptionsSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido: se requiere advertisingAccountId." });

      const acc = await advertisingAccountService.getAdvertisingAccount(u.companyId, parsed.data.advertisingAccountId);
      if (!acc) return res.status(400).json({ message: "Cuenta publicitaria no encontrada." });

      try {
        const preview = await previewMetaApiCampaignImport(
          u.companyId,
          parsed.data.advertisingAccountId,
          {
            metaAdsAppId: parsed.data.metaAdsAppId,
            metaAdsSystemUserId: parsed.data.metaAdsSystemUserId,
            reportDate: parsed.data.reportDate,
          },
        );
        const defaultSelectedCampaignIds = await advertisingCampaignService.resolveDefaultSelectedCampaignIds(
          u.companyId,
          productId,
          parsed.data.advertisingAccountId,
          preview.uniqueCampaignIds,
        );
        return res.json({
          ...preview,
          defaultSelectedCampaignIds,
          sampleRows: preview.sampleRows.map((r) => ({
            ...r,
            recordDate: r.recordDate instanceof Date ? r.recordDate.toISOString() : String(r.recordDate),
          })),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al consultar Meta API.";
        return res.status(502).json({ message: msg });
      }
    },
  );

  app.post(
    "/api/catalog-products/:productId/advertising-campaigns/import/meta-api",
    authRequired,
    companyRequired,
    requirePermission("actionImportarAdvertisingCampaigns"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });

      const parsed = metaApiImportOptionsSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido: se requiere advertisingAccountId." });

      const acc = await advertisingAccountService.getAdvertisingAccount(u.companyId, parsed.data.advertisingAccountId);
      if (!acc) return res.status(400).json({ message: "Cuenta publicitaria no encontrada." });

      const shopifyMap = normalizeShopifySessionsMap(parsed.data.shopifySessionsByCampaignId);
      const normalizedAllowedIds =
        parsed.data.allowedCampaignIds != null
          ? [
              ...new Set(
                parsed.data.allowedCampaignIds.map((id) => normalizeCampaignMapKey(id)).filter((k) => k.length > 0),
              ),
            ]
          : [];

      try {
        const { parsedRows, errors: fetchErrors } = await fetchMetaApiParsedRowsForAccount(
          u.companyId,
          parsed.data.advertisingAccountId,
          {
            metaAdsAppId: parsed.data.metaAdsAppId,
            metaAdsSystemUserId: parsed.data.metaAdsSystemUserId,
            reportDate: parsed.data.reportDate,
          },
        );

        const result = await importAdvertisingCampaignMetrics(
          u.companyId,
          productId,
          parsedRows,
          {
            useShopifySessions: parsed.data.useShopifySessions,
            shopifySessionsByCampaignId: shopifyMap,
            applyAdvertisingAccount: parsed.data.applyAdvertisingAccount,
            advertisingAccountId: parsed.data.applyAdvertisingAccount ? parsed.data.advertisingAccountId : null,
            ...(normalizedAllowedIds.length > 0 ? { allowedCampaignIds: normalizedAllowedIds } : {}),
          },
          fetchErrors,
        );

        return res.json(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al importar desde Meta API.";
        return res.status(502).json({ message: msg });
      }
    },
  );

  app.post(
    "/api/catalog-products/:productId/advertising-campaigns/import",
    authRequired,
    companyRequired,
    requirePermission("actionImportarAdvertisingCampaigns"),
    upload.single("file"),
    async (req, res) => {
      const u = user(req);
      const productId = String(req.params.productId);
      const p = await catalogProductService.getCatalogProduct(u.companyId, productId);
      if (!p) return res.status(404).json({ message: "Producto no encontrado." });
      const file = req.file;
      if (!file?.buffer) return res.status(400).json({ message: "Archivo requerido." });

      let optionsRaw: unknown = req.body?.options;
      if (typeof optionsRaw === "string") {
        try {
          optionsRaw = JSON.parse(optionsRaw) as unknown;
        } catch {
          return res.status(400).json({ message: "options JSON inválido." });
        }
      }
      const parsed = importOptionsSchema.safeParse(optionsRaw ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Opciones inválidas." });

      const shopifyMap = normalizeShopifySessionsMap(parsed.data.shopifySessionsByCampaignId);

      let advertisingAccountId: string | null = parsed.data.advertisingAccountId ?? null;
      if (parsed.data.applyAdvertisingAccount && advertisingAccountId) {
        const acc = await advertisingAccountService.getAdvertisingAccount(u.companyId, advertisingAccountId);
        if (!acc) return res.status(400).json({ message: "Cuenta publicitaria no encontrada." });
      }

      const normalizedAllowedIds =
        parsed.data.allowedCampaignIds != null
          ? [
              ...new Set(
                parsed.data.allowedCampaignIds.map((id) => normalizeCampaignMapKey(id)).filter((k) => k.length > 0),
              ),
            ]
          : [];

      const result = await importAdvertisingCampaignMetricsExcel(file.buffer, u.companyId, productId, {
        sourceFilename: file.originalname,
        useShopifySessions: parsed.data.useShopifySessions,
        shopifySessionsByCampaignId: shopifyMap,
        applyAdvertisingAccount: parsed.data.applyAdvertisingAccount,
        advertisingAccountId: parsed.data.applyAdvertisingAccount ? advertisingAccountId : null,
        ...(normalizedAllowedIds.length > 0 ? { allowedCampaignIds: normalizedAllowedIds } : {}),
      });

      return res.json(result);
    },
  );

  app.get(
    "/api/meta-campaign/advertising-accounts",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleCampanasMeta", "moduleCuentasPublicitarias"]),
    async (req, res) => {
      const u = user(req);
      const list = await advertisingAccountService.listAdvertisingAccounts(u.companyId);
      return res.json(list);
    },
  );

  app.post(
    "/api/meta-campaign/advertising-accounts",
    authRequired,
    companyRequired,
    requireAnyPermission(["actionCampanasMetaCrud", "actionCuentasPublicitariasCrud"]),
    async (req, res) => {
      const u = user(req);
      const parsed = z
        .object({ metaAccountId: z.string().min(1), businessName: z.string().optional() })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      try {
        const row = await advertisingAccountService.createAdvertisingAccount(
          u.companyId,
          parsed.data.metaAccountId,
          parsed.data.businessName,
        );
        return res.status(201).json(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(400).json({ message: msg });
      }
    },
  );

  app.get(
    "/api/advertising-accounts/with-stats",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleCampanasMeta", "moduleCuentasPublicitarias"]),
    async (req, res) => {
      const u = user(req);
      const accounts = await prisma.advertisingAccount.findMany({
        where: { companyId: u.companyId },
        include: {
          _count: { select: { advertisingCampaigns: true, operationalExpenses: true } },
        },
        orderBy: { metaAccountId: "asc" },
      });
      return res.json(accounts);
    },
  );

  app.get(
    "/api/advertising-accounts/:accountId/campaigns",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleCampanasMeta", "moduleCuentasPublicitarias"]),
    async (req, res) => {
      const u = user(req);
      const accountId = String(req.params.accountId);
      const acc = await advertisingAccountService.getAdvertisingAccount(u.companyId, accountId);
      if (!acc) return res.status(404).json({ message: "Cuenta no encontrada." });
      const list = await advertisingCampaignService.listAdvertisingCampaignsByAccount(u.companyId, accountId);
      return res.json(list);
    },
  );

  app.post(
    "/api/advertising-accounts/:accountId/campaigns",
    authRequired,
    companyRequired,
    requireAnyPermission(["actionCampanasMetaCrud", "actionCuentasPublicitariasCrud"]),
    async (req, res) => {
      const u = user(req);
      const accountId = String(req.params.accountId);
      const parsed = z
        .object({
          externalCampaignId: z.string().min(1),
          displayName: z.string().optional(),
          catalogProductIds: z.array(z.string().min(1)).min(1),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      try {
        const row = await advertisingCampaignService.createAdvertisingCampaignForAccount(u.companyId, accountId, {
          externalCampaignId: parsed.data.externalCampaignId,
          displayName: parsed.data.displayName,
          catalogProductIds: parsed.data.catalogProductIds,
        });
        return res.status(201).json(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(400).json({ message: msg });
      }
    },
  );

  app.get(
    "/api/advertising-accounts/:id/operational-expenses",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleCampanasMeta", "moduleCuentasPublicitarias"]),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id);
      const acc = await advertisingAccountService.getAdvertisingAccount(u.companyId, id);
      if (!acc) return res.status(404).json({ message: "Cuenta no encontrada." });
      const desde = operationalExpenseService.parseExpenseFilterDate(
        typeof req.query.desde === "string" ? req.query.desde : undefined,
      );
      const hasta = operationalExpenseService.parseExpenseFilterDate(
        typeof req.query.hasta === "string" ? req.query.hasta : undefined,
      );
      const range = desde || hasta ? { desde, hasta } : undefined;
      const [summary, rows] = await Promise.all([
        operationalExpenseService.summarizeOperationalExpensesByAdvertisingAccount(u.companyId, id, range),
        operationalExpenseService.listOperationalExpensesByAdvertisingAccount(u.companyId, id, range),
      ]);
      return res.json({
        summary,
        items: rows.map((x) => ({
          id: x.id,
          fecha: x.fecha.toISOString(),
          monto: x.monto != null ? Number(x.monto) : 0,
          concepto: x.concepto,
          categoria: x.categoria,
          banco: x.banco,
          medio: x.medio,
          cuentaPublicitaria: x.cuentaPublicitaria,
          advertisingAccountId: x.advertisingAccountId,
          notas: x.notas,
          pagado: x.pagado,
          advertisingAccount: x.advertisingAccount,
        })),
      });
    },
  );

  app.get(
    "/api/operational-expenses",
    authRequired,
    companyRequired,
    requireOperationalExpenseEnabled,
    requirePermission("moduleGastoOperacional"),
    async (req, res) => {
      const u = user(req);
      const list = await operationalExpenseService.listOperationalExpenses(u.companyId);
      return res.json(
        list.map((x) => ({
          ...x,
          monto: x.monto != null ? Number(x.monto) : null,
        })),
      );
    },
  );

  app.post(
    "/api/operational-expenses",
    authRequired,
    companyRequired,
    requireOperationalExpenseEnabled,
    requirePermission("actionGastoOperacionalCrud"),
    async (req, res) => {
      const u = user(req);
      const parsed = z
        .object({
          fecha: z.coerce.date(),
          monto: z.coerce.number(),
          concepto: z.string().min(1),
          categoria: z.nativeEnum(OperationalExpenseCategory).optional().nullable(),
          banco: z.string().optional().nullable(),
          medio: z.string().optional().nullable(),
          cuentaPublicitaria: z.string().optional().nullable(),
          advertisingAccountId: z.string().optional().nullable(),
          notas: z.string().optional().nullable(),
          pagado: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const row = await operationalExpenseService.createOperationalExpense(u.companyId, {
        ...parsed.data,
        monto: new Prisma.Decimal(parsed.data.monto),
        createdByUserId: u.userId,
      });
      return res.status(201).json({ ...row, monto: row.monto != null ? Number(row.monto) : null });
    },
  );

  app.patch(
    "/api/operational-expenses/:id",
    authRequired,
    companyRequired,
    requireOperationalExpenseEnabled,
    requirePermission("actionGastoOperacionalCrud"),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id);
      const parsed = z
        .object({
          fecha: z.coerce.date().optional(),
          monto: z.coerce.number().optional(),
          concepto: z.string().min(1).optional(),
          categoria: z.nativeEnum(OperationalExpenseCategory).nullable().optional(),
          banco: z.string().nullable().optional(),
          medio: z.string().nullable().optional(),
          cuentaPublicitaria: z.string().nullable().optional(),
          advertisingAccountId: z.string().nullable().optional(),
          notas: z.string().nullable().optional(),
          pagado: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const b = parsed.data;
      const data: Parameters<typeof operationalExpenseService.updateOperationalExpense>[2] = {};
      if (b.fecha !== undefined) data.fecha = b.fecha;
      if (b.monto !== undefined) data.monto = new Prisma.Decimal(b.monto);
      if (b.concepto !== undefined) data.concepto = b.concepto;
      if (b.categoria !== undefined) data.categoria = b.categoria;
      if (b.banco !== undefined) data.banco = b.banco;
      if (b.medio !== undefined) data.medio = b.medio;
      if (b.cuentaPublicitaria !== undefined) data.cuentaPublicitaria = b.cuentaPublicitaria;
      if (b.advertisingAccountId !== undefined) data.advertisingAccountId = b.advertisingAccountId;
      if (b.notas !== undefined) data.notas = b.notas;
      if (b.pagado !== undefined) data.pagado = b.pagado;
      const row = await operationalExpenseService.updateOperationalExpense(u.companyId, id, data);
      if (!row) return res.status(404).json({ message: "No encontrado." });
      return res.json({ ...row, monto: row.monto != null ? Number(row.monto) : null });
    },
  );

  app.delete(
    "/api/operational-expenses/:id",
    authRequired,
    companyRequired,
    requireOperationalExpenseEnabled,
    requirePermission("actionGastoOperacionalCrud"),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id);
      const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Contraseña de confirmación requerida." });
      }
      try {
        assertWipePassword(parsed.data.password);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Contraseña incorrecta";
        return res.status(403).json({ message: msg });
      }
      const ok = await operationalExpenseService.deleteOperationalExpense(u.companyId, id);
      if (!ok) return res.status(404).json({ message: "No encontrado." });
      return res.status(204).send();
    },
  );

  app.post(
    "/api/operational-expenses/import-meta-billing-csv",
    authRequired,
    companyRequired,
    requireOperationalExpenseEnabled,
    requirePermission("actionImportMetaBillingOperacional"),
    upload.single("file"),
    async (req, res) => {
      const u = user(req);
      const file = req.file;
      if (!file?.buffer) return res.status(400).json({ message: "Archivo requerido." });
      const text = file.buffer.toString("utf8");
      const result = await importMetaBillingOperationalCsv(u.companyId, text, u.userId);
      return res.json(result);
    },
  );

  const metaBillingApiBodySchema = z.object({
    advertisingAccountId: z.string().min(1),
    metaAdsAppId: z.string().min(1).optional().nullable(),
    metaAdsSystemUserId: z.string().min(1).optional().nullable(),
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  });

  app.post(
    "/api/operational-expenses/preview-meta-billing-api",
    authRequired,
    companyRequired,
    requireOperationalExpenseEnabled,
    requirePermission("actionImportMetaBillingOperacional"),
    async (req, res) => {
      const u = user(req);
      const parsed = metaBillingApiBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      try {
        const result = await previewMetaBillingApiImport(u.companyId, parsed.data);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(400).json({ message: msg });
      }
    },
  );

  app.post(
    "/api/operational-expenses/import-meta-billing-api",
    authRequired,
    companyRequired,
    requireOperationalExpenseEnabled,
    requirePermission("actionImportMetaBillingOperacional"),
    async (req, res) => {
      const u = user(req);
      const parsed = metaBillingApiBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      try {
        const result = await importMetaBillingApiToOperationalExpenses(u.companyId, u.userId, parsed.data);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(400).json({ message: msg });
      }
    },
  );

  app.patch(
    "/api/companies/:companyId/settings",
    authRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const u = user(req);
      const companyId = String(req.params.companyId);
      if (u.companyId !== companyId) {
        return res.status(403).json({ message: "Cambia a esa empresa antes de editar su configuración." });
      }
      const parsed = z.object({ operationalExpenseEnabled: z.boolean().optional() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
      const company = await prisma.company.update({
        where: { id: companyId },
        data: parsed.data,
      });
      return res.json(company);
    },
  );
}
