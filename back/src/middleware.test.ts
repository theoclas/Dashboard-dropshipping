import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { authRequired, configureAuthMiddleware } from "./middleware";
import type { JwtPayload } from "./types";

/**
 * El rol tiene que salir de la membresía viva, no de lo que afirme el token.
 *
 * Los JWT de este sistema duran 8 horas y no hay forma de revocarlos: si `authRequired`
 * se cree el rol del token, degradar o expulsar a alguien no surte efecto hasta que
 * caduque. Con rutas que cambian contraseñas ajenas, esa ventana es una toma de cuentas.
 */

const SECRETO = process.env.JWT_SECRET ?? "change_me";

function token(payload: Partial<JwtPayload>): string {
  return jwt.sign(
    {
      userId: "u1",
      username: "alicia",
      email: "alicia@test.com",
      companyId: "c1",
      role: Role.ADMIN,
      ...payload,
    },
    SECRETO,
    { expiresIn: "8h" },
  );
}

/** Prisma mínimo: solo hace falta `userCompany.findUnique`. */
function prismaFalso(membership: { role: Role; operatorPermissions: unknown } | null) {
  return { userCompany: { findUnique: async () => membership } } as never;
}

function peticion(t: string) {
  return { header: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${t}` : undefined) };
}

function respuesta() {
  const out: { status: number | null; body: unknown } = { status: null, body: null };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(b: unknown) {
      out.body = b;
      return res;
    },
  };
  return { res, out };
}

test("authRequired baja el rol cuando el token dice ADMIN pero la base dice OPERADOR", async () => {
  configureAuthMiddleware(prismaFalso({ role: Role.OPERADOR, operatorPermissions: null }));

  const req = peticion(token({ role: Role.ADMIN }));
  const { res, out } = respuesta();
  let siguiente = false;

  await authRequired(req as never, res as never, () => {
    siguiente = true;
  });

  assert.equal(siguiente, true, "debería dejar pasar la petición");
  assert.equal(out.status, null);
  const user = (req as unknown as { user: JwtPayload }).user;
  assert.equal(user.role, Role.OPERADOR, "el rol tiene que venir de la membresía, no del token");
});

test("authRequired rechaza si la membresía ya no existe", async () => {
  // Antes se conservaba el rol del token, así que un expulsado seguía entrando.
  configureAuthMiddleware(prismaFalso(null));

  const req = peticion(token({ role: Role.ADMIN }));
  const { res, out } = respuesta();
  let siguiente = false;

  await authRequired(req as never, res as never, () => {
    siguiente = true;
  });

  assert.equal(siguiente, false, "no debería continuar");
  assert.equal(out.status, 401);
});

test("authRequired mantiene ADMIN cuando la base lo confirma", async () => {
  configureAuthMiddleware(prismaFalso({ role: Role.ADMIN, operatorPermissions: null }));

  const req = peticion(token({ role: Role.ADMIN }));
  const { res } = respuesta();
  let siguiente = false;

  await authRequired(req as never, res as never, () => {
    siguiente = true;
  });

  assert.equal(siguiente, true);
  assert.equal((req as unknown as { user: JwtPayload }).user.role, Role.ADMIN);
});

test("authRequired sube el rol si la base promovió al usuario", async () => {
  configureAuthMiddleware(prismaFalso({ role: Role.ADMIN, operatorPermissions: null }));

  const req = peticion(token({ role: Role.LECTOR }));
  const { res } = respuesta();
  await authRequired(req as never, res as never, () => {});

  assert.equal((req as unknown as { user: JwtPayload }).user.role, Role.ADMIN);
});
