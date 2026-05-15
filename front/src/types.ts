export type Role = "ADMIN" | "OPERADOR" | "LECTOR";

export type CompanyMembership = {
  companyId: string;
  name: string;
  role: Role;
};

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  activeCompany: string;
  companies: CompanyMembership[];
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
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
