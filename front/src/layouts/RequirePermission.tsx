import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { OperatorPermissionKey } from "../types";
import { firstAllowedAppPath, hasPermission } from "../utils/defaultAppRoute";

type Props = {
  perm: OperatorPermissionKey;
  children: React.ReactNode;
};

export function RequirePermission({ perm, children }: Props) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!hasPermission(user.role, user.operatorPerms, perm)) {
    const fallback = firstAllowedAppPath(user.role, user.operatorPerms);
    if (fallback === "/login") {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
