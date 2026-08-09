import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addToRollup,
  deriveRates,
  emptyRollup,
  mapAdInsightRow,
  mapAdInsightRows,
  type ParsedAdRow,
} from "./metaAdInsightNormalize";
import { validateAdApiDateRange } from "./metaAdsAdInsightsService";

const BASE_ROW = {
  account_id: "1471976967613858",
  account_name: "FersuaStore",
  campaign_id: "120330001",
  campaign_name: "Shampoo — Ventas",
  adset_id: "120440002",
  adset_name: "Conjunto amplio",
  ad_id: "120550003",
  ad_name: "Creativo A — gancho precio",
  spend: "43523.50",
  impressions: "12000",
  reach: "9800",
  clicks: "180",
  inline_link_clicks: "150",
  ctr: "1.5",
  cpc: "241.79",
  cpm: "3626.96",
  date_start: "2026-05-17",
  date_stop: "2026-05-17",
};

test("mapAdInsightRow — jerarquía completa y métricas de atención", () => {
  const r = mapAdInsightRow({
    ...BASE_ROW,
    actions: [
      { action_type: "purchase", value: "5" },
      { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "22" },
    ],
    action_values: [{ action_type: "purchase", value: "250000" }],
    purchase_roas: [{ value: "5.74" }],
  });

  assert.ok(r);
  assert.equal(r.externalCampaignId, "120330001");
  assert.equal(r.externalAdSetId, "120440002");
  assert.equal(r.externalAdId, "120550003");
  assert.equal(r.adName, "Creativo A — gancho precio");
  assert.equal(r.ymd, "2026-05-17");
  assert.equal(r.recordDate.toISOString().slice(0, 10), "2026-05-17");

  assert.equal(r.spend, 43523.5);
  assert.equal(r.impressions, 12000);
  assert.equal(r.clicks, 180);
  assert.equal(r.ctr, 1.5);
  assert.equal(r.cpm, 3626.96);

  assert.equal(r.purchases, 5);
  assert.equal(r.conversations, 22);
  assert.equal(r.conversionValue, 250000);
  assert.equal(r.roas, 5.74);
});

test("mapAdInsightRow — descarta filas sin ad_id o sin fecha", () => {
  assert.equal(mapAdInsightRow({ ...BASE_ROW, ad_id: undefined }), null);
  assert.equal(mapAdInsightRow({ ...BASE_ROW, adset_id: "" }), null);
  assert.equal(mapAdInsightRow({ ...BASE_ROW, date_start: "no-es-fecha" }), null);
});

test("mapAdInsightRows — reporta cuántas filas se omitieron", () => {
  const { parsed, errors } = mapAdInsightRows([BASE_ROW, { ...BASE_ROW, ad_id: undefined }]);
  assert.equal(parsed.length, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /1 fila/);
});

test("deriveRates — recalcula desde las bases, no promedia porcentajes", () => {
  // Dos días con CTR muy distinto: el CTR real del conjunto es 210/12000, no (1% + 20%)/2.
  const rows: ParsedAdRow[] = [
    { ...(mapAdInsightRow(BASE_ROW) as ParsedAdRow) },
    {
      ...(mapAdInsightRow({
        ...BASE_ROW,
        date_start: "2026-05-18",
        impressions: "150",
        clicks: "30",
        ctr: "20",
        spend: "1000",
      }) as ParsedAdRow),
    },
  ];

  const acc = emptyRollup();
  for (const r of rows) addToRollup(acc, r);

  assert.equal(acc.impressions, 12150);
  assert.equal(acc.clicks, 210);
  assert.equal(acc.spend, 44523.5);

  const rates = deriveRates(acc);
  const ctrEsperado = (210 / 12150) * 100;
  assert.ok(Math.abs(rates.ctr! - ctrEsperado) < 1e-9);
  // Si se hubieran promediado los CTR daría ~10,5 %, que es falso.
  assert.ok(rates.ctr! < 2);
});

test("deriveRates — sin impresiones ni clics devuelve null, no cero ni NaN", () => {
  const rates = deriveRates(emptyRollup());
  assert.equal(rates.ctr, null);
  assert.equal(rates.cpm, null);
  assert.equal(rates.cpc, null);
  assert.equal(rates.costPerPurchase, null);
  assert.equal(rates.roas, null);
});

test("validateAdApiDateRange — ordena el rango al revés y rechaza el exceso", () => {
  const v = validateAdApiDateRange("2026-05-20", "2026-05-10");
  assert.ok(v.ok);
  assert.equal(v.desde, "2026-05-10");
  assert.equal(v.hasta, "2026-05-20");
  assert.equal(v.days, 11);

  const tooLong = validateAdApiDateRange("2020-01-01", "2020-12-31");
  assert.equal(tooLong.ok, false);

  const bad = validateAdApiDateRange("17/05/2026", "2026-05-18");
  assert.equal(bad.ok, false);
});
