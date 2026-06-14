import type { OperatorPermissionKey, Role } from "../types";

/** Orden de prioridad al redirigir si falta permiso (alineado con el menú). */
const ROUTE_BY_PERMISSION: { perm: OperatorPermissionKey; path: string }[] = [
  { perm: "moduleDashboard", path: "/app/dashboard" },
  { perm: "modulePedidos", path: "/app/pedidos" },
  { perm: "moduleReportes", path: "/app/reportes" },
  { perm: "moduleImportaciones", path: "/app/importar" },
  { perm: "moduleMapeo", path: "/app/mapeo" },
  { perm: "moduleCpa", path: "/app/cpa-experimental" },
  { perm: "moduleCampanasMeta", path: "/app/campanas-meta" },
  { perm: "moduleCuentasPublicitarias", path: "/app/cuentas-publicitarias" },
  { perm: "moduleGastoOperacional", path: "/app/gasto-operacional" },
  { perm: "moduleConfiguracion", path: "/app/configuracion" },
];

export function hasPermission(
  role: Role | undefined,
  operatorPerms: Record<OperatorPermissionKey, boolean> | null | undefined,
  key: OperatorPermissionKey,
): boolean {
  if (!role) return false;
  if (role === "ADMIN") return true;
  return operatorPerms?.[key] === true;
}

export function firstAllowedAppPath(
  role: Role | undefined,
  operatorPerms: Record<OperatorPermissionKey, boolean> | null | undefined,
): string {
  if (role === "ADMIN") return "/app/admin/empresas";
  for (const { perm, path } of ROUTE_BY_PERMISSION) {
    if (hasPermission(role, operatorPerms, perm)) return path;
  }
  return "/login";
}
