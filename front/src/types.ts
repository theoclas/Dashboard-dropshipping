export type Role = "ADMIN" | "OPERADOR" | "LECTOR";

export const OPERATOR_PERMISSION_KEYS = [
  "moduleDashboard",
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
  companySettings?: {
    name: string;
    slug: string;
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
};

export type ImportAdvertisingPreviewResponse = {
  sampleRows: Array<{
    externalCampaignId: string;
    displayName?: string;
    recordDate: string;
    metaLinkClicks?: number;
    metaConversationsStarted?: number;
    shopifySessions?: number;
  }>;
  totalRows: number;
  errors: string[];
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

export type ImportMetaBillingResult = {
  accountsCreated: number;
  expensesCreated: number;
  errors: string[];
};
