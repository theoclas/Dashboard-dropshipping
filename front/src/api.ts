import axios from "axios";
import type {
  AdvertisingAccount,
  AdvertisingAccountOperationalExpensesResponse,
  AdvertisingAccountWithStats,
  AdvertisingCampaignMetricRow,
  AdvertisingCampaignRow,
  AssignableCompanyUser,
  CatalogProduct,
  Company,
  CompanyMemberRow,
  UserMembershipRow,
  CpaRecordRow,
  CpaExperimentalRecordRow,
  CpaExperimentalRebuildResult,
  CpaResumenResponse,
  CarteraSalidaCategoria,
  CarteraSalidasResponse,
  DropiWithdrawalRow,
  ImportAdvertisingCampaignMetricsResult,
  ImportAdvertisingPreviewResponse,
  ImportMetaBillingResult,
  MetaAdsApp,
  MetaAdsAppOption,
  MetaAdsSystemUser,
  MetaAdsSystemUserOption,
  OperationalExpenseRow,
  OrdersTableConfig,
  Role,
} from "./types";

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

export type ImportResult = { imported: number; errors: string[]; retirosUpserted?: number; batchId?: string };

export type ImportBatchKind = "CARTERA" | "PRODUCTOS" | "PEDIDOS";

export type ImportBatchRow = {
  id: string;
  kind: ImportBatchKind;
  fileName: string | null;
  imported: number;
  undoneAt: string | null;
  createdAt: string;
};

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

export async function fetchCpaExperimental(params?: {
  catalogProductId?: string;
  desde?: string;
  hasta?: string;
}): Promise<CpaExperimentalRecordRow[]> {
  const { data } = await api.get<CpaExperimentalRecordRow[]>("/cpa-experimental", { params });
  return data;
}

export async function fetchCpaResumen(params: {
  desde: string;
  hasta: string;
}): Promise<CpaResumenResponse> {
  const { data } = await api.get<CpaResumenResponse>("/cpa-resumen", { params });
  return data;
}

