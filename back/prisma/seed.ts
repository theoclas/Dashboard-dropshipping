import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

/** Demo local: empresa FersuaStore + admin (login por nombre de usuario). */
async function main() {
  const companyName = "FersuaStore";
  const companySlug = "fersuastore";
  const email = "Fernando.pala.99@fersuastudio.com";
  const username = "fercho";
  const fullName = "Fercho";
  const password = "Fer1026*";

  let company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    company = await prisma.company.create({
      data: { name: companyName, slug: companySlug },
    });
    console.log("Empresa creada:", company.name, `(${company.id})`);
  } else {
    console.log("Empresa ya existía:", company.name, `(${company.id})`);
  }

  const hash = await bcrypt.hash(password, 10);

  const byUsername = await prisma.user.findUnique({ where: { username } });
  const byOldEmail = await prisma.user.findUnique({ where: { email: "fercho@fersuastore.local" } });
  const byNewEmail = await prisma.user.findUnique({ where: { email } });

  let user = byUsername ?? byNewEmail ?? byOldEmail;

  if (!user) {
    user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: hash,
        fullName,
        activeCompany: company.id,
      },
    });
    await prisma.userCompany.create({
      data: { userId: user.id, companyId: company.id, role: Role.ADMIN },
    });
    console.log("Usuario creado:", username, "|", email);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username,
        email,
        passwordHash: hash,
        fullName,
        activeCompany: company.id,
      },
    });
    const membership = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: user.id, companyId: company.id } },
    });
    if (!membership) {
      await prisma.userCompany.create({
        data: { userId: user.id, companyId: company.id, role: Role.ADMIN },
      });
    }
    console.log("Usuario actualizado:", username, "|", email);
  }

  console.log("\n--- Login en el panel ---");
  console.log("Usuario:  ", username, "(sin distinguir mayúsculas)");
  console.log("Password: ", password);
  console.log("Email (contacto): ", email);
  console.log("Empresa:  ", companyName);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
