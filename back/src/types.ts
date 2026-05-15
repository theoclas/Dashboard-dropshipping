import type { Role } from "@prisma/client";

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
};
