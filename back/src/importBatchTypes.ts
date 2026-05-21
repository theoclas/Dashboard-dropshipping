/** Payload JSON guardado en `ImportBatch.payload` para deshacer importaciones Dropi. */

export type CarteraUndoPayload = {
  walletLegacyIds: string[];
  dropiMovementIds: string[];
};

export type ProductDetailSnapshot = {
  pedidoIdDropi: string;
  productoId: string | null;
  sku: string | null;
  variacionId: string | null;
  productoNombre: string | null;
  variacion: string | null;
  cantidad: number | null;
  precioProveedor: string | null;
  precioProveedorXCantidad: string | null;
};

export type ProductosUndoPayload = {
  pedidoIds: string[];
  previousProductDetails: ProductDetailSnapshot[];
};

export type OrderSnapshot = {
  externalOrderId: string;
  fecha: string | null;
  cliente: string | null;
  transportadora: string | null;
  estadoOperativo: string | null;
  guia: string | null;
  departamento: string | null;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  notas: string | null;
  notasManuales: string | null;
  venta: string | null;
  gananciaCalc: string | null;
  flete: string | null;
  costoDevolucionEstimado: string | null;
  costoProveedor: string | null;
  estatusOriginal: string | null;
  ultimoMov: string | null;
  fechaUltMov: string | null;
  horaUltMov: string | null;
  diasDesdeUltMov: number | null;
  estadoUnificado: string | null;
  cartera: string | null;
  carteraAplicada: string | null;
  estadoCartera: string | null;
  tipoTienda: string | null;
  tienda: string | null;
  vendedor: string | null;
  tipoEnvio: string | null;
  emailCliente: string | null;
  observacionDropi: string | null;
  tags: string | null;
  codigoPostal: string | null;
  idOrdenTienda: string | null;
  numeroPedidoTienda: string | null;
  usuarioGeneracionGuia: string | null;
  fechaGeneracionGuia: string | null;
};

export type PedidosUndoPayload = {
  createdOrderIds: string[];
  updatedOrders: OrderSnapshot[];
};

export type ImportBatchPayload = CarteraUndoPayload | ProductosUndoPayload | PedidosUndoPayload;

export function isCarteraPayload(p: ImportBatchPayload): p is CarteraUndoPayload {
  return "walletLegacyIds" in p;
}

export function isProductosPayload(p: ImportBatchPayload): p is ProductosUndoPayload {
  return "pedidoIds" in p && "previousProductDetails" in p;
}

export function isPedidosPayload(p: ImportBatchPayload): p is PedidosUndoPayload {
  return "createdOrderIds" in p && "updatedOrders" in p;
}
