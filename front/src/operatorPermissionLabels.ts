import type { OperatorPermissionKey } from "./types";
import { OPERATOR_PERMISSION_KEYS } from "./types";

/** Etiquetas en español para UI de configuración de permisos (OPERADOR / LECTOR). */
export const OPERATOR_PERMISSION_LABELS: Record<OperatorPermissionKey, string> = {
  moduleDashboard: "Dashboard",
  moduleConfiguracion: "Configuración",
  modulePedidos: "Pedidos y productos de pedidos",
  moduleReportes: "Reportes",
  moduleImportaciones: "Importar",
  moduleMapeo: "Mapeo de estados",
  moduleCpa: "CPA",
  moduleCatalogoProductos: "Catálogo de productos",
  moduleCampanasMeta: "Campañas Meta",
  moduleCuentasPublicitarias: "Cuentas publicitarias",
  moduleGastoOperacional: "Gasto operacional",
  actionCatalogoProductosCrud: "Catálogo: crear/editar productos",
  actionCampanasMetaCrud: "Campañas: crear/editar/eliminar",
  actionImportarAdvertisingCampaigns: "Campañas: importar Excel",
  actionEditarMetricasAdvertising: "Campañas: editar métricas",
  actionCuentasPublicitariasCrud: "Cuentas publicitarias: alta/edición",
  actionGastoOperacionalCrud: "Gastos: alta/edición/borrar",
  actionImportMetaBillingOperacional: "Gastos: importar CSV Meta",
  actionPedidosEditar: "Pedidos: editar y crear",
  actionPedidosExportar: "Pedidos: exportar Excel",
  actionImportarDropi: "Importar archivos Dropi (cartera, productos, pedidos)",
  actionMapeoEstadosCrud: "Mapeo: crear/editar/eliminar y remapear",
  actionCpaRegistrosCrud: "CPA: crear/editar/eliminar y reconstruir experimental",
  actionCpaImportarExcel: "CPA: importar Excel",
  actionConfigDashboardTarjetas: "Configuración: tarjetas visibles del dashboard",
  actionConfigRetirosDropiNotas: "Configuración: editar notas de retiros Dropi",
};

/** Etiquetas cortas para el panel «Ver acciones». */
export const OPERATOR_ACTION_LABELS: Partial<Record<OperatorPermissionKey, string>> = {
  actionCatalogoProductosCrud: "Crear/editar productos en catálogo",
  actionCampanasMetaCrud: "Crear/editar/eliminar campañas",
  actionImportarAdvertisingCampaigns: "Importar Excel de campañas y métricas",
  actionEditarMetricasAdvertising: "Editar y eliminar métricas de campañas",
  actionCuentasPublicitariasCrud: "Alta y edición de cuentas publicitarias",
  actionGastoOperacionalCrud: "Alta, edición y borrado de gastos",
  actionImportMetaBillingOperacional: "Importar CSV Meta (facturación)",
  actionPedidosEditar: "Editar pedidos, notas y crear registros",
  actionPedidosExportar: "Exportar pedidos a Excel",
  actionImportarDropi: "Subir archivos de cartera, productos y pedidos",
  actionMapeoEstadosCrud: "Gestionar reglas de mapeo y remapear pedidos",
  actionCpaRegistrosCrud: "Gestionar registros CPA y reconstruir experimental",
  actionCpaImportarExcel: "Importar archivo Excel de CPA",
  actionConfigDashboardTarjetas: "Activar u ocultar tarjetas del dashboard",
  actionConfigRetirosDropiNotas: "Editar notas en retiros Dropi",
};

/** Descripción breve bajo el checkbox (opcional). */
export const OPERATOR_ACTION_HINTS: Partial<Record<OperatorPermissionKey, string>> = {
  actionEditarMetricasAdvertising: "Incluye editar clics, conversaciones, sesiones Shopify y borrar filas de métricas.",
  actionImportarAdvertisingCampaigns: "Vista previa e importación del Excel de métricas Meta.",
  actionCuentasPublicitariasCrud: "También permite crear cuentas desde el flujo de importación de campañas.",
  actionCampanasMetaCrud: "En Cuentas publicitarias permite altas si no tienes el permiso de cuentas.",
};

export function actionPermissionLabel(key: OperatorPermissionKey): string {
  return OPERATOR_ACTION_LABELS[key] ?? OPERATOR_PERMISSION_LABELS[key];
}

export function actionPermissionHint(key: OperatorPermissionKey): string | undefined {
  return OPERATOR_ACTION_HINTS[key];
}

/** @deprecated Usar PERMISSION_MENU_MODULES + OperatorPermissionsEditor */
export function permissionGroups(): { title: string; keys: OperatorPermissionKey[] }[] {
  const modules = OPERATOR_PERMISSION_KEYS.filter((k) => k.startsWith("module"));
  const actions = OPERATOR_PERMISSION_KEYS.filter((k) => k.startsWith("action"));
  return [
    { title: "Módulos (acceso)", keys: modules },
    { title: "Acciones", keys: actions },
  ];
}
