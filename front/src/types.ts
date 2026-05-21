export type Role = "ADMIN" | "OPERADOR" | "LECTOR";

export type OrdersTableColumnPin = "left" | "right";

export type OrdersTableColumnEntry = {
  key: string;
  visible: boolean;
  pin?: OrdersTableColumnPin;
};

export type OrdersTableConfig = {
  version: 1;
  columns: OrdersTableColumnEntry[];
};

export const OPERATOR_PERMISSION_KEYS = [
  "moduleDashboard",
  "moduleConfiguracion",
  "modulePedidos",
  "moduleReportes",
  "moduleImportaciones",
  "moduleMapeo",
  "moduleCpa",
  "moduleCatalogoProductos",
  "moduleCampanasMeta",
  "moduleCuentasPublicitarias",
  "moduleGastoOperacional",
  "actionCatalogoProductosCrud",
  "actionCampanasMetaCrud",
  "actionImportarAdvertisingCampaigns",
  "actionEditarMetricasAdvertising",
  "actionCuentasPublicitariasCrud",
  "actionGastoOperacionalCrud",
  "actionImportMetaBillingOperacional",
  "actionPedidosEditar",
  "actionPedidosExportar",
  "actionImportarDropi",
  "actionMapeoEstadosCrud",
  "actionCpaRegistrosCrud",
  "actionCpaImportarExcel",
  "actionConfigDashboardTarjetas",
  "actionConfigRetirosDropiNotas",
] as const;

export type OperatorPermissionKey = (typeof OPERATOR_PERMISSION_KEYS)[number];

export type CompanyMembership = {
  companyId: string;
  name: string;
  role: Role;
  isActive?: boolean;
};

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  activeCompany: string;
  companies: CompanyMembership[];
  operatorPerms?: Record<OperatorPermissionKey, boolean> | null;
  /** Preferencias de tarjetas del dashboard (`User.dashboard_config`). */
  dashboardConfig?: Record<string, boolean> | null;
  /** Columnas del módulo Pedidos (`User.orders_table_config`). */
  ordersTableConfig?: OrdersTableConfig | null;
  companySettings?: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    operationalExpenseEnabled: boolean;
  } | null;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  operationalExpenseEnabled?: boolean;
};

/** Retiros Dropi (`retiros_dropi`), sincronizados al importar cartera. */
export type DropiWithdrawalRow = {
  id: string;
  dropiMovementId: string;
  fecha: string | null;
  monto: string | null;
  descripcion: string | null;
  conceptoRetiro: string | null;
  notaAdicional: string | null;
};

export type CompanyMemberRow = {
  id: string;
  userId: string;
  role: Role;
  operatorPermissions: unknown;
  email: string;
  username: string | null;
  fullName: string;
};

/** Membresía de un usuario en una empresa (GET /users/:id/memberships). */
export type UserMembershipRow = {
  membershipId: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  companyActive: boolean;
  role: Role;
  operatorPermissions: unknown;
  canManage: boolean;
};

/** Resultado de búsqueda para asignar usuario a empresa (GET assignable-users). */
export type AssignableCompanyUser = {
  id: string;
  email: string;
  username: string | null;
  fullName: string;
  alreadyInCompany: boolean;
};

/** Fila `pedidos` alineada con Prisma `Order` (decimales vienen como string en JSON). */
export type OrderRow = {
  id: string;
  externalOrderId: string;
  fecha?: string | null;
  cliente?: string | null;
  transportadora?: string | null;
  estadoOperativo?: string | null;
  guia?: string | null;
  ciudad?: string | null;
  venta?: string | number | null;
  gananciaCalc?: string | number | null;
  estadoUnificado?: string | null;
  estatusOriginal?: string | null;
};

export type MapeoEstadoRow = {
  id: string;
  companyId: string;
  transportadora: string;
  estatusOriginal: string;
  ultimoMovimiento: string;
  estadoUnificado: string;
  createdAt: string;
  updatedAt: string;
};

