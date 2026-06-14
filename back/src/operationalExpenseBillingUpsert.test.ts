import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const upsertSrc = readFileSync(join(here, "operationalExpenseBillingUpsert.ts"), "utf8");

test("upsertOperationalExpenseFromBilling — update no incluye pagado", () => {
  const updateBlock = upsertSrc.match(/if \(existing\) \{[\s\S]*?return \{ accountCreated, created: false, updated: true \}/);
  assert.ok(updateBlock, "bloque update");
  const dataBlock = updateBlock[0].match(/data:\s*\{([\s\S]*?)\},/);
  assert.ok(dataBlock, "data del update");
  assert.ok(!/\bpagado\b/.test(dataBlock[1]), "data del update no debe incluir pagado");
});

test("upsertOperationalExpenseFromBilling — create inicia pagado en false", () => {
  const createBlock = upsertSrc.match(/operationalExpense\.create\(\{[\s\S]*?return \{ accountCreated, created: true/);
  assert.ok(createBlock, "bloque create");
  assert.ok(createBlock[0].includes("pagado: false"), "nuevos gastos empiezan sin pagar");
});
