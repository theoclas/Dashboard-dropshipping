import type { ColumnsType } from "antd/es/table";
import type { OrdersTableConfig, OrdersTableColumnEntry, OrdersTableColumnPin } from "../types";
import type { Pedido } from "./ordersTypes";

export const ORDERS_TABLE_CONFIG_VERSION = 1 as const;

const DEFAULT_VISIBLE: { key: string; pin?: OrdersTableColumnPin }[] = [
  { key: "id", pin: "left" },
  { key: "id_dropi", pin: "left" },
  { key: "fecha" },
  { key: "cliente" },
  { key: "telefono" },
  { key: "ciudad" },
  { key: "notas_manuales" },
  { key: "transportadora" },
  { key: "guia" },
  { key: "estado_operativo" },
  { key: "venta" },
  { key: "ganancia_calc" },
  { key: "flete" },
  { key: "cartera" },
  { key: "cartera_ok" },
  { key: "dias_desde_ult_mov" },
  { key: "notas" },
  { key: "estatus_original" },
  { key: "ultimo_mov" },
  { key: "estado_unificado" },
  { key: "acciones", pin: "right" },
];

const DEFAULT_HIDDEN_KEYS = [
  "departamento",
  "direccion",
  "tipo_tienda",
  "tienda",
  "vendedor",
  "tipo_envio",
  "email_cliente",
  "observacion_dropi",
  "tags",
  "codigo_postal",
  "id_orden_tienda",
  "numero_pedido_tienda",
  "usuario_generacion_guia",
  "fecha_generacion_guia",
  "costo_devolucion_estimado",
  "costo_proveedor",
  "cartera_aplicada",
  "fecha_ult_mov",
  "hora_ult_mov",
  "created_at",
  "updated_at",
] as const;

export const DEFAULT_ORDERS_TABLE_CONFIG: OrdersTableConfig = {
  version: ORDERS_TABLE_CONFIG_VERSION,
  columns: [
    ...DEFAULT_VISIBLE.map(({ key, pin }) => ({ key, visible: true, pin })),
    ...DEFAULT_HIDDEN_KEYS.map((key) => ({ key, visible: false })),
  ],
};

export const ORDERS_COLUMN_LABELS: Record<string, string> = {
  id: "ID",
  id_dropi: "ID Dropi",
  fecha: "Fecha",
  cliente: "Cliente",
  telefono: "Teléfono",
  ciudad: "Ciudad",
  departamento: "Departamento",
  direccion: "Dirección",
  notas_manuales: "Mis Notas",
  transportadora: "Transportadora",
  guia: "Guía",
  estado_operativo: "Operativo",
  venta: "Venta",
  ganancia_calc: "Ganancia",
  flete: "Flete",
  cartera: "Cartera",
  cartera_aplicada: "Cartera aplicada",
  cartera_ok: "Cartera OK",
  dias_desde_ult_mov: "Días últ. mov",
  notas: "Notas Dropi",
  estatus_original: "Estado Dropi",
  ultimo_mov: "Últ. Mov. Dropi",
  estado_unificado: "Estado Asignado",
  costo_devolucion_estimado: "Costo dev. est.",
  costo_proveedor: "Costo proveedor",
  fecha_ult_mov: "Fecha últ. mov",
  hora_ult_mov: "Hora últ. mov",
  tipo_tienda: "Tipo de tienda",
  tienda: "Tienda",
  vendedor: "Vendedor",
  tipo_envio: "Tipo de envío",
  email_cliente: "Email cliente",
  observacion_dropi: "Observación Dropi",
  tags: "Tags",
  codigo_postal: "Código postal",
  id_orden_tienda: "ID orden tienda",
  numero_pedido_tienda: "Nº pedido tienda",
  usuario_generacion_guia: "Usuario gen. guía",
  fecha_generacion_guia: "Fecha gen. guía",
  created_at: "Creado",
  updated_at: "Actualizado",
  acciones: "Acciones",
};

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

/** Combina config guardada con el default (nuevas columnas, claves obsoletas). */
export function mergeOrdersTableConfig(saved: unknown): OrdersTableConfig {
  const parsed = parseSavedConfig(saved);
  if (!parsed) return DEFAULT_ORDERS_TABLE_CONFIG;

  const defaultByKey = new Map(DEFAULT_ORDERS_TABLE_CONFIG.columns.map((c) => [c.key, c]));
  const savedByKey = new Map(parsed.columns.map((c) => [c.key, c]));
  const orderedKeys: string[] = [];
  for (const c of parsed.columns) {
    if (defaultByKey.has(c.key) && !orderedKeys.includes(c.key)) orderedKeys.push(c.key);
  }
  for (const c of DEFAULT_ORDERS_TABLE_CONFIG.columns) {
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

export function buildVisibleColumns(
  config: OrdersTableConfig,
  defs: Record<string, ColumnsType<Pedido>[number] | undefined>,
): ColumnsType<Pedido> {
  const merged = mergeOrdersTableConfig(config);
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
