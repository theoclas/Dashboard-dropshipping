import { prisma } from "./prisma";

export type MetaAdsAppAccessPublic = {
  appId: string;
  appName: string;
  metaAppId: string | null;
  tokenMasked: string | null;
  hasToken: boolean;
  tokenExpiresAt: string | null;
  isDefault: boolean;
};

export type MetaAdsSystemUserPublic = {
  id: string;
  companyId: string;
  name: string;
  metaSystemUserId: string | null;
  notes: string | null;
  isActive: boolean;
  apps: MetaAdsAppAccessPublic[];
  /** Empresas que pueden usar este usuario de Meta. */
  companies: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
};

export type MetaAdsSystemUserOption = {
  id: string;
  name: string;
  metaSystemUserId: string | null;
  isDefault: boolean;
  tokenMasked: string | null;
};

type AppAccessInput = {
  appId: string;
  accessToken?: string;
  tokenExpiresAt?: Date | null;
  isDefault?: boolean;
};

const userInclude = {
  appAccess: {
    include: { app: true },
    orderBy: [{ isDefault: "desc" as const }, { app: { name: "asc" as const } }],
  },
  companies: {
    include: { company: { select: { id: true, name: true } } },
    orderBy: { company: { name: "asc" as const } },
  },
};

function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 8) return "••••••••";
  return `••••••••${t.slice(-4)}`;
}

function toAppAccessPublic(row: {
  appId: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
  isDefault: boolean;
  app: { name: string; metaAppId: string | null };
}): MetaAdsAppAccessPublic {
  return {
    appId: row.appId,
    appName: row.app.name,
    metaAppId: row.app.metaAppId,
    tokenMasked: row.accessToken ? maskToken(row.accessToken) : null,
    hasToken: Boolean(row.accessToken?.trim()),
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    isDefault: row.isDefault,
  };
}

