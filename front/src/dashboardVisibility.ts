/** Claves alineadas con `User.dashboard_config` en Prisma y comentario del schema. */

export const DASHBOARD_CARD_KEYS = [
  "card_totalOrders",
  "card_totalGuias",
  "card_productosVendidos",
  "card_sinMapear",
  "card_pedidosCancelados",
  "card_pedidosPendientes",
  "card_entregados",
  "card_devoluciones",
  "card_enProceso",
  "card_totalVentas",
  "card_gananciaTotal",
  "card_gananciaEstimada",
  "card_gananciaProyectada",
  "card_cpaPromedio",
  "card_gastoOperacional",
  "card_retirosDropi",
  "card_pedidosCarteraSinOk",
  "card_pedidosCarteraSinOkEntregados",
  "card_pedidosCarteraOkEntregados",
  "card_pedidosCarteraOkDevoluciones",
  "card_pedidosNovedad",
] as const;

export type DashboardCardKey = (typeof DASHBOARD_CARD_KEYS)[number];

const ALL_TRUE: Record<DashboardCardKey, true> = Object.fromEntries(DASHBOARD_CARD_KEYS.map((k) => [k, true])) as Record<
  DashboardCardKey,
  true
>;

export const DASHBOARD_CARD_LABELS: Record<DashboardCardKey, { label: string; section: string }> = {
  card_totalOrders: { label: "Total pedidos", section: "Volumen y pedidos" },
  card_totalGuias: { label: "Total guías", section: "Volumen y pedidos" },
  card_productosVendidos: { label: "Productos vendidos", section: "Volumen y pedidos" },
  card_sinMapear: { label: "Sin mapear", section: "Volumen y pedidos" },
  card_pedidosCancelados: { label: "Total pedidos cancelados", section: "Volumen y pedidos" },
  card_pedidosPendientes: { label: "Total pedidos pendientes", section: "Volumen y pedidos" },
  card_entregados: { label: "Entregados", section: "Estados de entrega" },
  card_devoluciones: { label: "Devoluciones", section: "Estados de entrega" },
  card_enProceso: { label: "En proceso", section: "Estados de entrega" },
  card_totalVentas: { label: "Total ventas", section: "Finanzas" },
  card_gananciaTotal: { label: "Ganancia total (cartera OK)", section: "Finanzas" },
  card_gananciaEstimada: { label: "Ganancia estimada", section: "Finanzas" },
  card_gananciaProyectada: { label: "Ganancia proyectada", section: "Finanzas" },
  card_cpaPromedio: { label: "CPA promedio", section: "Finanzas" },
  card_gastoOperacional: { label: "Gasto operacional", section: "Finanzas" },
  card_retirosDropi: { label: "Retiros Dropi", section: "Finanzas" },
  card_pedidosCarteraSinOk: { label: "Devoluciones cartera sin OK", section: "Cartera y novedades" },
  card_pedidosCarteraSinOkEntregados: { label: "Entregados cartera sin OK", section: "Cartera y novedades" },
  card_pedidosCarteraOkEntregados: { label: "Cartera OK — entregados", section: "Cartera y novedades" },
  card_pedidosCarteraOkDevoluciones: { label: "Cartera OK — devoluciones", section: "Cartera y novedades" },
  card_pedidosNovedad: { label: "Novedades (pedidos)", section: "Cartera y novedades" },
};

export function mergeDashboardVisibility(stored: unknown): Record<DashboardCardKey, boolean> {
  const out: Record<DashboardCardKey, boolean> = { ...ALL_TRUE };
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const k of DASHBOARD_CARD_KEYS) {
      const v = (stored as Record<string, unknown>)[k];
      if (typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

export function isDashboardCardVisible(stored: unknown, key: DashboardCardKey): boolean {
  return mergeDashboardVisibility(stored)[key] !== false;
}
