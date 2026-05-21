/** Fila API pedidos (snake_case). */
export type Pedido = {
  id: string;
  id_dropi: string;
  fecha: string | null;
  cliente: string | null;
  transportadora: string | null;
  estado_operativo: string | null;
  guia: string | null;
  departamento: string | null;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  notas: string | null;
  venta: number | null;
  ganancia_calc: number | null;
  flete: number | null;
  costo_devolucion_estimado: number | null;
  costo_proveedor: number | null;
  cartera: number | null;
  cartera_aplicada: number | null;
  estado_cartera: string | null;
  estado_unificado: string | null;
  estatus_original: string | null;
  ultimo_mov: string | null;
  fecha_ult_mov: string | null;
  hora_ult_mov: number | null;
  dias_desde_ult_mov: number | null;
  notas_manuales: string | null;
  tipo_tienda: string | null;
  tienda: string | null;
  vendedor: string | null;
  tipo_envio: string | null;
  email_cliente: string | null;
  observacion_dropi: string | null;
  tags: string | null;
  codigo_postal: string | null;
  id_orden_tienda: string | null;
  numero_pedido_tienda: string | null;
  usuario_generacion_guia: string | null;
  fecha_generacion_guia: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProductoDetalle = {
  id: number;
  pedido_id_dropi: string;
  producto_nombre: string | null;
  cantidad: number | null;
  precio_proveedor: number | null;
  sku: string | null;
  variacion: string | null;
};

export const PEDIDO_COLUMN_FILTER_KEYS = [
  "id",
  "id_dropi",
  "estado_unificado",
  "transportadora",
  "ciudad",
  "cliente",
  "telefono",
  "guia",
  "notas_manuales",
  "estado_operativo",
  "notas",
  "estatus_original",
  "ultimo_mov",
  "estado_cartera",
  "venta",
  "ganancia_calc",
  "flete",
  "cartera",
  "cartera_aplicada",
  "dias_desde_ult_mov",
  "fecha",
  "departamento",
  "direccion",
  "costo_devolucion_estimado",
  "costo_proveedor",
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
] as const;

export type PedidoColumnFilterKey = (typeof PEDIDO_COLUMN_FILTER_KEYS)[number];

export const initialColumnFilters: Record<PedidoColumnFilterKey, string> = {
  id: "",
  id_dropi: "",
  estado_unificado: "",
  transportadora: "",
  ciudad: "",
  cliente: "",
  telefono: "",
  guia: "",
  notas_manuales: "",
  estado_operativo: "",
  notas: "",
  estatus_original: "",
  ultimo_mov: "",
  estado_cartera: "",
  venta: "",
  ganancia_calc: "",
  flete: "",
  cartera: "",
  cartera_aplicada: "",
  dias_desde_ult_mov: "",
  fecha: "",
  departamento: "",
  direccion: "",
  costo_devolucion_estimado: "",
  costo_proveedor: "",
  tipo_tienda: "",
  tienda: "",
  vendedor: "",
  tipo_envio: "",
  email_cliente: "",
  observacion_dropi: "",
  tags: "",
  codigo_postal: "",
  id_orden_tienda: "",
  numero_pedido_tienda: "",
  usuario_generacion_guia: "",
};