function toPublic(row: {
  id: string;
  companyId: string;
  name: string;
  metaSystemUserId: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  appAccess: Array<{
    appId: string;
    accessToken: string;
    tokenExpiresAt: Date | null;
    isDefault: boolean;
    app: { name: string; metaAppId: string | null };
  }>;
  companies?: Array<{ company: { id: string; name: string } }>;
}): MetaAdsSystemUserPublic {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    metaSystemUserId: row.metaSystemUserId,
    notes: row.notes,
    isActive: row.isActive,
    apps: row.appAccess.map(toAppAccessPublic),
    companies: (row.companies ?? []).map((c) => c.company),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMetaAdsSystemUsers(companyId: string): Promise<MetaAdsSystemUserPublic[]> {
  const rows = await prisma.metaAdsSystemUser.findMany({
    where: { companies: { some: { companyId } } },
    include: userInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(toPublic);
}

export async function getMetaAdsSystemUser(
  companyId: string,
  id: string,
): Promise<MetaAdsSystemUserPublic | null> {
  const row = await prisma.metaAdsSystemUser.findFirst({
    where: { id, companies: { some: { companyId } } },
    include: userInclude,
  });
  return row ? toPublic(row) : null;
}

export async function getMetaAdsSystemUserAppToken(
  companyId: string,
  systemUserId: string,
  appId: string,
): Promise<string | null> {
  const row = await prisma.metaAdsSystemUserAppAccess.findFirst({
    where: {
      systemUserId,
      appId,
      systemUser: { isActive: true, companies: { some: { companyId } } },
      app: { isActive: true },
    },
    select: { accessToken: true },
  });
  const t = row?.accessToken?.trim();
  return t || null;
}

export async function resolveDefaultMetaAdsAccessToken(companyId: string): Promise<string | null> {
  const row = await prisma.metaAdsSystemUserAppAccess.findFirst({
    where: {
      isDefault: true,
      systemUser: { isActive: true, companies: { some: { companyId } } },
      app: { isActive: true },
    },
    select: { accessToken: true },
    orderBy: { updatedAt: "desc" },
  });
  const t = row?.accessToken?.trim();
  if (t) return t;

  const any = await prisma.metaAdsSystemUserAppAccess.findFirst({
    where: {
      systemUser: { isActive: true, companies: { some: { companyId } } },
      app: { isActive: true },
    },
    select: { accessToken: true },
    orderBy: { updatedAt: "desc" },
  });
  return any?.accessToken?.trim() || null;
}

export async function listMetaAdsSystemUserOptions(
  companyId: string,
  appId?: string | null,
): Promise<MetaAdsSystemUserOption[]> {
  const rows = await prisma.metaAdsSystemUserAppAccess.findMany({
    where: {
      systemUser: { isActive: true, companies: { some: { companyId } } },
      app: { isActive: true, ...(appId?.trim() ? { id: appId.trim() } : {}) },
    },
    include: { systemUser: true },
    orderBy: [{ isDefault: "desc" }, { systemUser: { name: "asc" } }],
  });

  const seen = new Set<string>();
  const options: MetaAdsSystemUserOption[] = [];
  for (const row of rows) {
    if (!row.accessToken?.trim() || seen.has(row.systemUserId)) continue;
    seen.add(row.systemUserId);
    options.push({
      id: row.systemUserId,
      name: row.systemUser.name,
      metaSystemUserId: row.systemUser.metaSystemUserId,
      isDefault: row.isDefault,
      tokenMasked: maskToken(row.accessToken),
    });
  }
  return options;
}

async function clearOtherDefaults(companyId: string, exceptAccessId?: string): Promise<void> {
  await prisma.metaAdsSystemUserAppAccess.updateMany({
    where: {
      systemUser: { companyId },
      ...(exceptAccessId ? { id: { not: exceptAccessId } } : {}),
    },
    data: { isDefault: false },
  });
}

async function syncAppAccess(
  companyId: string,
  systemUserId: string,
  appAccess: AppAccessInput[],
): Promise<void> {
  const existing = await prisma.metaAdsSystemUserAppAccess.findMany({
    where: { systemUserId },
    select: { id: true, appId: true, accessToken: true },
  });
  const incomingAppIds = new Set(appAccess.map((a) => a.appId));

  const toDelete = existing.filter((e) => !incomingAppIds.has(e.appId));
  if (toDelete.length > 0) {
    await prisma.metaAdsSystemUserAppAccess.deleteMany({
      where: { id: { in: toDelete.map((e) => e.id) } },
    });
  }

  let defaultAccessId: string | undefined;

  for (const item of appAccess) {
    const app = await prisma.metaAdsApp.findUnique({ where: { id: item.appId } });
    if (!app) throw new Error(`App Meta no encontrada: ${item.appId}`);

    const prev = existing.find((e) => e.appId === item.appId);
    const token = item.accessToken?.trim() || prev?.accessToken?.trim();
    if (!token) throw new Error(`Token obligatorio para la app «${app.name}».`);

    const saved = await prisma.metaAdsSystemUserAppAccess.upsert({
      where: { systemUserId_appId: { systemUserId, appId: item.appId } },
      create: {
        systemUserId,
        appId: item.appId,
        accessToken: token,
        tokenExpiresAt: item.tokenExpiresAt ?? null,
        isDefault: item.isDefault ?? false,
      },
      update: {
        ...(item.accessToken?.trim() ? { accessToken: item.accessToken.trim() } : {}),
        ...(item.tokenExpiresAt !== undefined ? { tokenExpiresAt: item.tokenExpiresAt } : {}),
        ...(item.isDefault !== undefined ? { isDefault: item.isDefault } : {}),
      },
    });

    if (item.isDefault) defaultAccessId = saved.id;
  }

  if (defaultAccessId) {
    await clearOtherDefaults(companyId, defaultAccessId);
  }
}

export async function createMetaAdsSystemUser(input: {
  companyId: string;
  name: string;
  metaSystemUserId?: string | null;
  notes?: string | null;
  isActive?: boolean;
  appAccess: AppAccessInput[];
}): Promise<MetaAdsSystemUserPublic> {
  if (!input.appAccess.length) throw new Error("Asigna al menos una app con token.");

  const row = await prisma.metaAdsSystemUser.create({
    data: {
      companyId: input.companyId,
      name: input.name.trim(),
      metaSystemUserId: input.metaSystemUserId?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });

  // Sin esta fila el usuario recien creado no seria visible ni para quien lo creo.
  await prisma.metaAdsSystemUserCompany.create({
    data: { systemUserId: row.id, companyId: input.companyId },
  });

  await syncAppAccess(input.companyId, row.id, input.appAccess);

  const full = await getMetaAdsSystemUser(input.companyId, row.id);
  return full!;
}

export async function updateMetaAdsSystemUser(
  companyId: string,
  id: string,
  input: {
    name?: string;
    metaSystemUserId?: string | null;
    notes?: string | null;
    isActive?: boolean;
    appAccess?: AppAccessInput[];
  },
): Promise<MetaAdsSystemUserPublic | null> {
  const existing = await prisma.metaAdsSystemUser.findFirst({
    where: { id, companies: { some: { companyId } } },
  });
  if (!existing) return null;

  await prisma.metaAdsSystemUser.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.metaSystemUserId !== undefined
        ? { metaSystemUserId: input.metaSystemUserId?.trim() || null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  if (input.appAccess !== undefined) {
    await syncAppAccess(companyId, id, input.appAccess);
  }

  return getMetaAdsSystemUser(companyId, id);
}

export async function deleteMetaAdsSystemUser(companyId: string, id: string): Promise<boolean> {
  const r = await prisma.metaAdsSystemUser.deleteMany({
    where: { id, companies: { some: { companyId } } },
  });
  return r.count > 0;
}

/**
 * Sustituye por completo las empresas que pueden usar un usuario de Meta.
 *
 * Va en transacción: si se borrasen las viejas y fallase la inserción, el usuario
 * quedaría sin ninguna empresa y sus tokens dejarían de resolverse para todo el mundo.
 *
 * Quien llama debe tener acceso al usuario; las empresas destino se validan aquí.
 */
export async function replaceMetaAdsSystemUserCompanies(
  systemUserId: string,
  companyIds: string[],
): Promise<{ ok: true; companies: { id: string; name: string }[] } | { ok: false; message: string }> {
  const pedidas = [...new Set(companyIds.filter((c) => typeof c === "string" && c.trim() !== ""))];
  if (pedidas.length === 0) {
    return { ok: false, message: "Elige al menos una empresa; si no, nadie podría usarlo." };
  }

  const validas = await prisma.company.findMany({
    where: { id: { in: pedidas } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (validas.length !== pedidas.length) {
    return { ok: false, message: "Alguna de las empresas elegidas no existe." };
  }

  await prisma.$transaction([
    prisma.metaAdsSystemUserCompany.deleteMany({
      where: { systemUserId, companyId: { notIn: validas.map((c) => c.id) } },
    }),
    ...validas.map((c) =>
      prisma.metaAdsSystemUserCompany.upsert({
        where: { systemUserId_companyId: { systemUserId, companyId: c.id } },
        create: { systemUserId, companyId: c.id },
        update: {},
      }),
    ),
  ]);

  return { ok: true, companies: validas };
}
