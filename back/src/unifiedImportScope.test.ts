import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveScopeFrom } from "./unifiedImportScope";

const EMPRESA = {
  companyAccountIds: ["a1", "a2", "a3"],
  productAccountIds: [] as string[],
  productExists: true,
};

test("alcance producto usa las cuentas asignadas al producto", () => {
  const r = resolveScopeFrom(
    { kind: "product", catalogProductId: "p1" },
    { ...EMPRESA, productAccountIds: ["a1", "a3"] },
  );

  assert.deepEqual(r.advertisingAccountIds, ["a1", "a3"]);
  assert.equal(r.catalogProductId, "p1");
});

test("alcance producto sin cuentas asignadas consulta todas y avisa", () => {
  // Este es el callejón sin salida de hoy: un producto nuevo nunca podría importar.
  const r = resolveScopeFrom({ kind: "product", catalogProductId: "p1" }, EMPRESA);

  assert.deepEqual(r.advertisingAccountIds, ["a1", "a2", "a3"]);
  assert.ok(r.warnings.some((w) => /no tiene cuentas publicitarias asignadas/.test(w)));
});

test("alcance producto respeta las cuentas que manda el cliente", () => {
  const r = resolveScopeFrom(
    { kind: "product", catalogProductId: "p1", advertisingAccountIds: ["a2"] },
    { ...EMPRESA, productAccountIds: ["a1", "a3"] },
  );

  assert.deepEqual(r.advertisingAccountIds, ["a2"]);
});

test("alcance todo consulta todas las cuentas y no vincula nada", () => {
  const r = resolveScopeFrom({ kind: "all" }, EMPRESA);

  assert.deepEqual(r.advertisingAccountIds, ["a1", "a2", "a3"]);
  assert.deepEqual(r.linkCampaignIds, []);
  assert.equal(r.catalogProductId, null);
});

test("las cuentas de otra empresa se descartan y se avisa", () => {
  const r = resolveScopeFrom(
    { kind: "all", advertisingAccountIds: ["a1", "de-otra-empresa", "a2"] },
    EMPRESA,
  );

  assert.deepEqual(r.advertisingAccountIds, ["a1", "a2"]);
  assert.ok(r.warnings.some((w) => /no pertenecen a esta empresa/.test(w)));
});

test("un producto con cuentas que ya no existen se trata como producto sin cuentas", () => {
  // Antes esto dejaba el import consultando cero cuentas, sin explicar por qué.
  const r = resolveScopeFrom(
    { kind: "product", catalogProductId: "p1" },
    { companyAccountIds: ["a1"], productAccountIds: ["vieja1", "vieja2"], productExists: true },
  );

  assert.deepEqual(r.advertisingAccountIds, ["a1"]);
  assert.ok(r.warnings.some((w) => /no tiene cuentas publicitarias asignadas/.test(w)));
});

// ── Lo que impide inflar el margen ───────────────────────────────────────────

test("sin selección explícita NO se vincula ninguna campaña", () => {
  // El caso peligroso: producto sin cuentas -> se consultan todas -> si además se
  // vinculara todo lo que aparece, el producto nuevo se quedaría con las campañas de
  // todos los demás productos y su gasto se contaría dos veces.
  const r = resolveScopeFrom({ kind: "product", catalogProductId: "p1" }, EMPRESA);

  assert.deepEqual(r.linkCampaignIds, []);
  assert.ok(r.warnings.some((w) => /No se vinculará ninguna campaña/.test(w)));
});

test("solo se vinculan las campañas elegidas a mano", () => {
  const r = resolveScopeFrom(
    { kind: "product", catalogProductId: "p1", selectedCampaignIds: ["C1", "C2"] },
    { ...EMPRESA, productAccountIds: ["a1"] },
  );

  assert.deepEqual(r.linkCampaignIds, ["C1", "C2"]);
  assert.deepEqual(r.selectedCampaignIds, ["C1", "C2"]);
});

test("una selección vacía no se confunde con no filtrar", () => {
  // `[]` es "el usuario desmarcó todo". Tratarlo como `undefined` invertiría la
  // seguridad: pasaría de escribir nada a escribir todo.
  const vacia = resolveScopeFrom(
    { kind: "product", catalogProductId: "p1", selectedCampaignIds: [] },
    { ...EMPRESA, productAccountIds: ["a1"] },
  );
  assert.deepEqual(vacia.selectedCampaignIds, []);
  assert.deepEqual(vacia.linkCampaignIds, []);
  assert.ok(vacia.warnings.some((w) => /no se escribirá ninguna métrica/.test(w)));

  const ausente = resolveScopeFrom(
    { kind: "product", catalogProductId: "p1" },
    { ...EMPRESA, productAccountIds: ["a1"] },
  );
  assert.equal(ausente.selectedCampaignIds, null);
});

test("la selección de campañas también manda en alcance todo", () => {
  const r = resolveScopeFrom({ kind: "all", selectedCampaignIds: ["C1"] }, EMPRESA);

  assert.deepEqual(r.selectedCampaignIds, ["C1"]);
  // Pero sigue sin vincular: en "todo" no hay producto al que vincular.
  assert.deepEqual(r.linkCampaignIds, []);
});

test("los IDs de campaña se normalizan como en el resto del import", () => {
  const r = resolveScopeFrom(
    { kind: "product", catalogProductId: "p1", selectedCampaignIds: [" C1 ", "C 1", "C2"] },
    { ...EMPRESA, productAccountIds: ["a1"] },
  );

  // normalizeCampaignMapKey quita espacios: " C1 " y "C 1" son la misma campaña.
  assert.deepEqual(r.selectedCampaignIds, ["C1", "C2"]);
});

test("un producto inexistente no acaba consultando toda la empresa", () => {
  const r = resolveScopeFrom(
    { kind: "product", catalogProductId: "p-borrado" },
    { ...EMPRESA, productExists: false },
  );

  assert.deepEqual(r.advertisingAccountIds, []);
  assert.deepEqual(r.linkCampaignIds, []);
  assert.ok(r.warnings.some((w) => /no existe o no pertenece a esta empresa/.test(w)));
});

test("los IDs repetidos o vacios no duplican trabajo", () => {
  const r = resolveScopeFrom(
    { kind: "all", advertisingAccountIds: ["a1", "a1", "", "  ", "a2"] },
    EMPRESA,
  );
  assert.deepEqual(r.advertisingAccountIds, ["a1", "a2"]);
});

test("una empresa sin cuentas avisa en vez de quedarse callada", () => {
  const r = resolveScopeFrom(
    { kind: "all" },
    { companyAccountIds: [], productAccountIds: [], productExists: true },
  );
  assert.deepEqual(r.advertisingAccountIds, []);
  assert.ok(r.warnings.some((w) => /No hay cuentas publicitarias/.test(w)));
});
