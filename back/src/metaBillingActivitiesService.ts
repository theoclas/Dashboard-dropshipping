import { parseMetaBillingMoney } from "./importMetaBillingOperationalCsv";
import { resolveMetaAccessToken, type MetaAccessTokenResolveInput } from "./metaAdsTokenResolver";
import { metaTimezone, toMetaActAccountId } from "./metaAdsInsightsService";

const DEFAULT_API_VERSION = "v25.0";
const MAX_PAGES = 50;

const BILLING_CHARGE_EVENT_TYPES = new Set([
  "ad_account_billing_charge",
  "ad_account_billing_charge_back",
  "ad_account_billing_chargeback",
]);

export type MetaBillingActivityRaw = {
  event_time?: string;
  event_type?: string;
  translated_event_type?: string;
  actor_name?: string;
  object_id?: string;
  object_name?: string;
  extra_data?: unknown;
};

export type MetaBillingActivityNormalized = {
  eventTime: Date | null;
  eventType: string;
  translatedEventType: string | null;
  actorName: string | null;
  objectId: string | null;
  objectName: string | null;
  transactionId: string | null;
  invoiceId: string | null;
  amount: number | null;
  currency: string | null;
  concepto: string;
  rawExtraData: unknown;
  rawJson: MetaBillingActivityRaw;
};

function metaApiVersion(): string {
  return (process.env.META_API_VERSION?.trim() || DEFAULT_API_VERSION).replace(/^\/+|\/+$/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GraphListResponse = {
  data?: MetaBillingActivityRaw[];
  paging?: { next?: string };
  error?: { message?: string; code?: number };
};

async function fetchJsonWithRetry(url: string, accessToken: string, attempt = 0): Promise<GraphListResponse> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  let body: GraphListResponse;
  try {
    body = (await res.json()) as GraphListResponse;
  } catch {
    body = {};
  }

  if (body.error) {
    const msg = body.error.message ?? "Error desconocido de Meta API";
    const code = body.error.code;
    if ((res.status === 429 || res.status >= 500 || code === 4 || code === 17) && attempt < 3) {
      await sleep(500 * 2 ** attempt);
      return fetchJsonWithRetry(url, accessToken, attempt + 1);
    }
    throw new Error(`Meta API: ${msg}${code != null ? ` (código ${code})` : ""}`);
  }

  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(500 * 2 ** attempt);
      return fetchJsonWithRetry(url, accessToken, attempt + 1);
    }
    throw new Error(`Meta API HTTP ${res.status}`);
  }

  return body;
}

export function parseMetaActivityExtraData(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return {};
    try {
      const parsed = JSON.parse(s) as unknown;
      if (typeof parsed === "object" && parsed && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return { raw_text: s };
    }
  }
  return {};
}

