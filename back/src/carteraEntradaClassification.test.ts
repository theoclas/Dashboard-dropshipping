import test from "node:test";
import assert from "node:assert/strict";
import { clasificarEntradaCartera, resolveOrdenIdForEntrada } from "./carteraEntradaClassification";

test("clasifica entrada con orden como pedido", () => {
  assert.equal(clasificarEntradaCartera({ tipo: "ENTRADA", ordenId: "12345" }), "pedido");
});

test("clasifica entrada sin orden como otro", () => {
  assert.equal(clasificarEntradaCartera({ tipo: " entrada ", descripcion: "AJUSTE DE SALDO" }), "otro");
});

test("ignora movimientos que no son entrada", () => {
  assert.equal(clasificarEntradaCartera({ tipo: "SALIDA", ordenId: "12345" }), null);
});

test("extrae orden desde descripción", () => {
  assert.equal(
    resolveOrdenIdForEntrada({ descripcion: "PAGO ORDEN COMO DROPSHIPPER: 98765" }),
    "98765",
  );
});
