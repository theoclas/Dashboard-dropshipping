import type { OperatorPermissionKey } from "./types";
import { OPERATOR_PERMISSION_KEYS } from "./types";

export type PermissionMenuModuleId =
  | "dashboard"
  | "pedidos"
  | "productos"
  | "reportes"
  | "logistica"
  | "importar"
  | "mapeo"
  | "cpa"
  | "cpaExperimental"
  | "campanasMeta"
  | "cuentasPublicitarias"
  | "gastoOperacional"
  | "salidasCartera"
  | "configuracion";

export type ModuleActionBinding = {
  key: OperatorPermissionKey;
  /** Otros ítems del menú que comparten esta misma clave de acción. */
  sharedWithLabels?: string[];
  /**
   * Claves de módulo que deben estar activas para poder marcar la acción.
   * Por defecto: todas las `moduleKeys` del ítem.
   */
  enabledWhenModuleKeys?: OperatorPermissionKey[];
};

export type PermissionMenuModule = {
  id: PermissionMenuModuleId;
  /** Etiqueta igual que en el menú lateral. */
  label: string;
  moduleKeys: OperatorPermissionKey[];
  actions: ModuleActionBinding[];
  /** Otros ítems del menú que comparten las mismas claves de acceso (switch). */
  sharedWithLabels?: string[];
  /**
   * Operaciones incluidas solo con el acceso al módulo (sin permiso `action*` separado).
   * Se muestran como referencia en el panel.
   */
  accessIncludes?: string[];
};

/** Todas las claves `action*` del sistema. */
export const ALL_OPERATOR_ACTION_KEYS = OPERATOR_PERMISSION_KEYS.filter((k) =>
  k.startsWith("action"),
) as OperatorPermissionKey[];

