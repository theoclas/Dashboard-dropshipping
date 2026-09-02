import assert from "node:assert/strict";
import { test } from "node:test";
import { mapAdInsightRow, type ParsedAdRow } from "./metaAdInsightNormalize";
import { mapInsightToParsedRow } from "./metaApiInsightNormalize";
import { spendFromMetaExcelSnapshot } from "./metaCampaignExcelParse";
import {
  aggregateActions,
  buildUnifiedCampaignSnapshot,
  isSpendHeaderKey,
  mergeCampaignSnapshot,
  type CampaignSnapshot,
} from "./unifiedCampaignSnapshot";

/**
 * Claves que emite hoy `deriveCampaignMetricsFromAds` en `adImportService.ts`.
 * Están a mano a propósito: si alguien añade una allí y no aquí, este test no se entera,
 * pero si alguien quita una del escritor unificado el test cae. Es la red contra
 * "se nos olvidó una columna" al unificar.
 */
const CLAVES_RUTA_ANUNCIOS = [
  "Campaign ID",
  "Campaign name",
  "Importe gastado (COP)",
  "Link clicks",
  "Conversaciones con mensajes iniciadas",
  "Compras",
  "Valor de conversión",
  "Costo por compra",
  "ROAS",
  "Impressions",
  "Reach",
  "Clicks",
  "CTR",
  "CPC",
  "CPM",
  "Day",
  "_metaApiSource",
  "_derivedFromAds",
  "_adRowsAggregated",
  "_reachIsSumNotDeduped",
];

function filaApiAnuncio(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: "act_111",
    account_name: "Cuenta 1",
    campaign_id: "C1",
    campaign_name: "Campaña Shampoo",
    adset_id: "AS1",
    adset_name: "Conjunto 1",
    ad_id: "AD1",
    ad_name: "Anuncio 1",
    spend: "1000",
    impressions: "5000",
    reach: "4000",
    clicks: "100",
    inline_link_clicks: "80",
    ctr: "2",
    cpc: "10",
    cpm: "200",
    actions: [
      { action_type: "omni_purchase", value: "2" },
      { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "5" },
    ],
    action_values: [{ action_type: "omni_purchase", value: "60000" }],
    date_start: "2026-08-10",
    date_stop: "2026-08-10",
    ...over,
  };
}

function anuncios(...overs: Array<Record<string, unknown>>): ParsedAdRow[] {
  const base = overs.length > 0 ? overs : [{}];
  return base.map((o) => {
    const p = mapAdInsightRow(filaApiAnuncio(o) as never);
    assert.ok(p, "la fila de prueba debería parsear");
    return p;
  });
}

test("el snapshot unificado emite todas las claves de la ruta de Anuncios", () => {
  const { snapshot } = buildUnifiedCampaignSnapshot({
    externalCampaignId: "C1",
    campaignName: "Campaña Shampoo",
    ymd: "2026-08-10",
    adRows: anuncios(),
    campaignLevel: null,
    runId: "run-1",
  });

  for (const k of CLAVES_RUTA_ANUNCIOS) {
    assert.ok(k in snapshot, `falta la clave "${k}" que sí escribe el módulo Anuncios`);
  }
});

test("el snapshot unificado emite todas las claves de la ruta de Campañas Meta", () => {
  const campaignLevel = mapInsightToParsedRow(
    {
      campaign_id: "C1",
      campaign_name: "Campaña Shampoo",
      account_id: "act_111",
      account_name: "Cuenta 1",
      spend: "1000",
      impressions: "5000",
      reach: "3800",
      clicks: "100",
      inline_link_clicks: "80",
      ctr: "2",
      cpc: "10",
      cpm: "200",
      actions: [{ action_type: "omni_purchase", value: "2" }],
      action_values: [{ action_type: "omni_purchase", value: "60000" }],
      purchase_roas: [{ action_type: "omni_purchase", value: "60" }],
      date_start: "2026-08-10",
      date_stop: "2026-08-10",
    } as never,
    "2026-08-10",
  );
  assert.ok(campaignLevel);

  const { snapshot } = buildUnifiedCampaignSnapshot({
    externalCampaignId: "C1",
    campaignName: "Campaña Shampoo",
    ymd: "2026-08-10",
    adRows: anuncios(),
    campaignLevel,
    runId: "run-1",
  });

  for (const k of Object.keys(campaignLevel.rawRow)) {
    assert.ok(k in snapshot, `falta la clave "${k}" que sí escribe Campañas Meta`);
  }
  // Y el alcance real de la pasada de campaña gana sobre la suma de anuncios.
  assert.equal(snapshot.Reach, 3800);
  assert.equal(snapshot._campaignLevelPass, true);
  assert.equal(snapshot._reachIsSumNotDeduped, undefined);
});

