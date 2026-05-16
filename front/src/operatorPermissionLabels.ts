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
};

export function permissionGroups(): { title: string; keys: OperatorPermissionKey[] }[] {
  const modules = OPERATOR_PERMISSION_KEYS.filter((k) => k.startsWith("module"));
  const actions = OPERATOR_PERMISSION_KEYS.filter((k) => k.startsWith("action"));
  return [
    { title: "Módulos (acceso)", keys: modules },
    { title: "Acciones", keys: actions },
  ];
}
