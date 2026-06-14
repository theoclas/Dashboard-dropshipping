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
  name: string;
  metaSystemUserId: string | null;
  notes: string | null;
  isActive: boolean;
  apps: MetaAdsAppAccessPublic[];
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
}): MetaAdsSystemUserPublic {
  return {
    id: row.id,
    name: row.name,
    metaSystemUserId: row.metaSystemUserId,
    notes: row.notes,
    isActive: row.isActive,
    apps: row.appAccess.map(toAppAccessPublic),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMetaAdsSystemUsers(): Promise<MetaAdsSystemUserPublic[]> {
  const rows = await prisma.metaAdsSystemUser.findMany({
    include: userInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(toPublic);
}

export async function getMetaAdsSystemUser(id: string): Promise<MetaAdsSystemUserPublic | null> {
  const row = await prisma.metaAdsSystemUser.findUnique({
    where: { id },
    include: userInclude,
  });
  return row ? toPublic(row) : null;
}

export async function getMetaAdsSystemUserAppToken(
  systemUserId: string,
  appId: string,
): Promise<string | null> {
  const row = await prisma.metaAdsSystemUserAppAccess.findFirst({
    where: {
      systemUserId,
      appId,
      systemUser: { isActive: true },
      app: { isActive: true },
    },
    select: { accessToken: true },
  });
  const t = row?.accessToken?.trim();
  return t || null;
}

export async function resolveDefaultMetaAdsAccessToken(): Promise<string | null> {
  const row = await prisma.metaAdsSystemUserAppAccess.findFirst({
    where: {
      isDefault: true,
      systemUser: { isActive: true },
      app: { isActive: true },
    },
    select: { accessToken: true },
    orderBy: { updatedAt: "desc" },
  });
  const t = row?.accessToken?.trim();
  if (t) return t;

  const any = await prisma.metaAdsSystemUserAppAccess.findFirst({
    where: {
      systemUser: { isActive: true },
      app: { isActive: true },
    },
    select: { accessToken: true },
    orderBy: { updatedAt: "desc" },
  });
  return any?.accessToken?.trim() || null;
}

export async function listMetaAdsSystemUserOptions(appId?: string | null): Promise<MetaAdsSystemUserOption[]> {
  const rows = await prisma.metaAdsSystemUserAppAccess.findMany({
    where: {
      systemUser: { isActive: true },
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

async function clearOtherDefaults(exceptAccessId?: string): Promise<void> {
  await prisma.metaAdsSystemUserAppAccess.updateMany({
    where: exceptAccessId ? { id: { not: exceptAccessId } } : {},
    data: { isDefault: false },
  });
}

async function syncAppAccess(systemUserId: string, appAccess: AppAccessInput[]): Promise<void> {
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
    await clearOtherDefaults(defaultAccessId);
  }
}

export async function createMetaAdsSystemUser(input: {
  name: string;
  metaSystemUserId?: string | null;
  notes?: string | null;
  isActive?: boolean;
  appAccess: AppAccessInput[];
}): Promise<MetaAdsSystemUserPublic> {
  if (!input.appAccess.length) throw new Error("Asigna al menos una app con token.");

  const row = await prisma.metaAdsSystemUser.create({
    data: {
      name: input.name.trim(),
      metaSystemUserId: input.metaSystemUserId?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });

  await syncAppAccess(row.id, input.appAccess);

  const full = await getMetaAdsSystemUser(row.id);
  return full!;
}

export async function updateMetaAdsSystemUser(
  id: string,
  input: {
    name?: string;
    metaSystemUserId?: string | null;
    notes?: string | null;
    isActive?: boolean;
    appAccess?: AppAccessInput[];
  },
): Promise<MetaAdsSystemUserPublic | null> {
  const existing = await prisma.metaAdsSystemUser.findUnique({ where: { id } });
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
    await syncAppAccess(id, input.appAccess);
  }

  return getMetaAdsSystemUser(id);
}

export async function deleteMetaAdsSystemUser(id: string): Promise<boolean> {
  const r = await prisma.metaAdsSystemUser.deleteMany({ where: { id } });
  return r.count > 0;
}
