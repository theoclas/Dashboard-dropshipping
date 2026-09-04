import { prisma } from "./prisma";

export type MetaAdsAppPublic = {
  id: string;
  name: string;
  metaAppId: string | null;
  notes: string | null;
  isActive: boolean;
  /** Empresas que pueden usar esta app. */
  companies: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
};

function toPublic(row: {
  id: string;
  name: string;
  metaAppId: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  companies?: Array<{ company: { id: string; name: string } }>;
}): MetaAdsAppPublic {
  return {
    id: row.id,
    name: row.name,
    metaAppId: row.metaAppId,
    notes: row.notes,
    isActive: row.isActive,
    companies: (row.companies ?? []).map((c) => c.company),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const appInclude = {
  companies: {
    include: { company: { select: { id: true, name: true } } },
    orderBy: { company: { name: "asc" as const } },
  },
};

export async function listMetaAdsApps(companyId: string): Promise<MetaAdsAppPublic[]> {
  const rows = await prisma.metaAdsApp.findMany({
    where: { companies: { some: { companyId } } },
    include: appInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(toPublic);
}

export async function listActiveMetaAdsAppOptions(companyId: string): Promise<MetaAdsAppPublic[]> {
  const rows = await prisma.metaAdsApp.findMany({
    where: { isActive: true, companies: { some: { companyId } } },
    include: appInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(toPublic);
}

export async function getMetaAdsApp(
  companyId: string,
  id: string,
): Promise<MetaAdsAppPublic | null> {
  const row = await prisma.metaAdsApp.findFirst({
    where: { id, companies: { some: { companyId } } },
    include: appInclude,
  });
  return row ? toPublic(row) : null;
}

/**
 * Sustituye por completo las empresas que pueden usar una app.
 *
 * En transacción: si se borrasen las viejas y fallase la inserción, la app quedaría sin
 * empresas y desaparecería de todos los selectores a la vez.
 */
export async function replaceMetaAdsAppCompanies(
  appId: string,
  companyIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const pedidas = [...new Set(companyIds.filter((c) => typeof c === "string" && c.trim() !== ""))];
  if (pedidas.length === 0) {
    return { ok: false, message: "Elige al menos una empresa; si no, nadie podría usar la app." };
  }

  const validas = await prisma.company.findMany({
    where: { id: { in: pedidas } },
    select: { id: true },
  });
  if (validas.length !== pedidas.length) {
    return { ok: false, message: "Alguna de las empresas elegidas no existe." };
  }

  await prisma.$transaction([
    prisma.metaAdsAppCompany.deleteMany({
      where: { appId, companyId: { notIn: validas.map((c) => c.id) } },
    }),
    ...validas.map((c) =>
      prisma.metaAdsAppCompany.upsert({
        where: { appId_companyId: { appId, companyId: c.id } },
        create: { appId, companyId: c.id },
        update: {},
      }),
    ),
  ]);

  return { ok: true };
}

export async function createMetaAdsApp(input: {
  /** Empresa que la crea; queda asignada a ella para que sea visible desde el principio. */
  companyId: string;
  name: string;
  metaAppId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}): Promise<MetaAdsAppPublic> {
  const name = input.name.trim();
  if (!name) throw new Error("El nombre de la app es obligatorio.");

  const row = await prisma.metaAdsApp.create({
    data: {
      name,
      metaAppId: input.metaAppId?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: input.isActive ?? true,
      companies: { create: { companyId: input.companyId } },
    },
    include: appInclude,
  });

  return toPublic(row);
}

export async function updateMetaAdsApp(
  companyId: string,
  id: string,
  input: {
    name?: string;
    metaAppId?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
): Promise<MetaAdsAppPublic | null> {
  const existing = await prisma.metaAdsApp.findFirst({
    where: { id, companies: { some: { companyId } } },
  });
  if (!existing) return null;

  const row = await prisma.metaAdsApp.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.metaAppId !== undefined ? { metaAppId: input.metaAppId?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: appInclude,
  });

  return toPublic(row);
}

export async function deleteMetaAdsApp(companyId: string, id: string): Promise<boolean> {
  const r = await prisma.metaAdsApp.deleteMany({
    where: { id, companies: { some: { companyId } } },
  });
  return r.count > 0;
}
