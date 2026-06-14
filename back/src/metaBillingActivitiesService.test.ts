import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMetaBillingChargeEvent,
  normalizeMetaBillingActivity,
  parseMetaActivityExtraData,
  resolveMetaBillingDateRange,
} from "./metaBillingActivitiesService";

test("parseMetaActivityExtraData — JSON string", () => {
  const extra = parseMetaActivityExtraData('{"currency":"COP","new_value":"108462","transaction_id":"tx-1"}');
  assert.equal(extra.currency, "COP");
  assert.equal(extra.new_value, "108462");
  assert.equal(extra.transaction_id, "tx-1");
});

test("normalizeMetaBillingActivity — cargo con monto y concepto", () => {
  const row = normalizeMetaBillingActivity({
    event_time: "2026-06-04T12:00:00+0000",
    event_type: "ad_account_billing_charge",
    translated_event_type: "Cargo de facturación",
    object_id: "27186626301028276",
    extra_data: JSON.stringify({
      currency: "COP",
      new_value: "104824",
      transaction_id: "27186626301028276-27260174063673503",
      invoice_id: "27260174063673503",
    }),
  });
  assert.ok(row);
  assert.equal(row.amount, 104824);
  assert.equal(row.concepto, "Facturación Meta 27186626301028276-27260174063673503");
  assert.ok(isMetaBillingChargeEvent(row.eventType));
});

test("resolveMetaBillingDateRange — intercambia si since > until", () => {
  const r = resolveMetaBillingDateRange("2026-06-10", "2026-06-01");
  assert.equal(r.since, "2026-06-01");
  assert.equal(r.until, "2026-06-10");
});
