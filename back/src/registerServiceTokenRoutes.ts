import type express from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { authRequired, companyRequired, requireRoles } from "./middleware";
import { prisma } from "./prisma";
import { generateServiceToken } from "./serviceTokens";
import type { JwtPayload } from "./types";

/**
 * Administración de credenciales de servicio (`/api/agent/*` de solo lectura).
 *
 * Solo ADMIN. El token en claro se devuelve **una única vez**, al crearlo: después solo
 * queda su hash, así que ni esta API ni la base pueden volver a mostrarlo. Si se pierde,
 * se revoca y se crea otro.
 *
 * Revocar no borra la fila: deja el rastro de cuándo existió y cuándo se usó por última vez.
 */

function user(req: express.Request): JwtPayload {
  return (req as express.Request & { user?: JwtPayload }).user!;
}

const createSchema = z.object({
  name: z.string().trim().min(3, "Ponle un nombre de al menos 3 caracteres.").max(120),
});

export function registerServiceTokenRoutes(app: express.Express): void {
  /** Lista las credenciales de la empresa activa. Nunca devuelve el token. */
  app.get(
    "/api/service-tokens",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const u = user(req);
      try {
        const rows = await prisma.serviceToken.findMany({
          where: { companyId: u.companyId },
          orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            prefix: true,
            createdAt: true,
            lastUsedAt: true,
            revokedAt: true,
            token: true,
          },
        });
        // El nombre de la empresa va en la respuesta para que la pantalla pueda decir sin
        // ambigüedad para cuál se está creando: una credencial solo ve los datos de la
        // empresa donde nació, y quien administre dos necesita una en cada una.
        const company = await prisma.company.findUnique({
          where: { id: u.companyId },
          select: { name: true },
        });
        // El token no viaja en el listado: se pide aparte, para que quede rastro de cada
        // vez que alguien lo mira y no se filtre por el simple hecho de abrir la pantalla.
        return res.json({
          empresa: company?.name ?? "",
          items: rows.map(({ token, ...r }) => ({ ...r, puedeVerse: token !== null })),
        });
      } catch (e) {
        return res.status(500).json({ message: "No se pudieron cargar las credenciales." });
      }
    },
  );

  /**
   * Crea una credencial. Devuelve el token en claro **solo en esta respuesta**.
   */
  app.post(
    "/api/service-tokens",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const u = user(req);
      const parsed = createSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Datos inválidos." });
      }

      try {
        const { token, tokenHash, prefix } = generateServiceToken();
        const row = await prisma.serviceToken.create({
          data: {
            name: parsed.data.name,
            tokenHash,
            prefix,
            token,
            companyId: u.companyId,
            createdById: u.userId,
          },
          select: { id: true, name: true, prefix: true, createdAt: true },
        });

        // Rastro en el log: quién creó una credencial permanente y cuándo.
        console.log(
          `[service-token] creada ${row.id} (${row.prefix}…) por ${u.username} en empresa ${u.companyId}`,
        );

        return res.status(201).json({ ...row, token });
      } catch (e) {
        return res.status(500).json({ message: "No se pudo crear la credencial." });
      }
    },
  );

  /**
   * Devuelve el token en claro para volver a copiarlo.
   *
   * Va aparte del listado a propósito: así abrir la pantalla no expone el secreto y cada
   * vez que alguien lo mira queda escrito en el log quién fue.
   */
  app.get(
    "/api/service-tokens/:id/reveal",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id ?? "");
      try {
        const row = await prisma.serviceToken.findUnique({
          where: { id },
          select: { id: true, companyId: true, token: true, prefix: true, revokedAt: true },
        });
        if (!row || row.companyId !== u.companyId) {
          return res.status(404).json({ message: "Credencial no encontrada." });
        }
        if (!row.token) {
          return res.status(410).json({
            message:
              "Esta credencial se creó antes de que se guardaran, así que ya no se puede ver. Revócala y crea otra.",
          });
        }
        console.log(`[service-token] ${u.username} vio el token ${row.id} (${row.prefix}…)`);
        return res.json({ id: row.id, token: row.token, revocada: row.revokedAt !== null });
      } catch (e) {
        return res.status(500).json({ message: "No se pudo leer la credencial." });
      }
    },
  );

  /** Revoca. Surte efecto en la siguiente petición, sin esperar a que nada caduque. */
  app.post(
    "/api/service-tokens/:id/revoke",
    authRequired,
    companyRequired,
    requireRoles([Role.ADMIN]),
    async (req, res) => {
      const u = user(req);
      const id = String(req.params.id ?? "");
      try {
        const row = await prisma.serviceToken.findUnique({ where: { id } });
        // Se comprueba la empresa para que un ADMIN no revoque credenciales de otra.
        if (!row || row.companyId !== u.companyId) {
          return res.status(404).json({ message: "Credencial no encontrada." });
        }
        if (row.revokedAt) {
          return res.json({ id: row.id, revokedAt: row.revokedAt });
        }
        const updated = await prisma.serviceToken.update({
          where: { id },
          data: { revokedAt: new Date() },
          select: { id: true, revokedAt: true },
        });
        console.log(`[service-token] revocada ${id} por ${u.username}`);
        return res.json(updated);
      } catch (e) {
        return res.status(500).json({ message: "No se pudo revocar la credencial." });
      }
    },
  );
}
