import { prisma } from "./prisma";

export type MetaAdsAppPublic = {
  id: string;
  name: string;
  metaAppId: string | null;
  notes: string | null;
  isActive: boolean;
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
}): MetaAdsAppPublic {
  return {
    id: row.id,
    name: row.name,
    metaAppId: row.metaAppId,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMetaAdsApps(): Promise<MetaAdsAppPublic[]> {
  const rows = await prisma.metaAdsApp.findMany({ orderBy: { name: "asc" } });
  return rows.map(toPublic);
}

export async function listActiveMetaAdsAppOptions(): Promise<MetaAdsAppPublic[]> {
  const rows = await prisma.metaAdsApp.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toPublic);
}

export async function getMetaAdsApp(id: string): Promise<MetaAdsAppPublic | null> {
  const row = await prisma.metaAdsApp.findUnique({ where: { id } });
  return row ? toPublic(row) : null;
}

export async function createMetaAdsApp(input: {
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
    },
  });

  return toPublic(row);
}

export async function updateMetaAdsApp(
  id: string,
  input: {
    name?: string;
    metaAppId?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
): Promise<MetaAdsAppPublic | null> {
  const existing = await prisma.metaAdsApp.findUnique({ where: { id } });
  if (!existing) return null;

  const row = await prisma.metaAdsApp.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.metaAppId !== undefined ? { metaAppId: input.metaAppId?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  return toPublic(row);
}

export async function deleteMetaAdsApp(id: string): Promise<boolean> {
  const r = await prisma.metaAdsApp.deleteMany({ where: { id } });
  return r.count > 0;
}
