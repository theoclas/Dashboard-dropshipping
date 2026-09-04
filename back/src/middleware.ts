import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { PrismaClient } from "@prisma/client";
import { Role } from "@prisma/client";
import { mergeOperatorPermissions } from "./operatorPermissions";
import type { OperatorPermissionKey } from "./operatorPermissions";
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
