import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateCpaResumenMetrics,
  buildCpaResumenRows,
  fechaDisplayDdMmm,
  mesLabelFull,
} from "./cpaResumenService";

test("aggregateCpaResumenMetrics — CPA = gasto / ventas agregados", () => {
  const m = aggregateCpaResumenMetrics([
    { gastoPublicidad: 1000, conversaciones: 10, ventas: 2, totalFacturado: 100000, gananciaPromedio: 20000 },
    { gastoPublicidad: 500, conversaciones: 5, ventas: 3, totalFacturado: 150000, gananciaPromedio: 25000 },
  ]);
  assert.equal(m.gastoPublicidad, 1500);
  assert.equal(m.ventas, 5);
  assert.equal(m.conversaciones, 15);
  assert.equal(m.cpa, 300);
});

test("buildCpaResumenRows — jerarquía día, semana, mes y total general", () => {
  const rows = buildCpaResumenRows([
    {
      y: 2026,
      m: 3,
      d: 30,
      ymd: "2026-03-30",
      mesLabel: mesLabelFull(3),
      semanaLabel: "SEMANA 4 - MAR",
      fechaLabel: fechaDisplayDdMmm(2026, 3, 30),
      rows: [{ gastoPublicidad: 100, conversaciones: 1, ventas: 1, totalFacturado: 50000, gananciaPromedio: 10000 }],
    },
    {
      y: 2026,
      m: 3,
      d: 31,
      ymd: "2026-03-31",
      mesLabel: mesLabelFull(3),
      semanaLabel: "SEMANA 4 - MAR",
      fechaLabel: fechaDisplayDdMmm(2026, 3, 31),
      rows: [{ gastoPublicidad: 200, conversaciones: 2, ventas: 2, totalFacturado: 100000, gananciaPromedio: 12000 }],
    },
  ]);
  assert.equal(rows[0]?.kind, "day");
  assert.equal(rows[rows.length - 1]?.kind, "grandTotal");
  assert.ok(rows.some((r) => r.kind === "weekTotal"));
  assert.ok(rows.some((r) => r.kind === "monthTotal"));
  assert.equal(rows[rows.length - 1]?.gastoPublicidad, 300);
});
