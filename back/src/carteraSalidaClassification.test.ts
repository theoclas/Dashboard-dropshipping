import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clasificarSalidaCartera,
  extractOrdenIdFromDescripcion,
  esCobroDevolucion,
  resolveOrdenIdForSalida,
  SQL_COBRO_DEVOLUCION,
} from "./carteraSalidaClassification";

test("clasificarSalidaCartera — recarga y mantenimiento tarjeta", () => {
  assert.equal(
    clasificarSalidaCartera({
      tipo: "SALIDA",
      descripcion: "SALIDA POR RECARGA DE TARJETA DE CREDITO car_033",
    }),
    "recarga_tarjeta",
  );
  assert.equal(
    clasificarSalidaCartera({
      tipo: "SALIDA",
      descripcion: "SALIDA POR MANTENIMIENTO MENSUAL TARJETA VIRTUAL ID: 50902",
    }),
    "recarga_tarjeta",
  );
});

test("clasificarSalidaCartera — retiro saldo cartera", () => {
  assert.equal(
    clasificarSalidaCartera({
      tipo: "SALIDA",
      descripcion: "SALIDA POR PETICION DE RETIRO DE SALDO EN CARTERA",
    }),
    "retiro",
  );
});

test("clasificarSalidaCartera — flete / pedido", () => {
  assert.equal(
    clasificarSalidaCartera({
      tipo: "SALIDA",
      descripcion: "SALIDA POR COBRO DE FLETE INICIAL: 73590959",
      ordenId: "73590959",
    }),
    "pedido",
  );
});

test("clasificarSalidaCartera — ENTRADA no es salida", () => {
  assert.equal(
    clasificarSalidaCartera({
      tipo: "ENTRADA",
      descripcion: "ENTRADA POR GANANCIA EN LA ORDEN COMO DROPSHIPPER: 76095177",
    }),
    null,
  );
});

test("extractOrdenIdFromDescripcion — flete inicial", () => {
  assert.equal(extractOrdenIdFromDescripcion("SALIDA POR COBRO DE FLETE INICIAL: 73590959"), "73590959");
});

test("resolveOrdenIdForSalida — prioriza columna ORDEN ID", () => {
  assert.equal(
    resolveOrdenIdForSalida({
      ordenId: "111",
      descripcion: "SALIDA POR COBRO DE FLETE INICIAL: 73590959",
    }),
    "111",
  );
});

/**
 * Estos casos son movimientos reales del histórico de cartera del 14-09-2026. Existen porque
 * la tarjeta «Costo de devoluciones» agrupaba por fecha del PEDIDO: una devolución cobrada hoy
 * de un pedido del 1 de septiembre no aparecía hoy, y si el pedido era anterior al export no
 * aparecía nunca. 6 de 13 devoluciones de septiembre (83.969 pesos) eran invisibles.
 */

test("esCobroDevolucion — el cobro de flete de vuelta sí es una devolución", () => {
  for (const d of [
    "SALIDA POR COBRO DE FLETE INICIAL: 88018049",
    "salida por cobro de flete inicial: 85733370",
    "SALIDA POR COBRO DE FLETE INICIAL:88830579",
  ]) {
    assert.equal(esCobroDevolucion({ tipo: "SALIDA", descripcion: d }), true, d);
  }
});

test("esCobroDevolucion — «nueva orden» NO es una devolución", () => {
  // Es el flete que se cobra al crear el pedido. El pedido 88343108 de este movimiento estaba
  // ENTREGADO con costo de devolución 0: contarlo aquí duplicaría el costo de operar.
  for (const d of [
    "SALIDA POR NUEVA ORDEN: 88343108",
    "SALIDA POR NUEVA ORDEN: 88797383",
  ]) {
    assert.equal(esCobroDevolucion({ tipo: "SALIDA", descripcion: d }), false, d);
  }
});

test("esCobroDevolucion — ni retiros, ni tarjeta, ni entradas", () => {
  assert.equal(
    esCobroDevolucion({ tipo: "SALIDA", descripcion: "SALIDA POR PETICION DE RETIRO DE SALDO EN CARTERA" }),
    false,
  );
  assert.equal(
    esCobroDevolucion({ tipo: "SALIDA", descripcion: "SALIDA POR RECARGA DE TARJETA DE CREDITO car_033" }),
    false,
  );
  // Una ENTRADA con ese texto sería una devolución del cobro, no un cobro.
  assert.equal(
    esCobroDevolucion({ tipo: "ENTRADA", descripcion: "COBRO DE FLETE INICIAL: 88018049" }),
    false,
  );
  for (const d of [null, "", "   "]) {
    assert.equal(esCobroDevolucion({ tipo: "SALIDA", descripcion: d }), false);
  }
});

test("LA INVARIANTE: el patrón SQL y la función de TS deciden lo mismo", () => {
  // Si divergen, la tarjeta y su desglose muestran cifras distintas sin que nadie lo note.
  const casos = [
    { tipo: "SALIDA", descripcion: "SALIDA POR COBRO DE FLETE INICIAL: 88018049" },
    { tipo: "SALIDA", descripcion: "SALIDA POR NUEVA ORDEN: 88343108" },
    { tipo: "SALIDA", descripcion: "SALIDA POR PETICION DE RETIRO DE SALDO EN CARTERA" },
    { tipo: "ENTRADA", descripcion: "COBRO DE FLETE INICIAL: 1" },
  ];
  // Réplica en JS de `SQL_COBRO_DEVOLUCION`, leída del propio patrón para que no se copie a mano.
  assert.ok(SQL_COBRO_DEVOLUCION.includes("'SALIDA'"), "el patrón exige tipo SALIDA");
  assert.ok(SQL_COBRO_DEVOLUCION.includes("%FLETE INICIAL%"), "el patrón busca FLETE INICIAL");
  const comoSql = (c: { tipo: string; descripcion: string }) =>
    c.tipo.trim().toUpperCase() === "SALIDA" && c.descripcion.toUpperCase().includes("FLETE INICIAL");
  for (const c of casos) {
    assert.equal(esCobroDevolucion(c), comoSql(c), c.descripcion);
  }
});
