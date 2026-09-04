/**
 * Rescate de acceso: da membresía a una empresa o restablece una contraseña.
 *
 * Existe porque el dashboard no tiene ninguna ruta para restablecer contraseñas, y las
 * rutas de administración exigen que quien llama sea ADMIN **de esa misma empresa**. Si
 * el único administrador de una empresa pierde el acceso, desde la aplicación no hay
 * forma de entrar.
 *
 * Se ejecuta a mano en el servidor, con acceso a la base. A propósito NO se expone por
 * HTTP: abrir esto en la API significaría que el administrador de cualquier empresa
 * puede tocar cualquier otra, que es justo la frontera que separa a un cliente de otro.
 *
 * Uso (desde back/):
 *   node scripts/admin-rescate.mjs --list
 *   node scripts/admin-rescate.mjs --grant --user correo@x.com --company <id|slug> --role ADMIN
 *   node scripts/admin-rescate.mjs --reset-password --user correo@x.com
 *
 * Nada escribe sin `--confirm`. Sin esa bandera solo te dice lo que haría.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const tiene = (n) => process.argv.includes(`--${n}`);
const confirmar = tiene("confirm");

function salir(msg) {
  console.error("\n  " + msg + "\n");
  process.exit(1);
}

/** Acepta correo, usuario o id: lo que tengas a mano cuando hay una urgencia. */
async function buscarUsuario(clave) {
  const u = await prisma.user.findFirst({
    where: { OR: [{ email: clave }, { username: clave }, { id: clave }] },
    select: { id: true, email: true, username: true, fullName: true },
  });
  if (!u) salir(`No hay ningún usuario con correo, usuario o id "${clave}".`);
  return u;
}

async function buscarEmpresa(clave) {
  const c = await prisma.company.findFirst({
    where: { OR: [{ id: clave }, { slug: clave }, { name: clave }] },
    select: { id: true, name: true, slug: true },
  });
  if (!c) salir(`No hay ninguna empresa con id, slug o nombre "${clave}".`);
  return c;
}

async function listar() {
  const empresas = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      memberships: {
        select: {
          role: true,
          user: { select: { email: true, username: true, fullName: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  for (const e of empresas) {
    console.log(`\n${e.name}  (slug: ${e.slug}${e.isActive ? "" : ", INACTIVA"})`);
    console.log(`  id: ${e.id}`);
    const admins = e.memberships.filter((m) => m.role === "ADMIN");
    if (admins.length === 0) {
      console.log("  SIN ADMINISTRADORES  <-- nadie puede gestionarla desde la aplicación");
    }
    for (const m of e.memberships) {
      const quien = m.user.email + (m.user.username ? ` (${m.user.username})` : "");
      console.log(`  ${m.role.padEnd(9)} ${quien}`);
    }
  }
  console.log("");
}

async function otorgar() {
  const rolPedido = String(arg("role") ?? "ADMIN").toUpperCase();
  if (!["ADMIN", "OPERADOR", "LECTOR"].includes(rolPedido)) {
    salir(`Rol "${rolPedido}" no válido. Usa ADMIN, OPERADOR o LECTOR.`);
  }

  const usuario = await buscarUsuario(String(arg("user")));
  const empresa = await buscarEmpresa(String(arg("company")));

  const actual = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: usuario.id, companyId: empresa.id } },
    select: { role: true },
  });

  console.log(`\n  Usuario: ${usuario.fullName} <${usuario.email}>`);
  console.log(`  Empresa: ${empresa.name}`);
  console.log(`  Ahora:   ${actual ? actual.role : "sin membresía"}`);
  console.log(`  Quedará: ${rolPedido}`);

  if (!confirmar) {
    console.log("\n  Simulación. Añade --confirm para aplicarlo.\n");
    return;
  }

  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: usuario.id, companyId: empresa.id } },
    // El JSON de permisos se deja intacto: un ADMIN no lo usa, y si mañana se le baja
    // a OPERADOR conviene que recupere lo que tenía en vez de quedarse en blanco.
    update: { role: rolPedido },
    create: { userId: usuario.id, companyId: empresa.id, role: rolPedido },
  });

  console.log("\n  Hecho. Tiene que cerrar sesión y volver a entrar para que el token recoja el rol.\n");
}

async function restablecer() {
  const usuario = await buscarUsuario(String(arg("user")));

  console.log(`\n  Usuario: ${usuario.fullName} <${usuario.email}>`);

  if (!confirmar) {
    console.log("  Se le generará una contraseña nueva al azar.");
    console.log("\n  Simulación. Añade --confirm para aplicarlo.\n");
    return;
  }

  // Se genera aquí y se imprime una sola vez: no queda escrita en ningún archivo.
  const nueva = randomBytes(9).toString("base64url");
  await prisma.user.update({
    where: { id: usuario.id },
    data: { passwordHash: await bcrypt.hash(nueva, 10) },
  });

  console.log(`\n  Contraseña temporal: ${nueva}`);
  console.log("  Pásasela por un canal privado y que la cambie al entrar.\n");
}

async function main() {
  if (tiene("list")) return listar();
  if (tiene("grant")) {
    if (!arg("user") || !arg("company")) salir("Faltan --user y --company.");
    return otorgar();
  }
  if (tiene("reset-password")) {
    if (!arg("user")) salir("Falta --user.");
    return restablecer();
  }
  console.log(`
  Rescate de acceso. Órdenes:

    --list
        Empresas, sus miembros y cuáles se quedaron sin administrador.

    --grant --user <correo|usuario|id> --company <id|slug|nombre> [--role ADMIN]
        Crea o cambia la membresía. Por defecto ADMIN.

    --reset-password --user <correo|usuario|id>
        Genera una contraseña nueva al azar y la imprime una sola vez.

  Ninguna escribe sin --confirm.
`);
}

main()
  .catch((e) => {
    console.error("\n  Error:", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
