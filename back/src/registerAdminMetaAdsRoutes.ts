import express, { type Request } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { authRequired, companyRequired, requirePermission, requireRoles } from "./middleware";
import {
  createMetaAdsApp,
  deleteMetaAdsApp,
  getMetaAdsApp,
  listActiveMetaAdsAppOptions,
  listMetaAdsApps,
  updateMetaAdsApp,
} from "./metaAdsAppService";
import {
  createMetaAdsSystemUser,
  deleteMetaAdsSystemUser,
  getMetaAdsSystemUser,
  listMetaAdsSystemUserOptions,
  listMetaAdsSystemUsers,
  replaceMetaAdsSystemUserCompanies,
  updateMetaAdsSystemUser,
} from "./metaAdsSystemUserService";
import type { JwtPayload } from "./types";

function reqCompanyId(req: Request): string {
  return (req as Request & { user?: JwtPayload }).user!.companyId;
}

const appAccessSchema = z.object({
  appId: z.string().min(1),
  accessToken: z.string().min(10).optional(),
  tokenExpiresAt: z.string().datetime().optional().nullable(),
  isDefault: z.boolean().optional(),
});

const createUserSchema = z.object({
  name: z.string().min(1).max(128),
  metaSystemUserId: z.string().max(32).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  isActive: z.boolean().optional(),
  appAccess: z.array(appAccessSchema).min(1),
});

const companiesSchema = z.object({
  companyIds: z.array(z.string().min(1)).min(1, "Elige al menos una empresa."),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  metaSystemUserId: z.string().max(32).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  isActive: z.boolean().optional(),
  appAccess: z.array(appAccessSchema).optional(),
});

const createAppSchema = z.object({
  name: z.string().min(1).max(255),
  metaAppId: z.string().max(32).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  metaAppId: z.string().max(32).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  isActive: z.boolean().optional(),
});

function parseAppAccess(
  items: Array<{
    appId: string;
    accessToken?: string;
    tokenExpiresAt?: string | null;
    isDefault?: boolean;
  }>,
) {
  return items.map((item) => ({
    appId: item.appId,
    accessToken: item.accessToken,
    tokenExpiresAt:
      item.tokenExpiresAt === undefined
        ? undefined
        : item.tokenExpiresAt
          ? new Date(item.tokenExpiresAt)
          : null,
    isDefault: item.isDefault,
  }));
}

