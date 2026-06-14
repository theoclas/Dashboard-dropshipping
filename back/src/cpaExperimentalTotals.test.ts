import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCpaExperimentalTotals } from "./cpaExperimentalTotals";

test("computeCpaExperimentalTotals — CPA = gasto total / ventas totales", () => {
  const totals = computeCpaExperimentalTotals([
    { gastoPublicidad: 1000, ventas: 2 },
    { gastoPublicidad: 500, ventas: 3 },
  ]);
  assert.ok(totals);
  assert.equal(totals.gastoPublicidad, 1500);
  assert.equal(totals.ventas, 5);
  assert.equal(totals.cpa, 300);
});

test("computeCpaExperimentalTotals — sin ventas devuelve CPA null", () => {
  const totals = computeCpaExperimentalTotals([{ gastoPublicidad: 200, ventas: 0 }]);
  assert.ok(totals);
  assert.equal(totals.cpa, null);
});

test("computeCpaExperimentalTotals — sin filas devuelve null", () => {
  assert.equal(computeCpaExperimentalTotals([]), null);
});