test("el gasto del snapshot es exactamente la suma de los anuncios", () => {
  const { snapshot } = buildUnifiedCampaignSnapshot({
    externalCampaignId: "C1",
    campaignName: "Campaña Shampoo",
    ymd: "2026-08-10",
    adRows: anuncios({ ad_id: "AD1", spend: "1000" }, { ad_id: "AD2", spend: "2500.5" }),
    campaignLevel: null,
    runId: "run-1",
  });

  const sp = spendFromMetaExcelSnapshot(snapshot);
  assert.equal(sp.found, true);
  assert.equal(sp.amount, 3500.5);
});

test("las tasas se recalculan desde las bases, no se promedian", () => {
  // Dos anuncios con CTR muy distinto: promediar daría 3, lo correcto es 1,83.
  const { snapshot } = buildUnifiedCampaignSnapshot({
    externalCampaignId: "C1",
    campaignName: null,
    ymd: "2026-08-10",
    adRows: anuncios(
      { ad_id: "AD1", impressions: "1000", clicks: "50", ctr: "5", spend: "100" },
      { ad_id: "AD2", impressions: "5000", clicks: "60", ctr: "1.2", spend: "400" },
    ),
    campaignLevel: null,
    runId: "run-1",
  });

  // (110 / 6000) * 100
  assert.ok(Math.abs((snapshot.CTR as number) - 1.8333333333333333) < 1e-9);
  // 500 / 110
  assert.ok(Math.abs((snapshot.CPC as number) - 4.545454545454546) < 1e-9);
  // (500 / 6000) * 1000
  assert.ok(Math.abs((snapshot.CPM as number) - 83.33333333333333) < 1e-9);
});

test("el delta de gasto contra los anuncios queda registrado para poder auditarlo", () => {
  const campaignLevel = mapInsightToParsedRow(
    {
      campaign_id: "C1",
      spend: "1010",
      date_start: "2026-08-10",
      date_stop: "2026-08-10",
    } as never,
    "2026-08-10",
  );
  assert.ok(campaignLevel);

  const { snapshot } = buildUnifiedCampaignSnapshot({
    externalCampaignId: "C1",
    campaignName: null,
    ymd: "2026-08-10",
    adRows: anuncios({ spend: "1000" }),
    campaignLevel,
    runId: "run-1",
  });

  assert.equal(snapshot._adRowsSpendSum, 1000);
  assert.equal(snapshot._spendDeltaVsAds, 10);
});

test("aggregateActions suma por action_type entre anuncios, no copia el de uno", () => {
  const rows = anuncios(
    {
      ad_id: "AD1",
      actions: [
        { action_type: "omni_purchase", value: "2" },
        { action_type: "link_click", value: "40" },
      ],
    },
    {
      ad_id: "AD2",
      actions: [{ action_type: "omni_purchase", value: "3" }],
    },
  );

  assert.deepEqual(aggregateActions(rows, "actions"), [
    { action_type: "link_click", value: 40 },
    { action_type: "omni_purchase", value: 5 },
  ]);
});

test("isSpendHeaderKey reconoce las variantes que barre spendFromMetaExcelSnapshot", () => {
  assert.equal(isSpendHeaderKey("Importe gastado (COP)"), true);
  assert.equal(isSpendHeaderKey("Importe gastado (USD)"), true);
  assert.equal(isSpendHeaderKey("importe gastado"), true);
  assert.equal(isSpendHeaderKey("Amount spent (USD)"), true);
  assert.equal(isSpendHeaderKey("AMOUNT SPENT"), true);
  assert.equal(isSpendHeaderKey("Clicks"), false);
  assert.equal(isSpendHeaderKey("Presupuesto de la campaña"), false);
});

