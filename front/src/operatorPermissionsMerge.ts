import {
  OPERATOR_PERMISSION_KEYS,
  type OperatorPermissionKey,
  type Role,
} from "./types";

function keyRecord(value: boolean): Record<OperatorPermissionKey, boolean> {
  return Object.fromEntries(OPERATOR_PERMISSION_KEYS.map((k) => [k, value])) as Record<
    OperatorPermissionKey,
    boolean
  >;
}

function defaultOperatorPermissions(): Record<OperatorPermissionKey, boolean> {
  return keyRecord(true);
}

function defaultLectorPermissions(): Record<OperatorPermissionKey, boolean> {
  const r = keyRecord(false);
  r.moduleDashboard = true;
  r.moduleConfiguracion = true;
  r.modulePedidos = true;
  r.moduleReportes = true;
  r.moduleImportaciones = false;
  r.moduleMapeo = true;
  r.moduleCpa = true;
  r.moduleCatalogoProductos = true;
  r.moduleCampanasMeta = true;
  r.moduleCuentasPublicitarias = true;
  r.moduleGastoOperacional = true;
  return r;
}

function parseJsonOverrides(json: unknown): Partial<Record<OperatorPermissionKey, boolean>> {
  if (json === null || json === undefined) return {};
  if (typeof json !== "object" || Array.isArray(json)) return {};
  const out: Partial<Record<OperatorPermissionKey, boolean>> = {};
  const obj = json as Record<string, unknown>;
  for (const k of OPERATOR_PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      if (typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

/** Misma lógica que el backend para mostrar/editar permisos efectivos. */
export function mergeOperatorPermissions(
  role: Role,
  stored: unknown,
): Record<OperatorPermissionKey, boolean> {
  const base = role === "LECTOR" ? defaultLectorPermissions() : defaultOperatorPermissions();
  const overrides = parseJsonOverrides(stored);
  return { ...base, ...overrides };
}
