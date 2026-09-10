import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import { authRequired, configureAuthMiddleware } from "./middleware";
import {
  generateServiceToken,
  hashServiceToken,
  isAgentReadOnlyRequest,
  isServiceToken,
  serviceTokenPermissions,
  shouldRefreshLastUsed,
  SERVICE_TOKEN_PREFIX,
} from "./serviceTokens";

/**
 * Estas credenciales no caducan, así que lo único que las contiene es el alcance.
 *
 * La invariante que estos tests bloquean: **una credencial de servicio solo puede hacer GET
 * a `/api/agent/`**, pase lo que pase con los permisos. Si alguien afloja esa regla, aquí
 * se cae.
 */

// ---------------------------------------------------------------- piezas puras

test("el token generado lleva la marca, es largo y su hash es estable", () => {
  const a = generateServiceToken();
  assert.ok(a.token.startsWith(SERVICE_TOKEN_PREFIX));
  assert.equal(a.token.length, SERVICE_TOKEN_PREFIX.length + 64);
  assert.equal(a.tokenHash, hashServiceToken(a.token));
  assert.equal(a.tokenHash.length, 64);
  assert.ok(a.token.startsWith(a.prefix));

  const b = generateServiceToken();
  assert.notEqual(a.token, b.token, "dos tokens seguidos no pueden coincidir");
});

test("el prefijo guardado no alcanza para reconstruir el token", () => {
  const { token, prefix } = generateServiceToken();
  assert.ok(prefix.length < token.length / 3);
});

test("isServiceToken distingue la credencial de un JWT", () => {
  assert.equal(isServiceToken(generateServiceToken().token), true);
  assert.equal(isServiceToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def"), false);
  assert.equal(isServiceToken(""), false);
});

test("solo GET bajo /api/agent/ pasa el candado", () => {
  // Permitido
  assert.equal(isAgentReadOnlyRequest("GET", "/api/agent/cpa/daily"), true);
  assert.equal(isAgentReadOnlyRequest("get", "/api/agent/context?desde=2026-01-01"), true);
  assert.equal(isAgentReadOnlyRequest("GET", "/api/agent"), true);

  // Método equivocado
  for (const m of ["POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal(isAgentReadOnlyRequest(m, "/api/agent/cpa/daily"), false, `${m} no debería pasar`);
  }

  // Ruta equivocada, incluidas las que se parecen
  for (const p of [
    "/api/orders",
    "/api/users/u1/password",
    "/api/agentes/algo",
    "/api/agent-admin/x",
    "/api/other/api/agent/x",
    "/apiagent/x",
  ]) {
    assert.equal(isAgentReadOnlyRequest("GET", p), false, `${p} no debería pasar`);
  }
});

test("los permisos de servicio no habilitan ninguna acción", () => {
  const perms = serviceTokenPermissions();
  const acciones = Object.keys(perms).filter((k) => k.startsWith("action"));
  assert.ok(acciones.length > 0, "el test no sirve si no hay claves de acción");
  for (const k of acciones) {
    assert.equal(perms[k as keyof typeof perms], false, `${k} debería estar en false`);
  }
  // Y sí habilita los módulos que las rutas del agente exigen.
  for (const k of ["moduleCpa", "moduleAnuncios", "moduleDashboard", "moduleReportes"] as const) {
    assert.equal(perms[k], true, `${k} debería estar en true`);
  }
  // Módulos sensibles que el agente no necesita.
  assert.equal(perms.moduleImportaciones, false);
  assert.equal(perms.modulePedidos, false, "pedidos trae datos personales: fuera");
});

test("lastUsedAt se refresca la primera vez y luego cada 5 minutos", () => {
  const ahora = new Date("2026-09-10T12:00:00Z");
  assert.equal(shouldRefreshLastUsed(null, ahora), true);
  assert.equal(shouldRefreshLastUsed(new Date("2026-09-10T11:59:00Z"), ahora), false);
  assert.equal(shouldRefreshLastUsed(new Date("2026-09-10T11:54:00Z"), ahora), true);
});

// ---------------------------------------------------------------- middleware

type FilaToken = {
  id: string;
  name: string;
  companyId: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

function prismaFalso(fila: FilaToken | null) {
  return {
    serviceToken: {
      findUnique: async () => fila,
      update: async () => fila,
    },
    userCompany: { findUnique: async () => null },
  } as never;
}

function peticion(t: string, method = "GET", url = "/api/agent/cpa/daily") {
  return {
    method,
    originalUrl: url,
    header: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${t}` : undefined),
  };
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

const FILA: FilaToken = {
  id: "st1",
  name: "Agente IA",
  companyId: "c1",
  lastUsedAt: null,
  revokedAt: null,
};

test("una credencial válida entra a /api/agent como LECTOR de su empresa", async () => {
  configureAuthMiddleware(prismaFalso(FILA));
  const { token } = generateServiceToken();
  const req = peticion(token) as never;
  const { res, out } = respuesta();
  let paso = false;

  await authRequired(req, res as never, () => {
    paso = true;
  });

  assert.equal(paso, true, `no pasó: ${JSON.stringify(out)}`);
  const u = (req as { user?: { companyId: string; role: Role; serviceTokenId?: string } }).user;
  assert.equal(u?.companyId, "c1");
  assert.equal(u?.role, Role.LECTOR);
  assert.equal(u?.serviceTokenId, "st1");
});

test("una credencial revocada deja de servir en el acto", async () => {
  configureAuthMiddleware(prismaFalso({ ...FILA, revokedAt: new Date() }));
  const { token } = generateServiceToken();
  const { res, out } = respuesta();
  let paso = false;

  await authRequired(peticion(token) as never, res as never, () => {
    paso = true;
  });

  assert.equal(paso, false);
  assert.equal(out.status, 401);
});

test("una credencial que no existe es 401, no 403", async () => {
  configureAuthMiddleware(prismaFalso(null));
  const { token } = generateServiceToken();
  const { res, out } = respuesta();
  let paso = false;

  await authRequired(peticion(token) as never, res as never, () => {
    paso = true;
  });

  assert.equal(paso, false);
  assert.equal(out.status, 401);
});

test("LA INVARIANTE: una credencial válida NO puede escribir ni salir de /api/agent", async () => {
  const intentos: Array<[string, string]> = [
    ["POST", "/api/agent/cpa/daily"],
    ["DELETE", "/api/agent/context"],
    ["GET", "/api/orders"],
    ["GET", "/api/users/search"],
    ["PATCH", "/api/users/u9/password"],
    ["POST", "/api/import/dropi"],
    ["GET", "/api/service-tokens"],
  ];

  for (const [metodo, ruta] of intentos) {
    configureAuthMiddleware(prismaFalso(FILA));
    const { token } = generateServiceToken();
    const { res, out } = respuesta();
    let paso = false;

    await authRequired(peticion(token, metodo, ruta) as never, res as never, () => {
      paso = true;
    });

    assert.equal(paso, false, `${metodo} ${ruta} NO debería pasar`);
    assert.equal(out.status, 403, `${metodo} ${ruta} debería dar 403`);
  }
});
