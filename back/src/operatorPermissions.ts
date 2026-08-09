import type { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";

/** Claves alineadas con `UserCompany.operator_permissions` (JSON parcial). */
export const OPERATOR_PERMISSION_KEYS = [
  "moduleDashboard",
  "moduleConfiguracion",
  "modulePedidos",
  "moduleReportes",
  "moduleImportaciones",
  "moduleSalidasCartera",
  "moduleMapeo",
  "moduleCpa",
  "moduleCatalogoProductos",
  "moduleCampanasMeta",
  "moduleAnuncios",
  "moduleCuentasPublicitarias",
  "moduleGastoOperacional",
  "actionCatalogoProductosCrud",
  "actionCampanasMetaCrud",
  "actionImportarAdvertisingCampaigns",
  "actionImportarAnuncios",
  "actionEditarMetricasAdvertising",
  "actionCuentasPublicitariasCrud",
  "actionGastoOperacionalCrud",
  "actionImportMetaBillingOperacional",
  "actionPedidosEditar",
  "actionPedidosExportar",
  "actionImportarDropi",
  "actionMapeoEstadosCrud",
  "actionCpaRegistrosCrud",
  "actionCpaImportarExcel",
  "actionConfigDashboardTarjetas",
  "actionConfigRetirosDropiNotas",
] as const;

export type OperatorPermissionKey = (typeof OPERATOR_PERMISSION_KEYS)[number];

function keyRecord(value: boolean): Record<OperatorPermissionKey, boolean> {
  return Object.fromEntries(OPERATOR_PERMISSION_KEYS.map((k) => [k, value])) as Record<
    OperatorPermissionKey,
    boolean
  >;
}

/** OPERADOR con JSON null: todo permitido. */
export function defaultOperatorPermissions(): Record<OperatorPermissionKey, boolean> {
  return keyRecord(true);
}

/** LECTOR sin overrides: solo módulos de lectura, sin acciones destructivas. */
export function defaultLectorPermissions(): Record<OperatorPermissionKey, boolean> {
  const r = keyRecord(false);
  r.moduleDashboard = true;
  r.moduleConfiguracion = true;
  r.modulePedidos = true;
  r.moduleReportes = true;
  r.moduleImportaciones = false;
  r.moduleSalidasCartera = false;
  r.moduleMapeo = true;
  r.moduleCpa = true;
  r.moduleCatalogoProductos = true;
  r.moduleCampanasMeta = true;
  r.moduleAnuncios = true;
  r.moduleCuentasPublicitarias = true;
  r.moduleGastoOperacional = true;
  return r;
}

function parseJsonOverrides(json: Prisma.JsonValue | null | undefined): Partial<Record<OperatorPermissionKey, boolean>> {
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

/** Mapa efectivo para el rol y el JSON guardado en membresía. */
export function mergeOperatorPermissions(
  role: Role,
  stored: Prisma.JsonValue | null | undefined,
): Record<OperatorPermissionKey, boolean> {
  const base = role === "LECTOR" ? defaultLectorPermissions() : defaultOperatorPermissions();
  const overrides = parseJsonOverrides(stored);
  const merged = { ...base, ...overrides };
  // Compat: JSON guardado antes de moduleSalidasCartera hereda el switch de Importar.
  if (!Object.prototype.hasOwnProperty.call(overrides, "moduleSalidasCartera")) {
    merged.moduleSalidasCartera = merged.moduleImportaciones;
  }
  // Compat: JSON guardado antes del módulo Anuncios hereda lo de Campañas Meta,
  // para que nadie gane acceso a un módulo nuevo por el simple hecho de crearlo.
  if (!Object.prototype.hasOwnProperty.call(overrides, "moduleAnuncios")) {
    merged.moduleAnuncios = merged.moduleCampanasMeta;
  }
  if (!Object.prototype.hasOwnProperty.call(overrides, "actionImportarAnuncios")) {
    merged.actionImportarAnuncios = merged.actionImportarAdvertisingCampaigns;
  }
  return merged;
}
