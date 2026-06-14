import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateCpaResumenMetrics,
  buildCpaResumenRows,
  buildCpaResumenTree,
  fechaDisplayDdMmm,
  mesLabelFull,
} from "./cpaResumenService";

const sampleProduct = {
  catalogProductId: "p1",
  producto: "ACEITE TRULY",
  gastoPublicidad: 100,
  conversaciones: 1,
  ventas: 1,
  totalFacturado: 50000,
  gananciaPromedio: 10000,
};

const sampleProduct2 = {
  catalogProductId: "p2",
  producto: "BATANA",
  gastoPublicidad: 200,
  conversaciones: 2,
  ventas: 2,
  totalFacturado: 100000,
  gananciaPromedio: 12000,
};

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

test("buildCpaResumenTree — jerarquía mes, semana, día y producto", () => {
  const tree = buildCpaResumenTree([
    {
      y: 2026,
      m: 3,
      d: 30,
      ymd: "2026-03-30",
      mesLabel: mesLabelFull(3),
      semanaLabel: "SEMANA 4 - MAR",
      fechaLabel: fechaDisplayDdMmm(2026, 3, 30),
      products: [sampleProduct, sampleProduct2],
    },
    {
      y: 2026,
      m: 3,
      d: 31,
      ymd: "2026-03-31",
      mesLabel: mesLabelFull(3),
      semanaLabel: "SEMANA 4 - MAR",
      fechaLabel: fechaDisplayDdMmm(2026, 3, 31),
      products: [{ ...sampleProduct, catalogProductId: "p3", gastoPublicidad: 50 }],
    },
  ]);

  assert.equal(tree.length, 2);
  assert.equal(tree[0]?.kind, "month");
  assert.equal(tree[1]?.kind, "grandTotal");

  const week = tree[0]?.children?.[0];
  assert.equal(week?.kind, "week");
  assert.ok(week?.children?.some((c) => c.kind === "day"));

  const day = week?.children?.find((c) => c.kind === "day");
  assert.ok(day?.children?.some((c) => c.kind === "product" && c.producto === "ACEITE TRULY"));
  assert.ok(week?.children?.some((c) => c.kind === "weekTotal"));

  assert.ok(tree[0]?.children?.some((c) => c.kind === "monthTotal"));
  assert.equal(tree[1]?.gastoPublicidad, 350);
});

test("buildCpaResumenRows — aplanado incluye día, semana, mes y total general", () => {
  const rows = buildCpaResumenRows([
    {
      y: 2026,
      m: 3,
      d: 30,
      ymd: "2026-03-30",
      mesLabel: mesLabelFull(3),
      semanaLabel: "SEMANA 4 - MAR",
      fechaLabel: fechaDisplayDdMmm(2026, 3, 30),
      products: [sampleProduct],
    },
    {
      y: 2026,
      m: 3,
      d: 31,
      ymd: "2026-03-31",
      mesLabel: mesLabelFull(3),
      semanaLabel: "SEMANA 4 - MAR",
      fechaLabel: fechaDisplayDdMmm(2026, 3, 31),
      products: [{ ...sampleProduct2, gastoPublicidad: 200 }],
    },
  ]);
  assert.ok(rows.some((r) => r.kind === "product"));
  assert.ok(rows.some((r) => r.kind === "weekTotal"));
  assert.ok(rows.some((r) => r.kind === "monthTotal"));
  assert.equal(rows[rows.length - 1]?.kind, "grandTotal");
  assert.equal(rows[rows.length - 1]?.gastoPublicidad, 300);
});
