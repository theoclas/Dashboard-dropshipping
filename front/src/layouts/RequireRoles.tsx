import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useFirstAllowedAppPath } from "../hooks/usePermission";
import type { Role } from "../types";

export function RequireRoles({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const fallback = useFirstAllowedAppPath();
  if (!user || !roles.includes(user.role)) {
    if (fallback === "/login") return <Navigate to="/login" replace />;
    const relative = fallback.startsWith("/app/") ? fallback.slice(5) : fallback;
    return <Navigate to={relative || "pedidos"} replace />;
  }
  return <>{children}</>;
}
