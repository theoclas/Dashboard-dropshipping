import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeMetaBudget,
  porcentajeDeEntrega,
  presupuestoEsPlausible,
  UNIDADES_MENORES_POR_PESO,
} from "./metaBudget";

/**
 * El error que estos tests existen para evitar es el de escala.
 *
 * `spend` de `/insights` ya viene en pesos; `daily_budget` de `/adsets` viene en unidades
 * menores. Mezclarlos da un porcentaje de entrega 100 veces mal, y ese número es el que
 * decide si a un conjunto se le sube o se le baja el presupuesto.
 */

test("convierte el crudo de Meta a pesos", () => {
  // Los presupuestos reales del collar el 8 de septiembre de 2026.
  assert.equal(normalizeMetaBudget("3100000"), 31000);
  assert.equal(normalizeMetaBudget("2900000"), 29000);
  assert.equal(normalizeMetaBudget("1300000"), 13000);
});

test("sin presupuesto devuelve null, no cero", () => {
  // Un cero se leería como «presupuesto agotado»; null es «este nivel no lo define».
  for (const v of [null, undefined, "", "0", "no-es-numero"]) {
    assert.equal(normalizeMetaBudget(v as string | null), null, `falló con ${JSON.stringify(v)}`);
  }
});

test("el factor es el que la conversión usa de verdad", () => {
  assert.equal(normalizeMetaBudget(String(7 * UNIDADES_MENORES_POR_PESO)), 7);
});

test("porcentaje de entrega: topado, normal y ahogado", () => {
  // Caliente el 7 de septiembre: gastó 39.619 de 31.000 asignados.
  assert.equal(Math.round(porcentajeDeEntrega(39619, 31000)!), 128);
  // Frío ese mismo día: 22.374 de 29.000. Ahogado.
  assert.equal(Math.round(porcentajeDeEntrega(22374, 29000)!), 77);
  assert.equal(Math.round(porcentajeDeEntrega(31000, 31000)!), 100);
});

test("sin presupuesto conocido no se inventa un 0%", () => {
  assert.equal(porcentajeDeEntrega(20000, null), null);
  assert.equal(porcentajeDeEntrega(20000, 0), null);
});

test("la guardia de escala atrapa un factor equivocado", () => {
  const gasto = 24_891; // lo que gastó Frío el 8 de septiembre

  assert.equal(presupuestoEsPlausible(29_000, gasto), true, "el valor correcto debe pasar");
  // Si alguien olvidara dividir, el presupuesto llegaría como 2.900.000.
  assert.equal(presupuestoEsPlausible(2_900_000, gasto), false, "100x arriba debe rechazarse");
  // Y si dividiera de más, 290.
  assert.equal(presupuestoEsPlausible(290, gasto), false, "100x abajo debe rechazarse");
});

test("un día sin gasto no descarta el presupuesto", () => {
  // Recién creado o pausado: no hay con qué comparar, pero el dato sirve igual.
  assert.equal(presupuestoEsPlausible(13000, 0), true);
});