function pickString(extra: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = extra[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function pickAmount(extra: Record<string, unknown>): number | null {
  const keys = [
    "new_value",
    "amount",
    "value",
    "spend",
    "transaction_amount",
    "charge_amount",
    "billing_amount",
    "total_amount",
  ];
  for (const k of keys) {
    const n = parseMetaBillingMoney(extra[k]);
    if (n != null && n > 0) return n;
  }
  const nested = extra.transaction ?? extra.payment ?? extra.charge;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return pickAmount(nested as Record<string, unknown>);
  }
  return null;
}

export function parseMetaActivityEventTime(raw: string | undefined): Date | null {
  if (!raw?.trim()) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function normalizeMetaBillingActivity(row: MetaBillingActivityRaw): MetaBillingActivityNormalized | null {
  const eventType = String(row.event_type ?? "").trim();
  if (!eventType) return null;

  const extra = parseMetaActivityExtraData(row.extra_data);
  const objectId = row.object_id != null ? String(row.object_id).trim() : null;
  const transactionId =
    pickString(extra, "transaction_id", "transactionId", "payment_id", "paymentId", "id") ?? objectId;
  const invoiceId = pickString(extra, "invoice_id", "invoiceId", "billing_invoice_id");
  const amount = pickAmount(extra);
  const currency = pickString(extra, "currency", "currency_code");

  const txLabel = transactionId ? ` ${transactionId}` : "";
  const concepto = transactionId
    ? invoiceId && !transactionId.includes(invoiceId)
      ? `Facturación Meta ${transactionId}-${invoiceId}`
      : `Facturación Meta ${transactionId}`
    : `Actividad pago Meta ${eventType}${txLabel}`.trim();

  return {
    eventTime: parseMetaActivityEventTime(row.event_time),
    eventType,
    translatedEventType: row.translated_event_type?.trim() || null,
    actorName: row.actor_name?.trim() || null,
    objectId,
    objectName: row.object_name?.trim() || null,
    transactionId,
    invoiceId,
    amount,
    currency,
    concepto,
    rawExtraData: extra,
    rawJson: row,
  };
}

export function isMetaBillingChargeEvent(eventType: string): boolean {
  return BILLING_CHARGE_EVENT_TYPES.has(eventType.trim());
}

function ymdRangeToUnix(sinceYmd: string, untilYmd: string): { since: number; until: number } {
  const [sy, sm, sd] = sinceYmd.split("-").map(Number);
  const [uy, um, ud] = untilYmd.split("-").map(Number);
  const since = Math.floor(Date.UTC(sy, sm - 1, sd, 0, 0, 0) / 1000);
  const until = Math.floor(Date.UTC(uy, um - 1, ud + 1, 0, 0, 0) / 1000) - 1;
  return { since, until };
}

export function resolveMetaBillingDateRange(since?: string | null, until?: string | null): { since: string; until: string } {
  const tz = metaTimezone();
  const today = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const todayYmd = fmt.format(today);

  const untilYmd = until?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(until.trim()) ? until.trim() : todayYmd;
  let sinceYmd = since?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(since.trim()) ? since.trim() : untilYmd;

  if (sinceYmd > untilYmd) {
    return { since: untilYmd, until: sinceYmd };
  }
  if (untilYmd > todayYmd) throw new Error("No se puede consultar un rango en el futuro.");

  return { since: sinceYmd, until: untilYmd };
}

function buildActivitiesUrl(actId: string, sinceYmd: string, untilYmd: string): string {
  const version = metaApiVersion();
  const { since, until } = ymdRangeToUnix(sinceYmd, untilYmd);
  const fields = [
    "event_time",
    "event_type",
    "translated_event_type",
    "actor_name",
    "object_id",
    "object_name",
    "extra_data",
  ].join(",");
  const params = new URLSearchParams({
    fields,
    since: String(since),
    until: String(until),
    limit: "100",
  });
  return `https://graph.facebook.com/${version}/${actId}/activities?${params.toString()}`;
}

export type FetchMetaBillingActivitiesResult = {
  activities: MetaBillingActivityNormalized[];
  billingCharges: MetaBillingActivityNormalized[];
  pagesFetched: number;
  rawCount: number;
  since: string;
  until: string;
  accountApiId: string;
  errors: string[];
};

export async function fetchMetaBillingActivitiesForAccount(
  metaAccountId: string,
  opts?: MetaAccessTokenResolveInput & { since?: string | null; until?: string | null },
): Promise<FetchMetaBillingActivitiesResult> {
  const range = resolveMetaBillingDateRange(opts?.since, opts?.until);
  const actId = toMetaActAccountId(metaAccountId);
  const accessToken = await resolveMetaAccessToken({
    metaAdsAppId: opts?.metaAdsAppId,
    metaAdsSystemUserId: opts?.metaAdsSystemUserId,
  });

  const errors: string[] = [];
  const rawRows: MetaBillingActivityRaw[] = [];
  let url: string | null = buildActivitiesUrl(actId, range.since, range.until);
  let pagesFetched = 0;

  while (url && pagesFetched < MAX_PAGES) {
    pagesFetched += 1;
    const page = await fetchJsonWithRetry(url, accessToken);
    rawRows.push(...(page.data ?? []));
    url = page.paging?.next ?? null;
  }

  if (pagesFetched >= MAX_PAGES && url) {
    errors.push(`Se alcanzó el límite de ${MAX_PAGES} páginas; puede haber más actividades.`);
  }

  const activities: MetaBillingActivityNormalized[] = [];
  for (const raw of rawRows) {
    const norm = normalizeMetaBillingActivity(raw);
    if (norm) activities.push(norm);
  }

  const billingCharges = activities.filter(
    (a) => isMetaBillingChargeEvent(a.eventType) && a.amount != null && a.amount > 0 && a.eventTime != null,
  );

  if (rawRows.length === 0) {
    errors.push(`Sin actividades para ${actId} entre ${range.since} y ${range.until}.`);
  } else if (billingCharges.length === 0) {
    errors.push(
      `Se obtuvieron ${rawRows.length} actividades pero ningún cargo de facturación con monto en el rango.`,
    );
  }

  return {
    activities,
    billingCharges,
    pagesFetched,
    rawCount: rawRows.length,
    since: range.since,
    until: range.until,
    accountApiId: actId,
    errors,
  };
}
