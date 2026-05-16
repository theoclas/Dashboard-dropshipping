import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useFirstAllowedAppPath } from "../hooks/usePermission";

/** Redirige /app y / al primer módulo permitido del usuario. */
export function AppIndexRedirect() {
  const { user, loading } = useAuth();
  const path = useFirstAllowedAppPath();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const relative = path.startsWith("/app/") ? path.slice(5) : path === "/app" ? "" : path.replace(/^\//, "");
  return <Navigate to={relative || "pedidos"} replace />;
}

export function RootRedirect() {
  const token = localStorage.getItem("fersua_token");
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to="/app" replace />;
}
