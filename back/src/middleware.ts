import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import type { OperatorPermissionKey } from "./operatorPermissions";
import type { JwtPayload } from "./types";

const JWT_SECRET = process.env.JWT_SECRET ?? "change_me";

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization") ?? req.header("x-auth-token");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return res.status(401).json({ message: "Token requerido." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
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