/** Orden alineado con AppShell (ítems de operador/lector, sin submenú admin). */
export const PERMISSION_MENU_MODULES: PermissionMenuModule[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    moduleKeys: ["moduleDashboard"],
    actions: [],
    accessIncludes: ["Ver KPIs y tarjetas del dashboard (según tarjetas activas en Configuración)"],
  },
  {
    id: "pedidos",
    label: "Pedidos",
    moduleKeys: ["modulePedidos"],
    actions: [
      { key: "actionPedidosEditar" },
      { key: "actionPedidosExportar" },
    ],
    accessIncludes: ["Consultar listado y detalle de pedidos"],
  },
  {
    id: "productos",
    label: "Productos",
    moduleKeys: ["modulePedidos", "moduleCatalogoProductos"],
    actions: [{ key: "actionCatalogoProductosCrud" }],
    accessIncludes: ["Ver productos por pedido y agrupaciones"],
  },
  {
    id: "reportes",
    label: "Reportes",
    moduleKeys: ["moduleReportes"],
    actions: [],
    accessIncludes: ["Rentabilidad, desglose y exportaciones de reportes"],
  },
  {
    id: "logistica",
    label: "Logística",
    moduleKeys: ["moduleImportaciones"],
    actions: [{ key: "actionImportarDropi", sharedWithLabels: ["Importar"] }],
    sharedWithLabels: ["Importar"],
    accessIncludes: ["Vista logística (lectura de datos importados)"],
  },
  {
    id: "importar",
    label: "Importar",
    moduleKeys: ["moduleImportaciones"],
    actions: [{ key: "actionImportarDropi", sharedWithLabels: ["Logística"] }],
    sharedWithLabels: ["Logística"],
    accessIncludes: ["Asistente de importación cartera / productos / pedidos"],
  },
  {
    id: "mapeo",
    label: "Mapeo estados",
    moduleKeys: ["moduleMapeo"],
    actions: [{ key: "actionMapeoEstadosCrud" }],
    accessIncludes: ["Consultar reglas de mapeo"],
  },
  {
    /* Oculto del menú: sustituido por CPA experimental. Permisos legacy aún aplican a moduleCpa. */
    id: "cpa",
    label: "CPA (legacy, oculto)",
    moduleKeys: ["moduleCpa"],
    actions: [
      { key: "actionCpaRegistrosCrud", sharedWithLabels: ["CPA experimental"] },
      { key: "actionCpaImportarExcel", sharedWithLabels: ["CPA experimental"] },
    ],
    sharedWithLabels: ["CPA experimental"],
    accessIncludes: ["Consultar registros CPA (legacy)"],
  },
  {
    id: "cpaExperimental",
    label: "CPA experimental",
    moduleKeys: ["moduleCpa"],
    actions: [
      { key: "actionCpaRegistrosCrud" },
      { key: "actionCpaImportarExcel" },
    ],
    accessIncludes: ["Consultar y calcular CPA por producto y día"],
  },
  {
    id: "campanasMeta",
    label: "Campañas Meta",
    moduleKeys: ["moduleCampanasMeta"],
    actions: [
      { key: "actionCampanasMetaCrud" },
      { key: "actionImportarAdvertisingCampaigns" },
      { key: "actionEditarMetricasAdvertising" },
      {
        key: "actionCuentasPublicitariasCrud",
        sharedWithLabels: ["Cuentas publicitarias"],
        enabledWhenModuleKeys: ["moduleCampanasMeta"],
      },
    ],
    accessIncludes: ["Ver campañas, métricas y cuentas vinculadas (lectura)"],
  },
  {
    id: "cuentasPublicitarias",
    label: "Cuentas publicitarias",
    moduleKeys: ["moduleCuentasPublicitarias"],
    actions: [
      { key: "actionCuentasPublicitariasCrud" },
      {
        key: "actionCampanasMetaCrud",
        sharedWithLabels: ["Campañas Meta"],
        enabledWhenModuleKeys: ["moduleCuentasPublicitarias"],
      },
    ],
    accessIncludes: ["Ver cuentas publicitarias"],
  },
  {
    id: "salidasCartera",
    label: "Salidas cartera",
    moduleKeys: ["moduleImportaciones"],
    actions: [{ key: "actionImportarDropi", sharedWithLabels: ["Importar", "Logística"] }],
    sharedWithLabels: ["Importar", "Logística"],
    accessIncludes: ["Consultar salidas de cartera Dropi clasificadas por pedido, retiro o tarjeta"],
  },
  {
    id: "gastoOperacional",
    label: "Gasto operacional",
    moduleKeys: ["moduleGastoOperacional"],
    actions: [
      { key: "actionGastoOperacionalCrud" },
      { key: "actionImportMetaBillingOperacional" },
    ],
    accessIncludes: ["Consultar gastos operacionales"],
  },
  {
    id: "configuracion",
    label: "Configuración",
    moduleKeys: ["moduleConfiguracion"],
    actions: [
      { key: "actionConfigDashboardTarjetas" },
      { key: "actionConfigRetirosDropiNotas" },
    ],
    accessIncludes: ["Ver perfil, empresas y retiros Dropi"],
  },
];

const MODULE_KEY_LABELS: Partial<Record<OperatorPermissionKey, string>> = {
  modulePedidos: "Acceso a pedidos",
  moduleCatalogoProductos: "Acceso a catálogo de productos",
};

export function moduleKeyLabel(key: OperatorPermissionKey): string {
  return MODULE_KEY_LABELS[key] ?? "Acceso al módulo";
}

export function moduleActionKeys(mod: PermissionMenuModule): OperatorPermissionKey[] {
  return mod.actions.map((a) => a.key);
}

export function isModuleAccessEnabled(
  permState: Record<OperatorPermissionKey, boolean>,
  mod: PermissionMenuModule,
): boolean {
  return mod.moduleKeys.every((k) => permState[k] === true);
}

export function moduleAccessSummary(
  permState: Record<OperatorPermissionKey, boolean>,
  mod: PermissionMenuModule,
): "Activo" | "Inactivo" {
  return isModuleAccessEnabled(permState, mod) ? "Activo" : "Inactivo";
}

export function isActionCheckboxEnabled(
  permState: Record<OperatorPermissionKey, boolean>,
  mod: PermissionMenuModule,
  binding: ModuleActionBinding,
): boolean {
  const keys = binding.enabledWhenModuleKeys ?? mod.moduleKeys;
  return keys.every((k) => permState[k] === true);
}

export function getPermissionMenuModule(id: PermissionMenuModuleId): PermissionMenuModule | undefined {
  return PERMISSION_MENU_MODULES.find((m) => m.id === id);
}
