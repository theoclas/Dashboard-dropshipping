import type { Role } from "@prisma/client";
import type { OperatorPermissionKey } from "./operatorPermissions";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  companyId: string;
  role: Role;
};

export type JwtPayload = {
  userId: string;
  username: string;
  email: string;
  companyId: string;
  role: Role;
  /** Mapa efectivo de permisos (no enviado para ADMIN). */
  operatorPerms?: Record<OperatorPermissionKey, boolean>;
};
