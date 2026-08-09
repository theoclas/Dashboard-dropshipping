import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateVerdict } from "./adAnalyticsService";

const CPA_OBJETIVO = 20000;

function row(over: Partial<Parameters<typeof evaluateVerdict>[0]> = {}) {
  return {
    spend: 0,
    conversations: 0,
    purchases: 0,
    ctr: null as number | null,
    costPerPurchase: null as number | null,
    ...over,
  };
}

test("sin CPA objetivo no se emite veredicto", () => {
  assert.equal(evaluateVerdict(row({ spend: 999999 }), null, null), null);
  assert.equal(evaluateVerdict(row({ spend: 999999 }), 0, null), null);
});

test("gasto bajo el umbral: dejar correr aunque no haya nada todavía", () => {
  const v = evaluateVerdict(row({ spend: CPA_OBJETIVO * 0.4 }), CPA_OBJETIVO, null);
  assert.equal(v?.code, "SIN_SEÑAL");
  assert.equal(v?.action, "dejar_correr");
});

test("pasó 1 CPA objetivo sin una sola conversación: matar", () => {
  const v = evaluateVerdict(row({ spend: CPA_OBJETIVO * 1.2 }), CPA_OBJETIVO, null);
  assert.equal(v?.code, "SIN_CONVERSACION");
  assert.equal(v?.action, "matar");
});

test("hay conversaciones pero ninguna compra tras 2,5 CPA: matar", () => {
  const v = evaluateVerdict(
    row({ spend: CPA_OBJETIVO * 3, conversations: 15 }),
    CPA_OBJETIVO,
    null,
  );
  assert.equal(v?.code, "SIN_VENTA");
  assert.equal(v?.action, "matar");
});

test("con conversaciones y gasto intermedio no se mata todavía", () => {
  const v = evaluateVerdict(
    row({ spend: CPA_OBJETIVO * 1.5, conversations: 8 }),
    CPA_OBJETIVO,
    null,
  );
  assert.equal(v?.code, "OK");
  assert.equal(v?.action, "ok");
});

test("CTR por debajo de la mitad de la mediana manda matar antes que cualquier otra regla", () => {
  // Gasto altísimo y con ventas, pero el creativo no engancha frente a sus hermanos.
  const v = evaluateVerdict(
    row({ spend: CPA_OBJETIVO * 5, conversations: 30, purchases: 6, ctr: 0.4, costPerPurchase: 16000 }),
    CPA_OBJETIVO,
    2.0,
  );
  assert.equal(v?.code, "CTR_BAJO");
  assert.equal(v?.action, "matar");
});

test("CTR bajo pero sin hermanos con qué comparar no dispara la regla", () => {
  const v = evaluateVerdict(
    row({ spend: CPA_OBJETIVO * 2, conversations: 10, purchases: 3, ctr: 0.4, costPerPurchase: 13333 }),
    CPA_OBJETIVO,
    null,
  );
  assert.equal(v?.code, "OK");
});

test("CPA por encima del objetivo se vigila, no se mata", () => {
  const v = evaluateVerdict(
    row({ spend: CPA_OBJETIVO * 4, conversations: 20, purchases: 2, ctr: 1.8, costPerPurchase: 40000 }),
    CPA_OBJETIVO,
    2.0,
  );
  assert.equal(v?.code, "CPA_ALTO");
  assert.equal(v?.action, "vigilar");
});

test("CPA dentro del objetivo queda OK", () => {
  const v = evaluateVerdict(
    row({ spend: CPA_OBJETIVO * 4, conversations: 25, purchases: 6, ctr: 2.1, costPerPurchase: 13333 }),
    CPA_OBJETIVO,
    2.0,
  );
  assert.equal(v?.code, "OK");
  assert.equal(v?.action, "ok");
});

test("el umbral se mide en gasto acumulado, no en días", () => {
  // Mismo anuncio, dos ritmos de gasto: el que apenas arrancó no se juzga.
  const lento = evaluateVerdict(row({ spend: 5000 }), CPA_OBJETIVO, null);
  const rapido = evaluateVerdict(row({ spend: 50000 }), CPA_OBJETIVO, null);
  assert.equal(lento?.action, "dejar_correr");
  assert.equal(rapido?.action, "matar");
});