export function registerAdminMetaAdsRoutes(app: express.Application) {
  app.get("/api/admin/meta-ads-apps", authRequired, requireRoles([Role.ADMIN]), async (_req, res) => {
    const list = await listMetaAdsApps();
    return res.json(list);
  });

  app.get(
    "/api/admin/meta-ads-apps/:id",
    authRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const row = await getMetaAdsApp(String(req.params.id));
      if (!row) return res.status(404).json({ message: "No encontrado." });
      return res.json(row);
    },
  );

  app.post("/api/admin/meta-ads-apps", authRequired, requireRoles([Role.ADMIN]), async (req, res) => {
    const parsed = createAppSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos inválidos." });
    try {
      const row = await createMetaAdsApp(parsed.data);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(400).json({ message: e instanceof Error ? e.message : "Error al crear." });
    }
  });

  app.patch(
    "/api/admin/meta-ads-apps/:id",
    authRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const parsed = updateAppSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos." });
      try {
        const row = await updateMetaAdsApp(String(req.params.id), parsed.data);
        if (!row) return res.status(404).json({ message: "No encontrado." });
        return res.json(row);
      } catch (e) {
        return res.status(400).json({ message: e instanceof Error ? e.message : "Error al actualizar." });
      }
    },
  );

  app.delete(
    "/api/admin/meta-ads-apps/:id",
    authRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const ok = await deleteMetaAdsApp(String(req.params.id));
      if (!ok) return res.status(404).json({ message: "No encontrado." });
      return res.status(204).send();
    },
  );

  app.get(
    "/api/admin/meta-ads-system-users",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const list = await listMetaAdsSystemUsers(reqCompanyId(req));
      return res.json(list);
    },
  );

  app.get(
    "/api/admin/meta-ads-system-users/:id",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const row = await getMetaAdsSystemUser(reqCompanyId(req), String(req.params.id));
      if (!row) return res.status(404).json({ message: "No encontrado." });
      return res.json(row);
    },
  );

  app.post(
    "/api/admin/meta-ads-system-users",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos." });
      try {
        const row = await createMetaAdsSystemUser({
          companyId: reqCompanyId(req),
          name: parsed.data.name,
          metaSystemUserId: parsed.data.metaSystemUserId,
          notes: parsed.data.notes,
          isActive: parsed.data.isActive,
          appAccess: parseAppAccess(parsed.data.appAccess),
        });
        return res.status(201).json(row);
      } catch (e) {
        return res.status(400).json({ message: e instanceof Error ? e.message : "Error al crear." });
      }
    },
  );

  app.patch(
    "/api/admin/meta-ads-system-users/:id",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos." });
      try {
        const row = await updateMetaAdsSystemUser(reqCompanyId(req), String(req.params.id), {
          name: parsed.data.name,
          metaSystemUserId: parsed.data.metaSystemUserId,
          notes: parsed.data.notes,
          isActive: parsed.data.isActive,
          appAccess:
            parsed.data.appAccess === undefined ? undefined : parseAppAccess(parsed.data.appAccess),
        });
        if (!row) return res.status(404).json({ message: "No encontrado." });
        return res.json(row);
      } catch (e) {
        return res.status(400).json({ message: e instanceof Error ? e.message : "Error al actualizar." });
      }
    },
  );

  /**
   * Empresas que pueden usar este usuario de Meta.
   *
   * Sustituye el conjunto entero, no añade: la pantalla manda la lista completa. Solo
   * ADMIN, como el resto de este módulo.
   */
  app.put(
    "/api/admin/meta-ads-system-users/:id/companies",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const parsed = companiesSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos." });

      const id = String(req.params.id);
      // Quien llama tiene que poder ver el usuario desde su empresa activa; si no, podría
      // reasignar usuarios de Meta que no le corresponden.
      const actual = await getMetaAdsSystemUser(reqCompanyId(req), id);
      if (!actual) return res.status(404).json({ message: "No encontrado." });

      const r = await replaceMetaAdsSystemUserCompanies(id, parsed.data.companyIds);
      if (!r.ok) return res.status(400).json({ message: r.message });

      const actualizado = await getMetaAdsSystemUser(reqCompanyId(req), id);
      // Si se quitó a sí mismo de la lista, deja de verlo: se devuelven las empresas
      // resultantes para que la pantalla pueda avisar en vez de quedarse en blanco.
      return res.json(actualizado ?? { id, companies: r.companies, removedSelf: true });
    },
  );

  app.delete(
    "/api/admin/meta-ads-system-users/:id",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const ok = await deleteMetaAdsSystemUser(reqCompanyId(req), String(req.params.id));
      if (!ok) return res.status(404).json({ message: "No encontrado." });
      return res.status(204).send();
    },
  );
}

/** Opciones para Campañas Meta (sin token completo). */
export function registerMetaAdsOptionsRoutes(app: express.Application) {
  app.get(
    "/api/meta-ads-apps/options",
    authRequired,
    requirePermission("moduleCampanasMeta"),
    async (_req, res) => {
      const list = await listActiveMetaAdsAppOptions();
      return res.json(list.map((a) => ({ id: a.id, name: a.name, metaAppId: a.metaAppId })));
    },
  );

  app.get(
    "/api/meta-ads-system-users/options",
    authRequired,
    companyRequired,
    requirePermission("moduleCampanasMeta"),
    async (req, res) => {
      const appId = typeof req.query.appId === "string" ? req.query.appId : undefined;
      const list = await listMetaAdsSystemUserOptions(reqCompanyId(req), appId);
      return res.json(list);
    },
  );
}