export type CpaRecordRow = {
  id: string;
  semana?: string | null;
  fecha?: string | null;
  producto?: string | null;
  cuentaPublicitaria?: string | null;
  gastoPublicidad?: string | number | null;
  conversaciones?: number | null;
  totalFacturado?: string | number | null;
  gananciaPromedio?: string | number | null;
  ventas?: number | null;
  ticketPromedioProducto?: string | number | null;
  cpa?: string | number | null;
  conversionRate?: string | number | null;
  costoPublicitario?: string | number | null;
  rentabilidad?: string | number | null;
  utilidadAproximada?: string | number | null;
};

export type CpaExperimentalRecordRow = CpaRecordRow & {
  catalogProductId: string;
  catalogProduct?: { id: string; name: string; sku?: string | null };
};

export type CpaExperimentalRebuildResult = {
  daysWritten: number;
  warnings: string[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  sku?: string | null;
  isActive: boolean;
  notes?: string | null;
};

export type AdvertisingAccount = {
  id: string;
  metaAccountId: string;
  businessName?: string | null;
};

export type AdvertisingCampaignRow = {
  id: string;
  externalCampaignId: string;
  displayName?: string | null;
  advertisingAccountId?: string | null;
  advertisingAccount?: AdvertisingAccount | null;
};

export type AdvertisingCampaignMetricRow = {
  id: string;
  recordDate: string;
  metaLinkClicks?: number | null;
  metaConversationsStarted?: number | null;
  shopifySessions?: number | null;
  updatedAt?: string;
  createdAt?: string;
  campaignId?: string;
  companyId?: string;
  /** Copia de columnas del Excel Meta al importar (cabecera → valor). */
  metaExcelSnapshot?: Record<string, unknown> | null;
};

export type ImportAdvertisingPreviewResponse = {
  sampleRows: Array<{
    externalCampaignId: string;
    externalAdId?: string;
    displayName?: string;
    recordDate: string;
    metaLinkClicks?: number;
    metaConversationsStarted?: number;
    shopifySessions?: number;
  }>;
  totalRows: number;
  errors: string[];
  /** IDs Meta de campaña normalizados (sin espacios), únicos en el archivo. */
  uniqueCampaignIds: string[];
  /** Primer nombre de campaña visto por ID (si existe). */
  campaignDisplayNames: Record<string, string>;
  /** Filas agregadas (campaña + día) por ID de campaña normalizado. */
  campaignAggregatedRowCounts?: Record<string, number>;
};

export type ImportAdvertisingCampaignMetricsResult = {
  imported: number;
  campaignsUpdated: number;
  metricsCreated: number;
  metricsUpdated: number;
  errors: string[];
};

export type OperationalExpenseCategory = "SOFTWARE" | "COMUNICACIONES" | "OTRO";

export type OperationalExpenseRow = {
  id: string;
  fecha: string;
  monto: number;
  concepto: string;
  categoria?: OperationalExpenseCategory | null;
  banco?: string | null;
  medio?: string | null;
  cuentaPublicitaria?: string | null;
  advertisingAccountId?: string | null;
  notas?: string | null;
  pagado: boolean;
  advertisingAccount?: AdvertisingAccount | null;
};

export type AdvertisingAccountWithStats = AdvertisingAccount & {
  _count: { advertisingCampaigns: number; operationalExpenses: number };
};

export type AdvertisingAccountExpensesSummary = {
  totalGastado: number;
  totalPagado: number;
  pendientePorPagar: number;
};

export type AdvertisingAccountOperationalExpensesResponse = {
  summary: AdvertisingAccountExpensesSummary;
  items: OperationalExpenseRow[];
};

export type ImportMetaBillingResult = {
  accountsCreated: number;
  expensesCreated: number;
  expensesSkipped: number;
  errors: string[];
};
