import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDate, toMetricRecordDate } from "./excelImportHelpers";
import {
  billingImportDedupeKey,
  extractMetaBillingResumenContext,
  parseMetaBillingMoney,
} from "./importMetaBillingOperationalCsv";

const SAMPLE_RESUMEN = `Información del anunciante
Cuenta: 1471976967613858,Negocio: Fernando de Jesus Palacio Suarez,CR 49 B
Fecha,Identificador de la transacción,Importe,Divisa
18/5/2026,26839600959059125-26859861187033108,108.462,COP
17/5/2026,26935524859466739-27111536571865562,108.462,COP
,Importe total facturado,1.341.410,COP
`;

test("parseMetaBillingMoney — miles con punto (COP)", () => {
  assert.equal(parseMetaBillingMoney("108.462"), 108462);
  assert.equal(parseMetaBillingMoney("1.341.410"), 1341410);
  assert.equal(parseMetaBillingMoney("21.696"), 21696);
});

test("toMetricRecordDate — 18/5/2026 del CSV Meta queda en día 18 UTC", () => {
  const parsed = parseDate("18/5/2026");
  assert.ok(parsed);
  const stored = toMetricRecordDate(parsed);
  assert.equal(stored.toISOString(), "2026-05-18T00:00:00.000Z");
});

test("billingImportDedupeKey — misma transacción produce la misma clave", () => {
  const fecha = new Date("2026-05-18T12:00:00.000Z");
  const concepto = "Facturación Meta 27367236209633945-27367236252967274";
  const a = billingImportDedupeKey("27681534604769560", concepto, fecha, 337120);
  const b = billingImportDedupeKey("27681534604769560", concepto, fecha, 337120);
  assert.equal(a, b);
  const c = billingImportDedupeKey("27681534604769560", concepto, new Date("2026-05-19T12:00:00.000Z"), 337120);
  assert.notEqual(a, c);
});

test("extractMetaBillingResumenContext — CSV resumen facturación ES", () => {
  const ctx = extractMetaBillingResumenContext(SAMPLE_RESUMEN);
  assert.ok(ctx);
  assert.equal(ctx.metaAccountId, "1471976967613858");
  assert.match(ctx.businessName ?? "", /Fernando/);
  assert.match(ctx.tableCsv, /^Fecha,/m);
  assert.doesNotMatch(ctx.tableCsv, /Importe total facturado/);
});
