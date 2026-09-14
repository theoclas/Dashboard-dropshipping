import assert from "node:assert/strict";
import { test } from "node:test";
import { clasificarEstado } from "./agentOrdersService";

/**
 * Estos tests existen por un error real: `clasificarEstado` usaba `includes("DEVU")`, y
 * el estado que manda Dropi es `DEVOLUCION` — que **no** contiene esa secuencia. Durante
 * días las devoluciones se contaron como tránsito y las cancelaciones como devoluciones,
 * así que el % de entrega por transportadora salía mal en las dos direcciones.
 *
 * Los estados de aquí son los que aparecen de verdad en la base.
 */

test("LA INVARIANTE: DEVOLUCION se cuenta como devolución", () => {
  assert.equal(clasificarEstado("DEVOLUCION"), "devuelto");
  assert.equal(clasificarEstado("devolucion"), "devuelto");
  assert.equal(clasificarEstado("EN DEVOLUCIÓN A ORIGEN"), "devuelto");
});

test("los estados reales de la base se clasifican bien", () => {
  const esperado: Record<string, string> = {
    ENTREGADO: "entregado",
    DEVOLUCION: "devuelto",
    CANCELADO: "cancelado",
    ORIGEN: "transito",
    OFICINA: "transito",
    TRANSITO: "transito",
    NOVEDAD: "transito",
  };
  for (const [estado, clase] of Object.entries(esperado)) {
    assert.equal(clasificarEstado(estado), clase, `${estado} debería ser ${clase}`);
  }
});

test("cancelado no es devuelto", () => {
  // Un cancelado nunca salió: contarlo como devolución inflaba la tasa de cada
  // transportadora y hacía ver mal a la que más cancelaciones recibía.
  assert.equal(clasificarEstado("CANCELADO"), "cancelado");
  assert.notEqual(clasificarEstado("CANCELADO"), "devuelto");
});

test("rechazado cuenta como devolución, y gana sobre devolución si vienen los dos", () => {
  assert.equal(clasificarEstado("RECHAZADO EN DESTINO"), "devuelto");
  // Un rechazado que además dice devolución sigue siendo una sola cosa, no dos.
  assert.equal(clasificarEstado("RECHAZADO - DEVOLUCION"), "devuelto");
  // Pero si además está cancelado, cancelado manda: nunca se movió.
  assert.equal(clasificarEstado("CANCELADO - DEVOLUCION"), "cancelado");
});

test("«entregado a transportadora» NO es entregado", () => {
  // Es el estado de recién despachado. Contarlo como entrega inflaría el % de entrega
  // justo en los pedidos más recientes, que es cuando más se mira.
  assert.equal(clasificarEstado("ENTREGADO A TRANSPORTADORA"), "transito");
  assert.equal(clasificarEstado("ENTREGADOS"), "entregado");
});

test("vacío y nulo caen en tránsito, no revientan", () => {
  for (const v of [null, "", "   ", "SIN MAPEAR"]) {
    assert.equal(clasificarEstado(v as string | null), "transito");
  }
});
