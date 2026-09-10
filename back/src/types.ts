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
  /**
   * Id de la credencial de servicio, cuando la petición viene de una y no de un login.
   * Presente solo en peticiones GET a `/api/agent/*`; ver `serviceTokens.ts`.
   */
  serviceTokenId?: string;
};
