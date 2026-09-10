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
          },
        });
        return res.json({ items: rows });
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
            companyId: u.companyId,
            createdById: u.userId,
          },
          select: { id: true, name: true, prefix: true, createdAt: true },
        });

        // Rastro en el log: quién creó una credencial permanente y cuándo.
        console.log(
          `[service-token] creada ${row.id} (${row.prefix}…) por ${u.username} en empresa ${u.companyId}`,
        );

        return res.status(201).json({
          ...row,
          token,
          aviso:
            "Guarda este token ahora: no se vuelve a mostrar. Si lo pierdes, revócalo y crea otro.",
        });
      } catch (e) {
        return res.status(500).json({ message: "No se pudo crear la credencial." });
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
