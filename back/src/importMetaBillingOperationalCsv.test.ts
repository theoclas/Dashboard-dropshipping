import assert from "node:assert/strict";
import { test } from "node:test";
import {
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

test("extractMetaBillingResumenContext — CSV resumen facturación ES", () => {
  const ctx = extractMetaBillingResumenContext(SAMPLE_RESUMEN);
  assert.ok(ctx);
  assert.equal(ctx.metaAccountId, "1471976967613858");
  assert.match(ctx.businessName ?? "", /Fernando/);
  assert.match(ctx.tableCsv, /^Fecha,/m);
  assert.doesNotMatch(ctx.tableCsv, /Importe total facturado/);
});
