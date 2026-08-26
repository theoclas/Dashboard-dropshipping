import type { ColumnsType } from "antd/es/table";
import type { OrdersTableConfig, OrdersTableColumnEntry, OrdersTableColumnPin } from "../types";
import type { Pedido } from "./ordersTypes";
import { ORDERS_COLUMN_LABELS, ORDERS_TABLE_CONFIG_VERSION } from "./ordersTableConfig";

/**
 * Vista Oficina: por defecto muestra casi todos los campos del Excel/pedido.
 * Config independiente de Pedidos (`User.oficina_table_config`).
 */
const DEFAULT_VISIBLE: { key: string; pin?: OrdersTableColumnPin }[] = [
  { key: "id", pin: "left" },
  { key: "id_dropi", pin: "left" },
  { key: "fecha" },
  { key: "cliente" },
  { key: "telefono" },
  { key: "email_cliente" },
  { key: "departamento" },
  { key: "ciudad" },
  { key: "direccion" },
  { key: "codigo_postal" },
  { key: "transportadora" },
  { key: "guia" },
  { key: "tipo_envio" },
  { key: "estado_operativo" },
  { key: "estatus_original" },
  { key: "ultimo_mov" },
  { key: "fecha_ult_mov" },
  { key: "hora_ult_mov" },
  { key: "dias_desde_ult_mov" },
  { key: "estado_unificado" },
  { key: "tipo_tienda" },
  { key: "tienda" },
  { key: "vendedor" },
  { key: "id_orden_tienda" },
  { key: "numero_pedido_tienda" },
  { key: "usuario_generacion_guia" },
  { key: "fecha_generacion_guia" },
  { key: "venta" },
  { key: "ganancia_calc" },
  { key: "flete" },
  { key: "costo_proveedor" },
  { key: "costo_devolucion_estimado" },
  { key: "cartera" },
  { key: "cartera_aplicada" },
  { key: "cartera_ok" },
  { key: "notas" },
  { key: "notas_manuales" },
  { key: "observacion_dropi" },
  { key: "tags" },
  { key: "acciones", pin: "right" },
];

/** Campos técnicos menos usados en el día a día de oficina; se pueden activar en el drawer. */
const DEFAULT_HIDDEN_KEYS = ["created_at", "updated_at"] as const;

export const DEFAULT_OFICINA_TABLE_CONFIG: OrdersTableConfig = {
  version: ORDERS_TABLE_CONFIG_VERSION,
  columns: [
    ...DEFAULT_VISIBLE.map(({ key, pin }) => ({ key, visible: true, pin })),
    ...DEFAULT_HIDDEN_KEYS.map((key) => ({ key, visible: false })),
  ],
};

export const OFICINA_COLUMN_LABELS = ORDERS_COLUMN_LABELS;

function parseSavedConfig(raw: unknown): OrdersTableConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { version?: unknown; columns?: unknown };
  if (o.version !== ORDERS_TABLE_CONFIG_VERSION || !Array.isArray(o.columns)) return null;
  const columns: OrdersTableColumnEntry[] = [];
  for (const item of o.columns) {
    if (!item || typeof item !== "object") continue;
    const e = item as { key?: unknown; visible?: unknown; pin?: unknown };
    if (typeof e.key !== "string" || !e.key.trim()) continue;
    if (typeof e.visible !== "boolean") continue;
    const pin = e.pin === "left" || e.pin === "right" ? e.pin : undefined;
    columns.push({ key: e.key.trim(), visible: e.visible, pin });
  }
  if (columns.length === 0) return null;
  return { version: ORDERS_TABLE_CONFIG_VERSION, columns };
}

export function mergeOficinaTableConfig(saved: unknown): OrdersTableConfig {
  const parsed = parseSavedConfig(saved);
  if (!parsed) return DEFAULT_OFICINA_TABLE_CONFIG;

  const defaultByKey = new Map(DEFAULT_OFICINA_TABLE_CONFIG.columns.map((c) => [c.key, c]));
  const savedByKey = new Map(parsed.columns.map((c) => [c.key, c]));
  const orderedKeys: string[] = [];
  for (const c of parsed.columns) {
    if (defaultByKey.has(c.key) && !orderedKeys.includes(c.key)) orderedKeys.push(c.key);
  }
  for (const c of DEFAULT_OFICINA_TABLE_CONFIG.columns) {
    if (!orderedKeys.includes(c.key)) orderedKeys.push(c.key);
  }

  const columns: OrdersTableColumnEntry[] = orderedKeys.map((key) => {
    const def = defaultByKey.get(key)!;
    const s = savedByKey.get(key);
    if (key === "acciones") {
      return { key, visible: true, pin: "right" as const };
    }
    return {
      key,
      visible: s?.visible ?? def.visible,
      pin: s?.pin ?? def.pin,
    };
  });

  return { version: ORDERS_TABLE_CONFIG_VERSION, columns };
}

export function buildVisibleOficinaColumns(
  config: OrdersTableConfig,
  defs: Record<string, ColumnsType<Pedido>[number] | undefined>,
): ColumnsType<Pedido> {
  const merged = mergeOficinaTableConfig(config);
  const out: ColumnsType<Pedido> = [];
  for (const entry of merged.columns) {
    if (!entry.visible && entry.key !== "acciones") continue;
    const col = defs[entry.key];
    if (!col) continue;
    const pin = entry.key === "acciones" ? "right" : entry.pin;
    out.push({
      ...col,
      ...(pin ? { fixed: pin } : { fixed: undefined }),
    });
  }
  return out;
}
