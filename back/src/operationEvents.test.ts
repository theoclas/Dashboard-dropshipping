import assert from "node:assert/strict";
import { test } from "node:test";
import { detectarCambios } from "./operationEvents";

const base = { entidad: "ADSET" as const, entidadId: "as1", etiqueta: "1. Conjunto Caliente" };

test("detecta una subida de presupuesto y la reporta en pesos", () => {
  // El caso real: el 4.2 del shampoo pasó de 14.000 a 20.000 el 3 de septiembre.
  // Los crudos van sin centavos porque en COP Meta devuelve el presupuesto tal cual.
  const [ev] = detectarCambios({
    ...base,
    etiqueta: "4.2 Cliente MENOS ESPACIO",
    antes: { dailyBudgetRaw: "14000" },
    despues: { dailyBudgetRaw: "20000" },
  });
  assert.equal(ev?.tipo, "PRESUPUESTO");
  assert.equal(ev?.valorAntes, "14.000");
  assert.equal(ev?.valorDespues, "20.000");
  assert.match(ev!.nota, /subió/);
  assert.match(ev!.nota, /\+43%/);
  assert.match(ev!.nota, /reinicia el aprendizaje/);
});

test("una bajada se reporta como bajada", () => {
  const [ev] = detectarCambios({
    ...base,
    antes: { dailyBudgetRaw: "31000" },
    despues: { dailyBudgetRaw: "18000" },
  });
  assert.match(ev!.nota, /bajó/);
  assert.match(ev!.nota, /-42%/);
});

test("LA INVARIANTE: la primera vez no inventa cientos de cambios", () => {
  // Antes de este import nunca se guardó presupuesto. Si esto emitiera eventos, la bitácora
  // nacería llena de altas disfrazadas de cambios y sería inútil desde el primer día.
  assert.deepEqual(
    detectarCambios({ ...base, antes: {}, despues: { dailyBudgetRaw: "31000" } }),
    [],
  );
  assert.deepEqual(
    detectarCambios({ ...base, antes: { dailyBudgetRaw: null }, despues: { dailyBudgetRaw: "31000" } }),
    [],
  );
  // Y al revés: si Meta deja de devolver el campo, tampoco es un cambio de operación.
  assert.deepEqual(
    detectarCambios({ ...base, antes: { dailyBudgetRaw: "31000" }, despues: {} }),
    [],
  );
});

test("sin cambios no emite nada", () => {
  assert.deepEqual(
    detectarCambios({
      ...base,
      antes: { dailyBudgetRaw: "31000", bidStrategy: "LOWEST_COST_WITHOUT_CAP", effectiveStatus: "ACTIVE" },
      despues: { dailyBudgetRaw: "31000", bidStrategy: "LOWEST_COST_WITHOUT_CAP", effectiveStatus: "ACTIVE" },
    }),
    [],
  );
});

test("detecta cambio de puja y de estado", () => {
  const evs = detectarCambios({
    ...base,
    antes: { bidStrategy: "LOWEST_COST_WITHOUT_CAP", effectiveStatus: "ACTIVE" },
    despues: { bidStrategy: "COST_CAP", effectiveStatus: "PAUSED" },
  });
  assert.equal(evs.length, 2);
  assert.equal(evs.find((e) => e.tipo === "PUJA")?.valorDespues, "COST_CAP");
  assert.equal(evs.find((e) => e.tipo === "ESTADO")?.valorDespues, "PAUSED");
  assert.match(evs.find((e) => e.tipo === "PUJA")!.nota, /antes de culpar al público/);
});

test("varios cambios a la vez salen como eventos separados", () => {
  const evs = detectarCambios({
    ...base,
    antes: { dailyBudgetRaw: "29000", bidStrategy: "COST_CAP", effectiveStatus: "ACTIVE" },
    despues: { dailyBudgetRaw: "35000", bidStrategy: "LOWEST_COST_WITHOUT_CAP", effectiveStatus: "ACTIVE" },
  });
  assert.equal(evs.length, 2, "presupuesto y puja; el estado no cambió");
  assert.deepEqual(new Set(evs.map((e) => e.tipo)), new Set(["PRESUPUESTO", "PUJA"]));
});
