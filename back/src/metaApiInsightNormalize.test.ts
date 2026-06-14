import assert from "node:assert/strict";
import { test } from "node:test";
import { getActionValue, mapInsightToParsedRow } from "./metaApiInsightNormalize";
import { spendFromMetaExcelSnapshot } from "./metaCampaignExcelParse";
import { yesterdayYmdInTimezone, toMetaActAccountId } from "./metaAdsInsightsService";

test("getActionValue — prioridad de compras", () => {
  const actions = [
    { action_type: "link_click", value: "10" },
    { action_type: "purchase", value: "3" },
  ];
  assert.equal(
    getActionValue(actions, ["web_in_store_purchase", "omni_purchase", "purchase"]),
    3,
  );
});

test("mapInsightToParsedRow — spend string y snapshot compatible con dashboard", () => {
  const row = mapInsightToParsedRow(
    {
      campaign_id: "120330001",
      campaign_name: "Shampoo Test",
      spend: "43523.50",
      inline_link_clicks: "120",
      date_start: "2026-05-17",
      date_stop: "2026-05-17",
      actions: [{ action_type: "purchase", value: "5" }],
      purchase_roas: [{ value: "2.5" }],
    },
    "2026-05-17",
  );
  assert.ok(row);
  assert.equal(row!.externalCampaignId, "120330001");
  assert.equal(row!.displayName, "Shampoo Test");
  assert.equal(row!.metaLinkClicks, 120);
  assert.equal(row!.rawRow["Importe gastado (COP)"], 43523.5);
  assert.equal(row!.rawRow.Compras, 5);
  assert.equal(row!.rawRow.ROAS, 2.5);
  assert.equal(row!.rawRow._metaApiSource, true);

  const spend = spendFromMetaExcelSnapshot(row!.rawRow);
  assert.equal(spend.found, true);
  assert.equal(spend.amount, 43523.5);
});

test("mapInsightToParsedRow — sin campaign_id devuelve null", () => {
  assert.equal(mapInsightToParsedRow({ spend: "10" }, "2026-05-17"), null);
});

test("toMetaActAccountId — agrega prefijo act_", () => {
  assert.equal(toMetaActAccountId("1471976967613858"), "act_1471976967613858");
  assert.equal(toMetaActAccountId("act_999"), "act_999");
});

test("yesterdayYmdInTimezone — formato YYYY-MM-DD", () => {
  const ymd = yesterdayYmdInTimezone("America/Bogota");
  assert.match(ymd, /^\d{4}-\d{2}-\d{2}$/);
});