export async function rebuildCpaExperimental(body: {
  catalogProductId: string;
  desde: string;
  hasta: string;
}): Promise<CpaExperimentalRebuildResult> {
  const { data } = await api.post<CpaExperimentalRebuildResult>("/cpa-experimental/rebuild", body);
  return data;
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

export async function fetchImportBatches(): Promise<ImportBatchRow[]> {
  const { data } = await api.get<ImportBatchRow[]>("/import/batches");
  return data;
}

export async function undoImportBatch(batchId: string): Promise<{
  kind: ImportBatchKind;
  deleted: Record<string, number>;
  restored: Record<string, number>;
}> {
  const { data } = await api.post(`/import/batches/${batchId}/undo`);
  return data;
}

export async function wipeImportedTables(password: string): Promise<{
  deleted: {
    productos_detalle: number;
    cartera_movimientos: number;
    pedidos: number;
    retiros_dropi: number;
  };
}> {
  const { data } = await api.post("/import/wipe-imported-tables", { password });
  return data;
}

export async function wipeCpa(password: string): Promise<{ deleted: number }> {
  const { data } = await api.post("/import/wipe-cpa", { password });
  return data;
}

export async function fetchDropiWithdrawals(): Promise<DropiWithdrawalRow[]> {
  const { data } = await api.get<DropiWithdrawalRow[]>("/dropi-retiros");
  return data;
}

export async function patchDropiWithdrawalNota(id: string, notaAdicional: string | null): Promise<DropiWithdrawalRow> {
  const { data } = await api.patch<DropiWithdrawalRow>(`/dropi-retiros/${id}`, { notaAdicional });
  return data;
}

export async function fetchCarteraSalidas(params?: {
  desde?: string;
  hasta?: string;
  categoria?: CarteraSalidaCategoria;
}): Promise<CarteraSalidasResponse> {
  const { data } = await api.get<CarteraSalidasResponse>("/cartera-salidas", { params });
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

export type OrderProductLine = {
  id: number;
  pedido_id_dropi: string;
  producto_id: string | null;
  producto_nombre: string | null;
  sku: string | null;
  variacion_id: string | null;
  variacion: string | null;
  cantidad: number | null;
  precio_proveedor: number | null;
  precio_proveedor_x_cantidad: number | null;
  variant_key: string;
  catalog_product_id: string | null;
  catalog_product_name: string | null;
  catalog_dropi_link_id: string | null;
};

/** Fila agregada por `producto_id` (vista agrupada). */
export type OrderProductGroup = {
  producto_id: string;
  producto_nombre: string | null;
  line_count: number;
  pedidos_distinct: number;
  cantidad: number;
  precio_proveedor_min: number | null;
  precio_proveedor_max: number | null;
  precio_proveedor_x_cantidad: number | null;
  sku_variacion_resumen: string;
  variant_count: number;
  linked_variant_count: number;
  catalog_link_status: "none" | "partial" | "full";
  catalog_product_name: string | null;
  catalog_product_id: string | null;
};

export type OrderProductLinesResponse = {
  grouped: boolean;
  items: OrderProductLine[] | OrderProductGroup[];
  total: number;
  page: number;
  limit: number;
};

export async function fetchOrderProductLines(params: {
  page?: number;
  limit?: number;
  q?: string;
  /** Si true, una fila por `producto_id` (excluye líneas sin id de producto). */
  grouped?: boolean;
  /** Filtra líneas por id de producto Dropi (vista por línea). */
  productoId?: string;
}): Promise<OrderProductLinesResponse> {
  const { data } = await api.get<OrderProductLinesResponse>("/order-product-lines", {
    params: {
      page: params.page,
      limit: params.limit,
      q: params.q,
      grouped: params.grouped ? "1" : undefined,
      productoId: params.productoId || undefined,
    },
  });
  return data;
}

export async function upsertCatalogProductDropiLink(
  catalogProductId: string,
  body: {
    productoId?: string | null;
    sku?: string | null;
    variacionId?: string | null;
    variacion?: string | null;
    productoNombre?: string | null;
  },
): Promise<{
  id: string;
  variant_key: string;
  producto_id: string | null;
  sku: string | null;
  variacion_id: string | null;
  producto_nombre: string | null;
  variacion: string | null;
}> {
  const { data } = await api.post(`/catalog-products/${catalogProductId}/dropi-links`, body);
  return data;
}

export type CatalogDropiLinkBulkConflict = {
  sku: string | null;
  variacion: string | null;
  variacion_id: string | null;
  message: string;
};

export async function upsertCatalogProductDropiLinksBulk(
  catalogProductId: string,
  variants: {
    productoId?: string | null;
    sku?: string | null;
    variacionId?: string | null;
    variacion?: string | null;
    productoNombre?: string | null;
  }[],
): Promise<{ applied: number; skipped_conflict: number; conflicts: CatalogDropiLinkBulkConflict[] }> {
  const { data } = await api.post(`/catalog-products/${catalogProductId}/dropi-links/bulk`, { variants });
  return data;
}

export async function deleteCatalogProductDropiLink(catalogProductId: string, linkId: string): Promise<void> {
  await api.delete(`/catalog-products/${catalogProductId}/dropi-links/${linkId}`);
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

// ── Catálogo, campañas Meta, cuentas publicitarias, gastos ──

export async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  const { data } = await api.get<CatalogProduct[]>("/catalog-products");
  return data;
}

export async function postCatalogProduct(body: { name: string; sku?: string; notes?: string }): Promise<CatalogProduct> {
  const { data } = await api.post<CatalogProduct>("/catalog-products", body);
  return data;
}

export async function fetchAdvertisingCampaigns(productId: string): Promise<AdvertisingCampaignRow[]> {
  const { data } = await api.get<AdvertisingCampaignRow[]>(
    `/catalog-products/${productId}/advertising-campaigns`,
  );
  return data;
}

export async function postAdvertisingCampaign(
  productId: string,
  body: { externalCampaignId: string; displayName?: string; advertisingAccountId?: string | null },
): Promise<AdvertisingCampaignRow> {
  const { data } = await api.post<AdvertisingCampaignRow>(
    `/catalog-products/${productId}/advertising-campaigns`,
    body,
  );
  return data;
}

export async function patchAdvertisingCampaign(
  id: string,
  body: { displayName?: string | null; advertisingAccountId?: string | null },
): Promise<AdvertisingCampaignRow> {
  const { data } = await api.patch<AdvertisingCampaignRow>(`/advertising-campaigns/${id}`, body);
  return data;
}

export async function deleteAdvertisingCampaign(id: string): Promise<void> {
  await api.delete(`/advertising-campaigns/${id}`);
}

export async function fetchAdvertisingMetrics(campaignId: string): Promise<AdvertisingCampaignMetricRow[]> {
  const { data } = await api.get<AdvertisingCampaignMetricRow[]>(`/advertising-campaigns/${campaignId}/metrics`);
  return data;
}

export async function patchAdvertisingMetric(
  metricId: string,
  body: {
    metaLinkClicks?: number | null;
    metaConversationsStarted?: number | null;
    shopifySessions?: number | null;
  },
): Promise<AdvertisingCampaignMetricRow> {
  const { data } = await api.patch<AdvertisingCampaignMetricRow>(
    `/advertising-campaign-metrics/${metricId}`,
    body,
  );
  return data;
}

export async function deleteAdvertisingMetric(metricId: string): Promise<void> {
  await api.delete(`/advertising-campaign-metrics/${metricId}`);
}

export async function previewAdvertisingCampaignImport(
  productId: string,
  file: File,
): Promise<ImportAdvertisingPreviewResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<ImportAdvertisingPreviewResponse>(
    `/catalog-products/${productId}/advertising-campaigns/import/preview`,
    fd,
    { timeout: 120_000 },
  );
  return data;
}

export async function importAdvertisingCampaignMetrics(
  productId: string,
  file: File,
  options: {
    useShopifySessions?: boolean;
    shopifySessionsByCampaignId?: Record<string, number>;
    applyAdvertisingAccount?: boolean;
    advertisingAccountId?: string | null;
    /** Solo importar estas campañas (normalizadas); usar cuando el archivo trae varias. */
    allowedCampaignIds?: string[];
  },
): Promise<ImportAdvertisingCampaignMetricsResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("options", JSON.stringify(options));
  const { data } = await api.post<ImportAdvertisingCampaignMetricsResult>(
    `/catalog-products/${productId}/advertising-campaigns/import`,
    fd,
    { timeout: 300_000 },
  );
  return data;
}

