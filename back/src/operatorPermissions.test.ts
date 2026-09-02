import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import { mergeOperatorPermissions } from "./operatorPermissions";
import { requirePermission } from "./middleware";
import type { JwtPayload } from "./types";

test("mergeOperatorPermissions respeta moduleDashboard en false", () => {
  const perms = mergeOperatorPermissions(Role.OPERADOR, { moduleDashboard: false });
  assert.equal(perms.moduleDashboard, false);
  assert.equal(perms.modulePedidos, true);
});

test("mergeOperatorPermissions LECTOR con override desactiva módulos", () => {
  const perms = mergeOperatorPermissions(Role.LECTOR, {
    moduleDashboard: false,
    moduleReportes: false,
  });
  assert.equal(perms.moduleDashboard, false);
  assert.equal(perms.moduleReportes, false);
  assert.equal(perms.modulePedidos, true);
});

test("mergeOperatorPermissions — salidas cartera hereda importar si no está en JSON legacy", () => {
  const on = mergeOperatorPermissions(Role.LECTOR, { moduleImportaciones: true });
  assert.equal(on.moduleSalidasCartera, true);
  const off = mergeOperatorPermissions(Role.LECTOR, { moduleImportaciones: false });
  assert.equal(off.moduleSalidasCartera, false);
  const explicit = mergeOperatorPermissions(Role.LECTOR, {
    moduleImportaciones: true,
    moduleSalidasCartera: false,
  });
  assert.equal(explicit.moduleSalidasCartera, false);
});

test("requirePermission rechaza sin permiso en JWT", () => {
  const mw = requirePermission("moduleDashboard");
  const req = {
    user: {
      userId: "u1",
      username: "op",
      email: "op@test.com",
      companyId: "c1",
      role: Role.OPERADOR,
      operatorPerms: mergeOperatorPermissions(Role.OPERADOR, { moduleDashboard: false }),
    } satisfies JwtPayload,
  };
  let status = 0;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  let called = false;
  mw(req as never, res as never, () => {
    called = true;
  });
  assert.equal(status, 403);
  assert.equal(called, false);
});

test("requirePermission permite ADMIN sin operatorPerms", () => {
  const mw = requirePermission("moduleDashboard");
  const req = {
    user: {
      userId: "u1",
      username: "admin",
      email: "a@test.com",
      companyId: "c1",
      role: Role.ADMIN,
    } satisfies JwtPayload,
  };
  let called = false;
  mw(req as never, { status: () => ({ json: () => ({}) }) } as never, () => {
    called = true;
  });
  assert.equal(called, true);
});

test("mergeOperatorPermissions — import unificado hereda si no está en el JSON", () => {
  // Un JSON viejo (sin las claves nuevas) no debe regalar acceso al módulo nuevo.
  const heredaOff = mergeOperatorPermissions(Role.LECTOR, {
    moduleCampanasMeta: false,
    actionImportarAdvertisingCampaigns: false,
  });
  assert.equal(heredaOff.moduleImportUnificado, false);
  assert.equal(heredaOff.actionImportUnificadoApi, false);
  assert.equal(heredaOff.actionImportUnificadoArchivo, false);

  const heredaOn = mergeOperatorPermissions(Role.OPERADOR, {});
  assert.equal(heredaOn.moduleImportUnificado, true);
  assert.equal(heredaOn.actionImportUnificadoApi, true);
  assert.equal(heredaOn.actionImportUnificadoArchivo, true);
});

test("mergeOperatorPermissions — el override explícito gana sobre la herencia", () => {
  // El caso que pidió Fernando: quitar solo el import por archivo, dejando el de API.
  const soloApi = mergeOperatorPermissions(Role.OPERADOR, {
    actionImportUnificadoArchivo: false,
  });
  assert.equal(soloApi.actionImportUnificadoArchivo, false);
  assert.equal(soloApi.actionImportUnificadoApi, true);
  assert.equal(soloApi.moduleImportUnificado, true);

  // Y al revés: activar el módulo nuevo aunque Campañas Meta esté apagado.
  const soloUnificado = mergeOperatorPermissions(Role.LECTOR, {
    moduleCampanasMeta: false,
    moduleImportUnificado: true,
  });
  assert.equal(soloUnificado.moduleCampanasMeta, false);
  assert.equal(soloUnificado.moduleImportUnificado, true);
});

test("mergeOperatorPermissions — actionImportUnificadoApi hereda de la cadena de Anuncios", () => {
  // actionImportarAnuncios hereda a su vez de actionImportarAdvertisingCampaigns:
  // la cadena completa tiene que resolverse antes de que la lea el import unificado.
  const perms = mergeOperatorPermissions(Role.LECTOR, {
    actionImportarAdvertisingCampaigns: true,
  });
  assert.equal(perms.actionImportarAnuncios, true);
  assert.equal(perms.actionImportUnificadoApi, true);
});

test("mergeOperatorPermissions — denegar Anuncios tambien cierra el import unificado", () => {
  // El modulo nuevo hace el trabajo de los dos, asi que heredar solo de Campanas Meta
  // habria sido una puerta de atras para quien tuviera Anuncios denegado a proposito.
  const sinAnuncios = mergeOperatorPermissions(Role.LECTOR, { moduleAnuncios: false });
  assert.equal(sinAnuncios.moduleCampanasMeta, true);
  assert.equal(sinAnuncios.moduleAnuncios, false);
  assert.equal(sinAnuncios.moduleImportUnificado, false);

  const sinCampanas = mergeOperatorPermissions(Role.LECTOR, { moduleCampanasMeta: false });
  assert.equal(sinCampanas.moduleImportUnificado, false);

  // Y con los dos activos, se abre.
  const conAmbos = mergeOperatorPermissions(Role.LECTOR, {});
  assert.equal(conAmbos.moduleImportUnificado, true);
});
