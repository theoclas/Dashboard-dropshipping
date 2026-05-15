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
import { importMetaBillingOperationalCsv } from "./importMetaBillingOperationalCsv";
import { normalizeCampaignMapKey, parseMetaCampaignMetricsExcel } from "./metaCampaignExcelParse";

const upload = multer({ storage: multer.memoryStorage() });

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
});

export function registerBusinessModules(app: express.Application) {
  app.get("/api/catalog-products", authRequired, companyRequired, requirePermission("moduleCatalogoProductos"), async (req, res) => {
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
        productId,
        externalCampaignId: parsed.data.externalCampaignId,
        displayName: parsed.data.displayName,
        advertisingAccountId: parsed.data.advertisingAccountId,
      });
      return res.status(201).json(row);
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
      const { rows, errors } = parseMetaCampaignMetricsExcel(file.buffer);
      return res.json({
        sampleRows: rows.slice(0, 50),
        totalRows: rows.length,
        errors,
      });
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

      const result = await importAdvertisingCampaignMetricsExcel(file.buffer, u.companyId, productId, {
        useShopifySessions: parsed.data.useShopifySessions,
        shopifySessionsByCampaignId: shopifyMap,
        applyAdvertisingAccount: parsed.data.applyAdvertisingAccount,
        advertisingAccountId: parsed.data.applyAdvertisingAccount ? advertisingAccountId : null,
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