export async function previewMetaApiCampaignImport(
  productId: string,
  options: {
    advertisingAccountId: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
    reportDate?: string | null;
  },
): Promise<ImportAdvertisingPreviewResponse> {
  const { data } = await api.post<ImportAdvertisingPreviewResponse>(
    `/catalog-products/${productId}/advertising-campaigns/import/meta-api/preview`,
    options,
    { timeout: 120_000 },
  );
  return data;
}

export async function importMetaApiCampaignMetrics(
  productId: string,
  options: {
    advertisingAccountId: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
    reportDate?: string | null;
    useShopifySessions?: boolean;
    shopifySessionsByCampaignId?: Record<string, number>;
    applyAdvertisingAccount?: boolean;
    allowedCampaignIds?: string[];
  },
): Promise<ImportAdvertisingCampaignMetricsResult> {
  const { data } = await api.post<ImportAdvertisingCampaignMetricsResult>(
    `/catalog-products/${productId}/advertising-campaigns/import/meta-api`,
    options,
    { timeout: 300_000 },
  );
  return data;
}

export async function fetchMetaCampaignAdvertisingAccounts(): Promise<AdvertisingAccount[]> {
  const { data } = await api.get<AdvertisingAccount[]>("/meta-campaign/advertising-accounts");
  return data;
}

export async function fetchMetaAdsApps(): Promise<MetaAdsApp[]> {
  const { data } = await api.get<MetaAdsApp[]>("/admin/meta-ads-apps");
  return data;
}

