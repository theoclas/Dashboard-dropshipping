import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clasificarSalidaCartera,
  extractOrdenIdFromDescripcion,
  resolveOrdenIdForSalida,
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
