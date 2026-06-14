import express from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { authRequired, requirePermission, requireRoles } from "./middleware";
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
  updateMetaAdsSystemUser,
} from "./metaAdsSystemUserService";

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
    requireRoles([Role.ADMIN]),
    async (_req, res) => {
      const list = await listMetaAdsSystemUsers();
      return res.json(list);
    },
  );

  app.get(
    "/api/admin/meta-ads-system-users/:id",
    authRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const row = await getMetaAdsSystemUser(String(req.params.id));
      if (!row) return res.status(404).json({ message: "No encontrado." });
      return res.json(row);
    },
  );

  app.post(
    "/api/admin/meta-ads-system-users",
    authRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos." });
      try {
        const row = await createMetaAdsSystemUser({
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
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos." });
      try {
        const row = await updateMetaAdsSystemUser(String(req.params.id), {
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

  app.delete(
    "/api/admin/meta-ads-system-users/:id",
    authRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const ok = await deleteMetaAdsSystemUser(String(req.params.id));
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
    requirePermission("moduleCampanasMeta"),
    async (req, res) => {
      const appId = typeof req.query.appId === "string" ? req.query.appId : undefined;
      const list = await listMetaAdsSystemUserOptions(appId);
      return res.json(list);
    },
  );
}