export async function createMetaAdsApp(body: {
  name: string;
  metaAppId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}): Promise<MetaAdsApp> {
  const { data } = await api.post<MetaAdsApp>("/admin/meta-ads-apps", body);
  return data;
}

export async function updateMetaAdsApp(
  id: string,
  body: {
    name?: string;
    metaAppId?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
): Promise<MetaAdsApp> {
  const { data } = await api.patch<MetaAdsApp>(`/admin/meta-ads-apps/${id}`, body);
  return data;
}

export async function deleteMetaAdsApp(id: string): Promise<void> {
  await api.delete(`/admin/meta-ads-apps/${id}`);
}

export async function fetchMetaAdsAppOptions(): Promise<MetaAdsAppOption[]> {
  const { data } = await api.get<MetaAdsAppOption[]>("/meta-ads-apps/options");
  return data;
}

export async function fetchMetaAdsSystemUsers(): Promise<MetaAdsSystemUser[]> {
  const { data } = await api.get<MetaAdsSystemUser[]>("/admin/meta-ads-system-users");
  return data;
}

export async function createMetaAdsSystemUser(body: {
  name: string;
  metaSystemUserId?: string | null;
  notes?: string | null;
  isActive?: boolean;
  appAccess: Array<{
    appId: string;
    accessToken: string;
    tokenExpiresAt?: string | null;
    isDefault?: boolean;
  }>;
}): Promise<MetaAdsSystemUser> {
  const { data } = await api.post<MetaAdsSystemUser>("/admin/meta-ads-system-users", body);
  return data;
}

export async function updateMetaAdsSystemUser(
  id: string,
  body: {
    name?: string;
    metaSystemUserId?: string | null;
    notes?: string | null;
    isActive?: boolean;
    appAccess?: Array<{
      appId: string;
      accessToken?: string;
      tokenExpiresAt?: string | null;
      isDefault?: boolean;
    }>;
  },
): Promise<MetaAdsSystemUser> {
  const { data } = await api.patch<MetaAdsSystemUser>(`/admin/meta-ads-system-users/${id}`, body);
  return data;
}

export async function deleteMetaAdsSystemUser(id: string): Promise<void> {
  await api.delete(`/admin/meta-ads-system-users/${id}`);
}

export async function fetchMetaAdsSystemUserOptions(appId?: string): Promise<MetaAdsSystemUserOption[]> {
  const { data } = await api.get<MetaAdsSystemUserOption[]>("/meta-ads-system-users/options", {
    params: appId ? { appId } : undefined,
  });
  return data;
}

export async function postMetaCampaignAdvertisingAccount(body: {
  metaAccountId: string;
  businessName?: string;
}): Promise<AdvertisingAccount> {
  const { data } = await api.post<AdvertisingAccount>("/meta-campaign/advertising-accounts", body);
  return data;
}

export async function fetchAdvertisingAccountsWithStats(): Promise<AdvertisingAccountWithStats[]> {
  const { data } = await api.get<AdvertisingAccountWithStats[]>("/advertising-accounts/with-stats");
  return data;
}

export async function fetchAdvertisingAccountOperationalExpenses(
  accountId: string,
  params?: { desde?: string; hasta?: string },
): Promise<AdvertisingAccountOperationalExpensesResponse> {
  const { data } = await api.get<AdvertisingAccountOperationalExpensesResponse>(
    `/advertising-accounts/${accountId}/operational-expenses`,
    { params },
  );
  return data;
}

export async function fetchOperationalExpenses(): Promise<OperationalExpenseRow[]> {
  const { data } = await api.get<OperationalExpenseRow[]>("/operational-expenses");
  return data;
}

export async function postOperationalExpense(body: {
  fecha: string;
  monto: number;
  concepto: string;
  categoria?: OperationalExpenseRow["categoria"];
  banco?: string | null;
  medio?: string | null;
  cuentaPublicitaria?: string | null;
  advertisingAccountId?: string | null;
  notas?: string | null;
  pagado?: boolean;
}): Promise<OperationalExpenseRow> {
  const { data } = await api.post<OperationalExpenseRow>("/operational-expenses", body);
  return data;
}

export async function patchOperationalExpense(
  id: string,
  body: Partial<{
    fecha: string;
    monto: number;
    concepto: string;
    categoria: OperationalExpenseRow["categoria"] | null;
    banco: string | null;
    medio: string | null;
    cuentaPublicitaria: string | null;
    advertisingAccountId: string | null;
    notas: string | null;
    pagado: boolean;
  }>,
): Promise<OperationalExpenseRow> {
  const { data } = await api.patch<OperationalExpenseRow>(`/operational-expenses/${id}`, body);
  return data;
}

export async function deleteOperationalExpense(id: string, password: string): Promise<void> {
  await api.delete(`/operational-expenses/${id}`, { data: { password } });
}

export async function importMetaBillingOperationalCsv(file: File): Promise<ImportMetaBillingResult> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<ImportMetaBillingResult>("/operational-expenses/import-meta-billing-csv", fd, {
    timeout: 300_000,
  });
  return data;
}

