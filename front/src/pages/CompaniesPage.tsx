import { Navigate } from "react-router-dom";

/** Compatibilidad: enlaces antiguos a `/app/empresas`. */
export function CompaniesPage() {
  return <Navigate to="/app/admin/empresas" replace />;
}
