import { useAuth } from "../contexts/AuthContext";
import type { OperatorPermissionKey } from "../types";

export function usePermission(key: OperatorPermissionKey): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return user.operatorPerms?.[key] === true;
}
