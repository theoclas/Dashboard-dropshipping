import test from "node:test";
import assert from "node:assert/strict";
import { assertWipePassword } from "./wipeImported";

test("assertWipePassword rechaza si no hay IMPORT_WIPE_SECRET", () => {
  const prev = process.env.IMPORT_WIPE_SECRET;
  delete process.env.IMPORT_WIPE_SECRET;
  assert.throws(() => assertWipePassword("x"), /deshabilitada|IMPORT_WIPE_SECRET/);
  process.env.IMPORT_WIPE_SECRET = prev;
});

test("assertWipePassword acepta contraseña correcta (timing-safe)", () => {
  process.env.IMPORT_WIPE_SECRET = "demo-wipe-local";
  assert.doesNotThrow(() => assertWipePassword("demo-wipe-local"));
});

test("assertWipePassword rechaza contraseña incorrecta", () => {
  process.env.IMPORT_WIPE_SECRET = "demo-wipe-local";
  assert.throws(() => assertWipePassword("wrong"), /incorrecta/);
});