test("la fusión deja viva UNA sola clave de gasto, y es la nueva", () => {
  // El caso peligroso: la fila venía de un Excel en dólares y ahora llega la API en pesos.
  const anterior = {
    "Campaign ID": "C1",
    "Amount spent (USD)": 250,
    "Importe gastado (USD)": 250,
    Clicks: 10,
  };
  const nuevo: CampaignSnapshot = {
    "Campaign ID": "C1",
    "Importe gastado (COP)": 1000000,
    Clicks: 100,
    _writtenBy: "unified",
  };

  const merged = mergeCampaignSnapshot(anterior, nuevo);

  const clavesDeGasto = Object.keys(merged).filter(isSpendHeaderKey);
  assert.deepEqual(clavesDeGasto, ["Importe gastado (COP)"]);

  const sp = spendFromMetaExcelSnapshot(merged);
  assert.equal(sp.found, true);
  assert.equal(sp.amount, 1000000);
});

test("la fusión conserva las columnas del Excel que el import por API no toca", () => {
  const anterior = {
    "Campaign ID": "C1",
    "Importe gastado (COP)": 900,
    "Presupuesto de la campaña": 50000,
    "Objetivo": "Mensajes",
    Clicks: 10,
  };
  const nuevo: CampaignSnapshot = {
    "Campaign ID": "C1",
    "Importe gastado (COP)": 1000,
    Clicks: 100,
    _writtenBy: "unified",
  };

  const merged = mergeCampaignSnapshot(anterior, nuevo);

  assert.equal(merged["Presupuesto de la campaña"], 50000);
  assert.equal(merged["Objetivo"], "Mensajes");
  assert.equal(merged["Importe gastado (COP)"], 1000);
  assert.equal(merged.Clicks, 100);
  assert.equal(merged._supersededSource, "file");
});

test("la fusión sobre una fila que ya era de la API deja constancia del origen", () => {
  const anterior = { "Campaign ID": "C1", "Importe gastado (COP)": 900, _metaApiSource: true };
  const merged = mergeCampaignSnapshot(anterior, {
    "Campaign ID": "C1",
    "Importe gastado (COP)": 1000,
  });
  assert.equal(merged._supersededSource, "meta-api");
});

test("la fusión sin snapshot previo devuelve el nuevo tal cual", () => {
  const nuevo: CampaignSnapshot = { "Campaign ID": "C1", "Importe gastado (COP)": 1000 };
  assert.deepEqual(mergeCampaignSnapshot(null, nuevo), nuevo);
  assert.deepEqual(mergeCampaignSnapshot(undefined, nuevo), nuevo);
  // Un JSON que no es objeto tampoco debe romper el import.
  assert.deepEqual(mergeCampaignSnapshot([1, 2] as never, nuevo), nuevo);
});

test("la fusión no arrastra claves propias del escritor unificado que ya no se emiten", () => {
  const anterior = {
    "Importe gastado (COP)": 900,
    _reachIsSumNotDeduped: true,
    _adRowsAggregated: 7,
  };
  // Corrida nueva CON pasada de campaña: ya no marca el alcance como estimado.
  const merged = mergeCampaignSnapshot(anterior, {
    "Importe gastado (COP)": 1000,
    Reach: 3800,
    _adRowsAggregated: 3,
  });

  assert.equal(merged._reachIsSumNotDeduped, undefined);
  assert.equal(merged._adRowsAggregated, 3);
});

test("isSpendHeaderKey cubre tambien los alias que solo ve getExcelCell", () => {
  // "Spend (COP)" no contiene "importe gastado" ni "amount spent": el barrido de
  // spendFromMetaExcelSnapshot no lo detecta, pero su lista de alias si lo acepta.
  // Si la purga no lo reconociera, sobreviviria a la fusion como gasto fantasma.
  assert.equal(isSpendHeaderKey("Spend (COP)"), true);
  assert.equal(isSpendHeaderKey("spend (cop)"), true);
});

test("la fusion NO borra el gasto anterior si el nuevo no trae ninguno", () => {
  const anterior = { "Campaign ID": "C1", "Importe gastado (COP)": 950000, Day: "2026-08-10" };
  const merged = mergeCampaignSnapshot(anterior, { "Campaign ID": "C1", "Link clicks": 80 });

  assert.equal(spendFromMetaExcelSnapshot(merged).amount, 950000);
});

