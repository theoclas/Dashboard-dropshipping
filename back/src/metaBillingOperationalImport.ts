import * as advertisingAccountService from "./advertisingAccountService";
import { billingImportDedupeKey } from "./operationalExpenseBillingUpsert";
import { toMetricRecordDate } from "./excelImportHelpers";
import {
  fetchMetaBillingActivitiesForAccount,
  type MetaBillingActivityNormalized,
} from "./metaBillingActivitiesService";
import { upsertOperationalExpenseFromBilling } from "./operationalExpenseBillingUpsert";

export type MetaBillingApiPreviewRow = {
  eventTime: string | null;
  eventType: string;
  translatedEventType: string | null;
  amount: number | null;
  currency: string | null;
  concepto: string;
  transactionId: string | null;
};

export type MetaBillingApiImportResult = {
  accountsCreated: number;
  expensesCreated: number;
  expensesUpdated: number;
  expensesSkipped: number;
  activitiesFetched: number;
  billingEventsMatched: number;
  pagesFetched: number;
  since: string;
  until: string;
  metaAccountId: string;
  errors: string[];
  preview?: MetaBillingApiPreviewRow[];
};

export type MetaBillingApiImportOptions = {
  advertisingAccountId: string;
  metaAdsAppId?: string | null;
  metaAdsSystemUserId?: string | null;
  since?: string | null;
  until?: string | null;
};

function toPreviewRow(row: MetaBillingActivityNormalized): MetaBillingApiPreviewRow {
  return {
    eventTime: row.eventTime?.toISOString() ?? null,
    eventType: row.eventType,
    translatedEventType: row.translatedEventType,
    amount: row.amount,
    currency: row.currency,
    concepto: row.concepto,
    transactionId: row.transactionId,
  };
}

async function fetchForAdvertisingAccount(companyId: string, opts: MetaBillingApiImportOptions) {
  const acc = await advertisingAccountService.getAdvertisingAccount(companyId, opts.advertisingAccountId);
  if (!acc) throw new Error("Cuenta publicitaria no encontrada.");

  const fetchResult = await fetchMetaBillingActivitiesForAccount(acc.metaAccountId, {
    metaAdsAppId: opts.metaAdsAppId,
    metaAdsSystemUserId: opts.metaAdsSystemUserId,
    since: opts.since,
    until: opts.until,
  });

  return { acc, fetchResult };
}

export async function previewMetaBillingApiImport(
  companyId: string,
  opts: MetaBillingApiImportOptions,
): Promise<MetaBillingApiImportResult> {
  const { acc, fetchResult } = await fetchForAdvertisingAccount(companyId, opts);

  return {
    accountsCreated: 0,
    expensesCreated: 0,
    expensesUpdated: 0,
    expensesSkipped: 0,
    activitiesFetched: fetchResult.rawCount,
    billingEventsMatched: fetchResult.billingCharges.length,
    pagesFetched: fetchResult.pagesFetched,
    since: fetchResult.since,
    until: fetchResult.until,
    metaAccountId: acc.metaAccountId,
    errors: fetchResult.errors,
    preview: fetchResult.billingCharges.map(toPreviewRow),
  };
}

export async function importMetaBillingApiToOperationalExpenses(
  companyId: string,
  createdByUserId: string | null,
  opts: MetaBillingApiImportOptions,
): Promise<MetaBillingApiImportResult> {
  const { acc, fetchResult } = await fetchForAdvertisingAccount(companyId, opts);
  const errors = [...fetchResult.errors];

  let accountsCreated = 0;
  let expensesCreated = 0;
  let expensesUpdated = 0;
  let expensesSkipped = 0;
  const seen = new Set<string>();

  for (const charge of fetchResult.billingCharges) {
    const fecha = charge.eventTime!;
    const amount = charge.amount!;
    const dedupeKey = billingImportDedupeKey(acc.metaAccountId, charge.concepto, fecha, amount);
    if (seen.has(dedupeKey)) {
      expensesSkipped += 1;
      continue;
    }
    seen.add(dedupeKey);

    try {
      const { accountCreated, created, updated } = await upsertOperationalExpenseFromBilling(
        companyId,
        createdByUserId,
        acc.metaAccountId,
        acc.businessName,
        toMetricRecordDate(fecha),
        amount,
        charge.concepto,
      );
      if (accountCreated) accountsCreated += 1;
      if (updated) expensesUpdated += 1;
      else if (created) expensesCreated += 1;
    } catch (e) {
      errors.push(`${charge.concepto}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    accountsCreated,
    expensesCreated,
    expensesUpdated,
    expensesSkipped,
    activitiesFetched: fetchResult.rawCount,
    billingEventsMatched: fetchResult.billingCharges.length,
    pagesFetched: fetchResult.pagesFetched,
    since: fetchResult.since,
    until: fetchResult.until,
    metaAccountId: acc.metaAccountId,
    errors,
    preview: fetchResult.billingCharges.map(toPreviewRow),
  };
}
