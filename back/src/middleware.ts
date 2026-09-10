import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { PrismaClient } from "@prisma/client";
import { Role } from "@prisma/client";
import { mergeOperatorPermissions } from "./operatorPermissions";
import type { OperatorPermissionKey } from "./operatorPermissions";
import {
  hashServiceToken,
  isAgentReadOnlyRequest,
  isServiceToken,
  serviceTokenPermissions,
  shouldRefreshLastUsed,
} from "./serviceTokens";
import type { JwtPayload } from "./types";

const JWT_SECRET = process.env.JWT_SECRET ?? "change_me";

let prismaRef: PrismaClient | null = null;

export function configureAuthMiddleware(prisma: PrismaClient): void {
  prismaRef = prisma;
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization") ?? req.header("x-auth-token");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return res.status(401).json({ message: "Token requerido." });
  }

  // Credencial de servicio: no caduca, pero solo sirve para leer `/api/agent/*`.
  if (isServiceToken(token)) {
    return authenticateServiceToken(token, req, res, next);
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // El rol y los permisos salen SIEMPRE de la membresía viva, nunca de lo que afirme
    // el token.
    //
    // Antes se saltaba esta consulta cuando el token ya decía ADMIN, y si la membresía
    // había desaparecido se conservaba el rol del token. Las dos cosas juntas dejaban
    // una ventana de 8 horas —lo que dura el token— en la que alguien degradado o
    // expulsado seguía entrando como administrador. Los tokens no se pueden revocar en
    // este sistema, así que esta consulta es la única forma de que un cambio de rol
    // surta efecto.
    if (prismaRef && payload.companyId) {
      const membership = await prismaRef.userCompany.findUnique({
        where: {
          userId_companyId: { userId: payload.userId, companyId: payload.companyId },
        },
      });
      if (!membership) {
        return res
          .status(401)
          .json({ message: "Tu acceso a esta empresa ya no existe. Vuelve a iniciar sesión." });
      }
      payload.role = membership.role;
      payload.operatorPerms = mergeOperatorPermissions(
        membership.role,
        membership.operatorPermissions,
      );
    }

    (req as Request & { user?: JwtPayload }).user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido." });
  }
}

/**
 * Autentica una credencial de servicio.
 *
 * El orden importa: primero se valida la credencial (una inválida es 401, no 403) y solo
 * después se aplica la restricción de alcance. Así los códigos de respuesta significan lo
 * que dicen y no se filtra qué rutas existen.
 *
 * La restricción **no depende de los permisos**: aunque la credencial trajera el mapa
 * completo, cualquier método distinto de GET o cualquier ruta fuera de `/api/agent/` se
 * rechaza aquí. Es lo que hace que sea estructuralmente incapaz de escribir.
 */
async function authenticateServiceToken(
  token: string,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!prismaRef) {
    return res.status(500).json({ message: "Autenticación no inicializada." });
  }

  const record = await prismaRef.serviceToken.findUnique({
    where: { tokenHash: hashServiceToken(token) },
  });

  if (!record) {
    return res.status(401).json({ message: "Token inválido." });
  }
  if (record.revokedAt) {
    return res.status(401).json({ message: "Esta credencial fue revocada." });
  }

  // El candado. No se puede abrir desde el token.
  if (!isAgentReadOnlyRequest(req.method, req.originalUrl)) {
    return res.status(403).json({
      message:
        "Esta credencial es de solo lectura: únicamente admite GET sobre /api/agent/.",
    });
  }

  // Rastro de uso, sin castigar cada consulta con un UPDATE.
  const now = new Date();
  if (shouldRefreshLastUsed(record.lastUsedAt, now)) {
    prismaRef.serviceToken
      .update({ where: { id: record.id }, data: { lastUsedAt: now } })
      .catch(() => {
        /* El rastro es informativo: si falla, la consulta debe seguir su curso. */
      });
  }

  (req as Request & { user?: JwtPayload }).user = {
    userId: `service:${record.id}`,
    username: record.name,
    email: "",
    companyId: record.companyId,
    role: Role.LECTOR,
    operatorPerms: serviceTokenPermissions(),
    serviceTokenId: record.id,
  };
  return next();
}

export function companyRequired(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user?: JwtPayload }).user;
  if (!user?.companyId) {
    return res.status(400).json({ message: "Contexto de empresa requerido." });
  }
  return next();
}

export function requireRoles(roles: Array<JwtPayload["role"]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ message: "No autorizado para esta acción." });
    }
    return next();
  };
}

export function requirePermission(key: OperatorPermissionKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user) {
      return res.status(401).json({ message: "Token requerido." });
    }
    if (user.role === Role.ADMIN) {
      return next();
    }
    const perms = user.operatorPerms;
    if (!perms || !perms[key]) {
      return res.status(403).json({ message: "No autorizado para esta acción." });
    }
    return next();
  };
}

export function requireAnyPermission(keys: OperatorPermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user) {
      return res.status(401).json({ message: "Token requerido." });
    }
    if (user.role === Role.ADMIN) {
      return next();
    }
    const perms = user.operatorPerms;
    if (!perms || !keys.some((k) => perms[k])) {
      return res.status(403).json({ message: "No autorizado para esta acción." });
    }
    return next();
  };
}