export async function fetchCompanies(): Promise<Company[]> {
  const { data } = await api.get<Company[]>("/companies");
  return data;
}

export async function assignUserToCompany(
  companyId: string,
  body: { email?: string; username?: string; role: Role },
): Promise<unknown> {
  const { data } = await api.post(`/companies/${companyId}/users`, body);
  return data;
}

export type CreateCompanyUserPayload = {
  username: string;
  email: string;
  fullName: string;
  password: string;
  role: Role;
};

export async function createCompanyUserAccount(
  companyId: string,
  body: CreateCompanyUserPayload,
): Promise<unknown> {
  const { data } = await api.post(`/companies/${companyId}/users/create`, body);
  return data;
}

export async function fetchCompanyMembers(companyId: string): Promise<CompanyMemberRow[]> {
  const { data } = await api.get<CompanyMemberRow[]>(`/companies/${companyId}/members`);
  return data;
}

export async function fetchAssignableUsersForCompany(companyId: string, q: string): Promise<AssignableCompanyUser[]> {
  const { data } = await api.get<AssignableCompanyUser[]>(`/companies/${companyId}/assignable-users`, {
    params: { q },
  });
  return data;
}

export async function patchCompanyMember(
  companyId: string,
  membershipId: string,
  body: { role?: Role; operatorPermissions?: Record<string, boolean> | null },
): Promise<CompanyMemberRow> {
  const { data } = await api.patch<CompanyMemberRow>(`/companies/${companyId}/members/${membershipId}`, body);
  return data;
}

export async function fetchUserMemberships(userId: string): Promise<UserMembershipRow[]> {
  const { data } = await api.get<UserMembershipRow[]>(`/users/${userId}/memberships`);
  return data;
}

export async function addUserMembership(
  userId: string,
  body: { companyId: string; role: Role },
): Promise<UserMembershipRow> {
  const { data } = await api.post<UserMembershipRow>(`/users/${userId}/memberships`, body);
  return data;
}

export async function removeUserMembership(userId: string, companyId: string): Promise<void> {
  await api.delete(`/users/${userId}/memberships/${companyId}`);
}

export async function patchCompanySettings(
  companyId: string,
  body: { operationalExpenseEnabled?: boolean },
): Promise<Company> {
  const { data } = await api.patch<Company>(`/companies/${companyId}/settings`, body);
  return data;
}

export async function patchDashboardConfig(dashboardConfig: Record<string, boolean>): Promise<{
  dashboardConfig: Record<string, boolean>;
}> {
  const { data } = await api.patch<{ dashboardConfig: Record<string, boolean> }>(
    "/auth/me/dashboard-config",
    dashboardConfig,
  );
  return data;
}

export async function patchOrdersTableConfig(
  ordersTableConfig: OrdersTableConfig,
): Promise<{ ordersTableConfig: OrdersTableConfig }> {
  const { data } = await api.patch<{ ordersTableConfig: OrdersTableConfig }>(
    "/auth/me/orders-table-config",
    ordersTableConfig,
  );
  return data;
}
