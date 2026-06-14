export type MetaInsightApiRow = Record<string, unknown>;

export type FetchCampaignInsightsResult = {
  rows: MetaInsightApiRow[];
  reportDate: string;
  accountId: string;
  pagesFetched: number;
  errors: string[];
};

const DEFAULT_API_VERSION = "v25.0";
const DEFAULT_TIMEZONE = "America/Bogota";
const INSIGHT_FIELDS = [
  "account_id",
  "account_name",
  "campaign_id",
  "campaign_name",
  "spend",
  "actions",
  "action_values",
  "cost_per_action_type",
  "purchase_roas",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "cpc",
  "cpm",
  "date_start",
  "date_stop",
].join(",");

import { resolveMetaAccessToken } from "./metaAdsTokenResolver";

function metaApiVersion(): string {
  return (process.env.META_API_VERSION?.trim() || DEFAULT_API_VERSION).replace(/^\/+|\/+$/g, "");
}

export function metaTimezone(): string {
  return process.env.META_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
}

/** Ayer en zona horaria configurada (YYYY-MM-DD). */
export function yesterdayYmdInTimezone(timeZone = metaTimezone()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const todayUtc = new Date(Date.UTC(y, m - 1, d));
  todayUtc.setUTCDate(todayUtc.getUTCDate() - 1);
  const yy = todayUtc.getUTCFullYear();
  const mm = String(todayUtc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(todayUtc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** `1471976967613858` → `act_1471976967613858` */
export function toMetaActAccountId(metaAccountId: string): string {
  const id = metaAccountId.trim().replace(/^act_/i, "");
  if (!/^\d+$/.test(id)) {
    throw new Error(`ID de cuenta Meta inválido: ${metaAccountId}`);
  }
  return `act_${id}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GraphInsightsResponse = {
  data?: MetaInsightApiRow[];
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number };
};

async function fetchJsonWithRetry(url: string, accessToken: string, attempt = 0): Promise<GraphInsightsResponse> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let body: GraphInsightsResponse;
  try {
    body = (await res.json()) as GraphInsightsResponse;
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

function buildInsightsUrl(actId: string, reportDate: string): string {
  const version = metaApiVersion();
  const base = `https://graph.facebook.com/${version}/${actId}/insights`;
  const params = new URLSearchParams({
    level: "campaign",
    time_range: JSON.stringify({ since: reportDate, until: reportDate }),
    fields: INSIGHT_FIELDS,
    limit: "500",
  });
  return `${base}?${params.toString()}`;
}

export async function fetchCampaignInsightsForAccount(
  metaAccountId: string,
  opts?: {
    reportDate?: string;
    metaAdsAppId?: string | null;
    metaAdsSystemUserId?: string | null;
  },
): Promise<FetchCampaignInsightsResult> {
  const date = opts?.reportDate ?? yesterdayYmdInTimezone();
  const actId = toMetaActAccountId(metaAccountId);
  const accessToken = await resolveMetaAccessToken({
    metaAdsAppId: opts?.metaAdsAppId,
    metaAdsSystemUserId: opts?.metaAdsSystemUserId,
  });
  const errors: string[] = [];
  const rows: MetaInsightApiRow[] = [];

  let url: string | null = buildInsightsUrl(actId, date);
  let pagesFetched = 0;

  while (url) {
    pagesFetched += 1;
    const page = await fetchJsonWithRetry(url, accessToken);
    const chunk = page.data ?? [];
    rows.push(...chunk);
    url = page.paging?.next ?? null;
  }

  if (rows.length === 0) {
    errors.push(`Sin filas de insights para ${actId} en ${date}.`);
  }

  return {
    rows,
    reportDate: date,
    accountId: actId,
    pagesFetched,
    errors,
  };
}