test("si Meta devuelve la campana sin gasto pero los anuncios si gastaron, manda la suma", () => {
  // Dejar el 0 haria caer el gasto del dashboard ese dia sin que nadie se entere.
  const campaignLevel = mapInsightToParsedRow(
    { campaign_id: "C1", date_start: "2026-08-10", date_stop: "2026-08-10" } as never,
    "2026-08-10",
  );
  assert.ok(campaignLevel);

  const { snapshot } = buildUnifiedCampaignSnapshot({
    externalCampaignId: "C1",
    campaignName: null,
    ymd: "2026-08-10",
    adRows: anuncios({ spend: "1000" }, { ad_id: "AD2", spend: "500" }),
    campaignLevel,
    runId: "run-1",
  });

  assert.equal(spendFromMetaExcelSnapshot(snapshot).amount, 1500);
  assert.equal(snapshot._spendFallbackToAds, true);
  assert.equal(snapshot._spendDeltaVsAds, 0);
});

test("un gasto de nivel campana en texto no desactiva el control de descuadre", () => {
  const campaignLevel = mapInsightToParsedRow(
    { campaign_id: "C1", spend: "1010", date_start: "2026-08-10" } as never,
    "2026-08-10",
  );
  assert.ok(campaignLevel);
  // Se fuerza el caso de archivo: el gasto llega como cadena, no como numero.
  campaignLevel.rawRow["Importe gastado (COP)"] = "1.010,00";

  const { snapshot } = buildUnifiedCampaignSnapshot({
    externalCampaignId: "C1",
    campaignName: null,
    ymd: "2026-08-10",
    adRows: anuncios({ spend: "1000" }),
    campaignLevel,
    runId: "run-1",
  });

  assert.equal(snapshot._spendDeltaVsAds, 10);
  assert.equal(snapshot._spendFallbackToAds, undefined);
});

test("la fusion conserva las claves de negocio que el escritor nuevo no trae", () => {
  // Un Excel con pocas columnas no debe borrar lo que dejo la API: son dos vistas del
  // mismo campana-dia, no dos verdades que se excluyan.
  const deLaApi = {
    "Campaign ID": "C1",
    "Importe gastado (COP)": 1000,
    Compras: 3,
    CTR: 1.8,
    _writtenBy: "unified",
    _campaignLevelPass: true,
  };
  const delArchivo = {
    "Campaign ID": "C1",
    "Importe gastado (COP)": 1200,
    "Presupuesto de la campana": 50000,
    _writtenBy: "unified-file",
  };

  const merged = mergeCampaignSnapshot(deLaApi, delArchivo);

  assert.equal(merged.Compras, 3);
  assert.equal(merged.CTR, 1.8);
  assert.equal(merged["Importe gastado (COP)"], 1200);
  assert.equal(merged["Presupuesto de la campana"], 50000);
  // Pero la procedencia es la del escritor nuevo, sin restos de la anterior.
  assert.equal(merged._writtenBy, "unified-file");
  assert.equal(merged._campaignLevelPass, undefined);
  assert.equal(merged._supersededSource, "unified");
});

test("la fusion NO borra el gasto anterior si el nuevo trae la clave pero vacia", () => {
  // Una celda vacia del Excel trae la clave igual. Purgar por la mera presencia de la
  // clave dejaba la fila sin gasto legible y el dashboard bajaba sin motivo.
  const anterior = { "Campaign ID": "C1", "Importe gastado (COP)": 950000 };

  for (const inutil of [null, "", "   ", "no aplica"]) {
    const merged = mergeCampaignSnapshot(anterior, {
      "Campaign ID": "C1",
      "Importe gastado (COP)": inutil as never,
    });
    const sp = spendFromMetaExcelSnapshot(merged);
    assert.equal(sp.amount, 950000, `deberia conservarse el gasto con valor ${JSON.stringify(inutil)}`);
  }

  // Con un valor utilizable si se sustituye, incluso si viene como texto con separadores.
  const bueno = mergeCampaignSnapshot(anterior, {
    "Campaign ID": "C1",
    "Importe gastado (COP)": "1.200.000",
  });
  assert.equal(spendFromMetaExcelSnapshot(bueno).amount, 1200000);
});
