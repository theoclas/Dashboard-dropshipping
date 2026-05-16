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
