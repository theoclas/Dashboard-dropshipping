import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";

function hashWipeSecret(plain: string): Buffer {
  return crypto.createHash("sha256").update(plain, "utf8").digest();
}

export function assertWipePassword(password: string): void {
  const configured = process.env.IMPORT_WIPE_SECRET?.trim();
  if (!configured) {
    throw new Error("Limpieza deshabilitada: define IMPORT_WIPE_SECRET en el servidor.");
  }
  const a = hashWipeSecret(password);
  const b = hashWipeSecret(configured);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Contraseña incorrecta");
  }
}

export async function wipeImportedForCompany(
  prisma: PrismaClient,
  companyId: string,
  password: string,
): Promise<{
  deleted: { productos_detalle: number; cartera_movimientos: number; pedidos: number };
}> {
  assertWipePassword(password);

  return prisma.$transaction(async (tx) => {
    const nPd = await tx.productDetail.count({ where: { companyId } });
    const nCar = await tx.walletMovement.count({ where: { companyId } });
    const nPe = await tx.order.count({ where: { companyId } });

    await tx.productDetail.deleteMany({ where: { companyId } });
    await tx.walletMovement.deleteMany({ where: { companyId } });
    await tx.order.deleteMany({ where: { companyId } });

    return {
      deleted: {
        productos_detalle: nPd,
        cartera_movimientos: nCar,
        pedidos: nPe,
      },
    };
  });
}

export async function wipeCpaForCompany(
  prisma: PrismaClient,
  companyId: string,
  password: string,
): Promise<{ deleted: number }> {
  assertWipePassword(password);
  const r = await prisma.cpaRecord.deleteMany({ where: { companyId } });
  return { deleted: r.count };
}
