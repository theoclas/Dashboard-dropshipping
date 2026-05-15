import axios from "axios";
import type { CpaRecordRow } from "./types";

/** Petición cancelada (AbortController); no mostrar error al usuario. */
export function isRequestCanceled(e: unknown): boolean {
  if (axios.isCancel(e)) return true;
  const err = e as { code?: string; name?: string };
  return err?.code === "ERR_CANCELED" || err?.name === "CanceledError";
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fersua_token");
  const companyId = localStorage.getItem("fersua_company_id");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers["x-auth-token"] = token;
  }
  if (companyId) config.headers["x-company-id"] = companyId;
  return config;
});

export type ImportResult = { imported: number; errors: string[] };

export type ImportEndpoint = "cartera" | "productos" | "pedidos";

/**
 * `POST /import/{endpoint}/` multipart campo `file`, barra final (compatibilidad con importadores Dropi).
 */
export async function importFile(
  endpoint: ImportEndpoint,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<ImportResult>(`/import/${endpoint}/`, formData, {
    timeout: 1_800_000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function importProductosFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ImportResult> {
  return importFile("productos", file, onProgress);
}

export async function importCarteraFile(file: File, onProgress?: (percent: number) => void): Promise<ImportResult> {
  return importFile("cartera", file, onProgress);
}

export async function importPedidosFile(file: File, onProgress?: (percent: number) => void): Promise<ImportResult> {
  return importFile("pedidos", file, onProgress);
}

export async function importMapeoEstadosFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<ImportResult>("/import/mapeo-estados/", formData, {
    timeout: 1_800_000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export type CpaRecordWriteBody = {
  semana?: string | null;
  fecha: string;
  producto: string;
  cuentaPublicitaria?: string | null;
  gastoPublicidad?: number | null;
  conversaciones?: number | null;
  totalFacturado?: number | null;
  gananciaPromedio?: number | null;
  ventas?: number | null;
};

export async function postCpaRecord(body: CpaRecordWriteBody): Promise<CpaRecordRow> {
  const { data } = await api.post<CpaRecordRow>("/cpa-records", body);
  return data;
}

export async function patchCpaRecord(id: string, body: Partial<CpaRecordWriteBody>): Promise<CpaRecordRow> {
  const { data } = await api.patch<CpaRecordRow>(`/cpa-records/${id}`, body);
  return data;
}

export async function deleteCpaRecord(id: string): Promise<void> {
  await api.delete(`/cpa-records/${id}`);
}

export async function importCpaFile(file: File, onProgress?: (percent: number) => void): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<ImportResult>("/import/cpa/", formData, {
    timeout: 1_800_000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function remapearEstados(): Promise<{ procesados: number; remapeados: number }> {
  const { data } = await api.post<{ procesados: number; remapeados: number }>("/import/remapear-estados");
  return data;
}

export async function wipeImportedTables(password: string): Promise<{
  deleted: { productos_detalle: number; cartera_movimientos: number; pedidos: number };
}> {
  const { data } = await api.post("/import/wipe-imported-tables", { password });
  return data;
}

export async function wipeCpa(password: string): Promise<{ deleted: number }> {
  const { data } = await api.post("/import/wipe-cpa", { password });
  return data;
}

export type OrdersPage = {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
};

export async function fetchOrdersPage(params: Record<string, unknown>): Promise<OrdersPage> {
  const { data } = await api.get<OrdersPage>("/orders", { params });
  return data;
}

/** Mismos filtros que el listado (sin paginación en el cuerpo). */
export async function downloadOrdersExport(filters: Record<string, unknown> = {}): Promise<void> {
  const response = await api.post("/orders/export", filters, {
    responseType: "blob",
    timeout: 120_000,
  });
  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pedidos.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

export async function updateOrder(id: string, payload: Record<string, unknown>): Promise<void> {
  await api.patch(`/orders/${id}`, payload);
}

export async function fetchProductosDetalle(pedidoIdDropi: string): Promise<unknown[]> {
  const { data } = await api.get<unknown[]>("/product-details", { params: { pedidoIdDropi } });
  return Array.isArray(data) ? data : [];
}

// ── Logística (reportes por empresa activa; mismos paths que Petho) ──
export type EfectividadTransportadoraRow = {
  empresa: string;
  enviados: number;
  transito: number;
  pctTransito: number;
  devoluciones: number;
  pctDevoluciones: number;
  cancelados: number;
  rechazados: number;
  entregados: number;
  pctEntregados: number;
};

export const getEfectividadTransportadoras = (
  params?: { desde?: string; hasta?: string; transportadora?: string },
  opts?: { signal?: AbortSignal },
) =>
  api
    .get<EfectividadTransportadoraRow[]>("/reportes-logistica/efectividad-transportadoras", {
      params,
      signal: opts?.signal,
    })
    .then((r) => r.data);

export type ComparativaGeograficaPunto = {
  ubicacion: string;
  transportadora: string;
  valorPct: number;
  numerador: number;
  denominador: number;
};

export type ComparativaGeograficaResponse = {
  dimension: "departamento" | "ciudad";
  metrica: "efectividad" | "devolucion";
  ubicaciones: string[];
  puntos: ComparativaGeograficaPunto[];
};

export const getComparativaGeografica = (
  params?: {
    dimension?: "departamento" | "ciudad";
    metrica?: "efectividad" | "devolucion";
    top?: number;
    desde?: string;
    hasta?: string;
    ciudad?: string;
  },
  opts?: { signal?: AbortSignal },
) =>
  api
    .get<ComparativaGeograficaResponse>("/reportes-logistica/comparativa-geografica", {
      params,
      signal: opts?.signal,
    })
    .then((r) => r.data);

export const getCiudadesComparativa = (params?: { desde?: string; hasta?: string }, opts?: { signal?: AbortSignal }) =>
  api
    .get<string[]>("/reportes-logistica/ciudades-comparativa", { params, signal: opts?.signal })
    .then((r) => r.data);
