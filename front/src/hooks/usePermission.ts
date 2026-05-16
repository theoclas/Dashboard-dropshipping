import { useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { OperatorPermissionKey } from "../types";
import { firstAllowedAppPath, hasPermission } from "../utils/defaultAppRoute";

export function usePermission(key: OperatorPermissionKey): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return hasPermission(user.role, user.operatorPerms, key);
}

export function useAnyPermission(keys: OperatorPermissionKey[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return keys.some((k) => user.operatorPerms?.[k] === true);
}

export function useFirstAllowedAppPath(): string {
  const { user } = useAuth();
  return useMemo(
    () => firstAllowedAppPath(user?.role, user?.operatorPerms),
    [user?.role, user?.operatorPerms],
  );
}
