import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkRange, UNIFIED_CHUNK_DAYS } from "./unifiedImportService";

test("un rango corto cabe en un solo tramo", () => {
  assert.deepEqual(chunkRange("2026-08-01", "2026-08-10"), [
    { desde: "2026-08-01", hasta: "2026-08-10" },
  ]);
});

test("un rango de exactamente el tope no se parte", () => {
  const r = chunkRange("2026-08-01", "2026-08-31");
  assert.equal(UNIFIED_CHUNK_DAYS, 31);
  assert.deepEqual(r, [{ desde: "2026-08-01", hasta: "2026-08-31" }]);
});

test("un rango largo se parte en tramos contiguos, sin huecos ni solapes", () => {
  const r = chunkRange("2026-06-01", "2026-08-31");

  assert.deepEqual(r, [
    { desde: "2026-06-01", hasta: "2026-07-01" },
    { desde: "2026-07-02", hasta: "2026-08-01" },
    { desde: "2026-08-02", hasta: "2026-08-31" },
  ]);

  // El día siguiente al fin de un tramo es el inicio del siguiente: ni se repite un día
  // (se contaría el gasto dos veces) ni se salta (faltaría gasto).
  for (let i = 1; i < r.length; i++) {
    const finAnterior = Date.parse(`${r[i - 1].hasta}T00:00:00Z`);
    const inicio = Date.parse(`${r[i].desde}T00:00:00Z`);
    assert.equal(inicio - finAnterior, 86_400_000);
  }
});

test("un solo día devuelve un tramo de un día", () => {
  assert.deepEqual(chunkRange("2026-08-10", "2026-08-10"), [
    { desde: "2026-08-10", hasta: "2026-08-10" },
  ]);
});

test("las fechas al revés se ordenan solas", () => {
  assert.deepEqual(chunkRange("2026-08-10", "2026-08-01"), [
    { desde: "2026-08-01", hasta: "2026-08-10" },
  ]);
});

test("el troceo cubre exactamente los mismos días que el rango original", () => {
  const r = chunkRange("2026-01-01", "2026-04-15");
  const dias = r.reduce((n, t) => {
    const d0 = Date.parse(`${t.desde}T00:00:00Z`);
    const d1 = Date.parse(`${t.hasta}T00:00:00Z`);
    return n + (d1 - d0) / 86_400_000 + 1;
  }, 0);

  const total =
    (Date.parse("2026-04-15T00:00:00Z") - Date.parse("2026-01-01T00:00:00Z")) / 86_400_000 + 1;
  assert.equal(dias, total);
});

test("el troceo cruza bien el cambio de mes y de año", () => {
  const r = chunkRange("2025-12-20", "2026-01-25", 10);
  assert.equal(r[0].desde, "2025-12-20");
  assert.equal(r[r.length - 1].hasta, "2026-01-25");
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i].desde > r[i - 1].hasta);
  }
});
