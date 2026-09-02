import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import * as advertisingAccountService from "./advertisingAccountService";
import { linkCampaignToProduct } from "./advertisingCampaignService";
import { persistAdsForAccount } from "./adImportService";
import {
  fetchAdInsightsForAccountRange,
  fetchCampaignInsightsForAccountRange,
  validateAdApiDateRange,
} from "./metaAdsAdInsightsService";
import { mapAdInsightRows, type ParsedAdRow } from "./metaAdInsightNormalize";
import { mapInsightToParsedRow } from "./metaApiInsightNormalize";
import {
  normalizeCampaignMapKey,
  parseMetaCampaignMetricsExcel,
  spendFromMetaExcelSnapshot,
  type ParsedMetaCampaignRow,
} from "./metaCampaignExcelParse";
import {
  buildUnifiedCampaignSnapshot,
  mergeCampaignSnapshot,
  type CampaignSnapshot,
} from "./unifiedCampaignSnapshot";
import { resolveImportScope } from "./unifiedImportScope";
import type {
  ResolvedImportScope,
  UnifiedImportResult,
  UnifiedImportScope,
} from "./unifiedImportTypes";

/**
 * Orquestador del import unificado.
 *
 * Una pasada por cuenta y rango alimenta los tres niveles (anuncio, conjunto, campaña) y,
 * cuando corresponde, vincula las campañas al producto. Sustituye a los dos caminos
 * actuales, que consultaban Meta por separado y se pisaban el snapshot mutuamente.
 */

/**
 * El rango se trocea aunque la API acepte hasta 92 días.
 *
 * El motivo no es el límite de la API sino el tope de páginas: a nivel anuncio, un rango
 * largo con varias cuentas puede pasar de 30.000 filas, y una consulta truncada se
 * escribiría como si estuviera completa, bajando el gasto del dashboard sin avisar.
 */
export const UNIFIED_CHUNK_DAYS = 31;

const MS_DAY = 86_400_000;

function utcDay(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymdOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parte `[desde, hasta]` en tramos de como mucho `maxDays` días. */
export function chunkRange(
  desde: string,
  hasta: string,
  maxDays = UNIFIED_CHUNK_DAYS,
): Array<{ desde: string; hasta: string }> {
  const start = utcDay(desde);
  const end = utcDay(hasta);
  if (end < start) return chunkRange(hasta, desde, maxDays);

  const out: Array<{ desde: string; hasta: string }> = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + (maxDays - 1) * MS_DAY, end.getTime()));
    out.push({ desde: ymdOf(cursor), hasta: ymdOf(chunkEnd) });
    cursor = new Date(chunkEnd.getTime() + MS_DAY);
  }
  return out;
}

function bucketKey(externalCampaignId: string, ymd: string): string {
  return `${normalizeCampaignMapKey(externalCampaignId)}|${ymd}`;
}

export type UnifiedImportOptions = {
  scope: UnifiedImportScope;
  desde: string;
  hasta: string;
  /** Hace todo el trabajo menos escribir. Devuelve lo que escribiría y el diff. */
  dryRun?: boolean;
  /**
   * Segunda llamada a nivel campaña. Encendida por defecto: sin ella se pierde el
   * alcance real y las conversiones cambian de ventana de atribución.
   */
  withCampaignLevelPass?: boolean;
  useShopifySessions?: boolean;
  /** `{ "2026-08-10": { "C1": 42 } }`, por ID externo de campaña normalizado. */
  shopifySessionsByDayAndCampaign?: Record<string, Record<string, number>>;
  metaAdsAppId?: string | null;
  metaAdsSystemUserId?: string | null;
  /** Para reutilizar filas ya traídas en la vista previa. */
  runId?: string;
};

/** Lo que se trajo de Meta para una cuenta, ya normalizado. */
type FetchedAccount = {
  advertisingAccountId: string;
  metaAccountId: string;
  parsed: ParsedAdRow[];
  /** Fila de nivel campaña por `campañaExterna|ymd`. */
  campaignLevelByKey: Map<string, ParsedMetaCampaignRow>;
  errors: string[];
  /** `true` si la cuenta no se puede escribir (datos incompletos). */
  failed: boolean;
};

/**
 * Caché en memoria de lo traído de Meta, para que "Importar" no vuelva a pegarle a la API
 * después de la vista previa.
 *
 * Vive en el proceso: con una sola instancia funciona, con réplicas cada una tendría la
 * suya y la segunda llamada volvería a consultar Meta. No es un fallo silencioso —
 * simplemente se refresca— pero conviene saberlo antes de escalar horizontalmente.
 */
const RUN_CACHE = new Map<string, { at: number; accounts: FetchedAccount[] }>();
const RUN_CACHE_TTL_MS = 10 * 60 * 1000;

function cacheGet(runId: string): FetchedAccount[] | null {
  const hit = RUN_CACHE.get(runId);
  if (!hit) return null;
  if (Date.now() - hit.at > RUN_CACHE_TTL_MS) {
    RUN_CACHE.delete(runId);
    return null;
  }
  return hit.accounts;
}

function cachePut(runId: string, accounts: FetchedAccount[]): void {
  for (const [k, v] of RUN_CACHE) {
    if (Date.now() - v.at > RUN_CACHE_TTL_MS) RUN_CACHE.delete(k);
  }
  RUN_CACHE.set(runId, { at: Date.now(), accounts });
}

/** Trae de Meta todo lo de una cuenta para el rango, tramo a tramo. */
async function fetchAccount(
  companyId: string,
  advertisingAccountId: string,
  chunks: Array<{ desde: string; hasta: string }>,
  opts: UnifiedImportOptions,
): Promise<FetchedAccount> {
  const account = await advertisingAccountService.getAdvertisingAccount(
    companyId,
    advertisingAccountId,
  );
  if (!account) {
    return {
      advertisingAccountId,
      metaAccountId: "",
      parsed: [],
      campaignLevelByKey: new Map(),
      errors: [`Cuenta publicitaria ${advertisingAccountId} no encontrada.`],
      failed: true,
    };
  }

  const out: FetchedAccount = {
    advertisingAccountId,
    metaAccountId: account.metaAccountId,
    parsed: [],
    campaignLevelByKey: new Map(),
    errors: [],
    failed: false,
  };

  const credenciales = {
    companyId,
    metaAdsAppId: opts.metaAdsAppId,
    metaAdsSystemUserId: opts.metaAdsSystemUserId,
  };

  for (const chunk of chunks) {
    const fetched = await fetchAdInsightsForAccountRange(account.metaAccountId, {
      ...credenciales,
      desde: chunk.desde,
      hasta: chunk.hasta,
    });

    // Un tramo truncado invalida la cuenta entera: escribir un rango incompleto borra
    // métricas buenas y las sustituye por menos de las que había.
    if (fetched.truncated) {
      out.failed = true;
      out.errors.push(...fetched.errors);
      return out;
    }
    // "Sin filas" no es un error: una cuenta puede no haber gastado en ese tramo.
    out.errors.push(...fetched.errors.filter((e) => !e.startsWith("Sin filas")));

    const { parsed, errors: mapErrors } = mapAdInsightRows(fetched.rows);
    out.parsed.push(...parsed);
    out.errors.push(...mapErrors);
  }

  if (opts.withCampaignLevelPass === false) return out;

  for (const chunk of chunks) {
    try {
      const campaña = await fetchCampaignInsightsForAccountRange(account.metaAccountId, {
        ...credenciales,
        desde: chunk.desde,
        hasta: chunk.hasta,
      });

      if (campaña.truncated) {
        // Aquí sí se puede seguir: sin esta pasada el nivel campaña se deriva de los
        // anuncios y la fila queda marcada como alcance estimado.
        out.errors.push(...campaña.errors);
        out.campaignLevelByKey.clear();
        return out;
      }

      for (const row of campaña.rows) {
        const ymd = typeof row.date_start === "string" ? row.date_start : null;
        if (!ymd) continue;
        const mapped = mapInsightToParsedRow(row, ymd);
        if (!mapped) continue;
        out.campaignLevelByKey.set(bucketKey(mapped.externalCampaignId, ymd), mapped);
      }
    } catch (e) {
      out.errors.push(
        `No se pudo leer el nivel campaña de ${account.metaAccountId} (se deriva de los ` +
          `anuncios): ${e instanceof Error ? e.message : String(e)}`,
      );
      out.campaignLevelByKey.clear();
      return out;
    }
  }

  return out;
}

type Bucket = {
  externalCampaignId: string;
  campaignName: string | null;
  ymd: string;
  recordDate: Date;
  adRows: ParsedAdRow[];
};

/** Agrupa las filas de anuncio por campaña y día. */
function bucketsOf(parsed: ParsedAdRow[]): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const r of parsed) {
    const key = bucketKey(r.externalCampaignId, r.ymd);
    let b = buckets.get(key);
    if (!b) {
      b = {
        externalCampaignId: r.externalCampaignId,
        campaignName: r.campaignName,
        ymd: r.ymd,
        recordDate: r.recordDate,
        adRows: [],
      };
      buckets.set(key, b);
    }
    if (r.campaignName && !b.campaignName) b.campaignName = r.campaignName;
    b.adRows.push(r);
  }
  return buckets;
}

/** Fila de nivel campaña que se escribiría; se usa igual en simulación y en escritura. */
export type PlannedCampaignRow = {
  externalCampaignId: string;
  campaignName: string | null;
  ymd: string;
  recordDate: Date;
  snapshot: CampaignSnapshot;
  metaLinkClicks: number | null;
  metaConversationsStarted: number | null;
  shopifySessions: number | null;
  spend: number;
  /** Gasto que hay hoy en base para ese campaña-día; `null` si la fila no existe. */
  previousSpend: number | null;
};

export async function runUnifiedImport(
  companyId: string,
  opts: UnifiedImportOptions,
): Promise<UnifiedImportResult & { planned: PlannedCampaignRow[] }> {
  const runId = opts.runId ?? randomUUID();
  const scope = await resolveImportScope(companyId, opts.scope);

  const v = validateAdApiDateRange(opts.desde, opts.hasta);
  if (!v.ok) throw new Error(v.message);

  const chunks = chunkRange(v.desde, v.hasta);
  const warnings = [...scope.warnings];
  const errors: string[] = [];

  if (chunks.length > 1) {
    warnings.push(
      `El rango se consultará en ${chunks.length} tramos de hasta ${UNIFIED_CHUNK_DAYS} días ` +
        `para no truncar los datos.`,
    );
  }

  // ── Traer de Meta (o reutilizar lo de la vista previa) ─────────────────────
  let accounts = opts.runId ? cacheGet(opts.runId) : null;
  if (!accounts) {
    accounts = [];
    for (const accountId of scope.advertisingAccountIds) {
      try {
        accounts.push(await fetchAccount(companyId, accountId, chunks, opts));
      } catch (e) {
        errors.push(`Cuenta ${accountId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    cachePut(runId, accounts);
  }

  const result: UnifiedImportResult & { planned: PlannedCampaignRow[] } = {
    runId,
    scope,
    desde: v.desde,
    hasta: v.hasta,
    chunks,
    dryRun: opts.dryRun === true,
    counters: {
      accountsQueried: accounts.length,
      adRowsFetched: 0,
      campaignsTouched: 0,
      adSetsTouched: 0,
      adsTouched: 0,
      adMetricsWritten: 0,
      campaignMetricsWritten: 0,
      linksCreated: 0,
    },
    unlinkedCampaigns: [],
    linkConflicts: [],
    warnings,
    errors,
    planned: [],
  };

  const seleccion = scope.selectedCampaignIds
    ? new Set(scope.selectedCampaignIds)
    : null;
  const touchedCampaignIds = new Set<string>();
  /** ID externo normalizado -> ID interno, acumulado entre cuentas. */
  const touchedByExt = new Map<string, string>();

  for (const acc of accounts) {
    result.errors.push(...acc.errors);
    if (acc.failed) {
      result.errors.push(
        `La cuenta ${acc.metaAccountId || acc.advertisingAccountId} se omitió por completo ` +
          `para no escribir datos incompletos.`,
      );
      continue;
    }

    // Solo se escribe lo seleccionado. Se filtra ANTES de persistir para que una campaña
    // descartada no cree jerarquía ni borre métricas de anuncios.
    const parsed = seleccion
      ? acc.parsed.filter((r) => seleccion.has(normalizeCampaignMapKey(r.externalCampaignId)))
      : acc.parsed;

    result.counters.adRowsFetched += parsed.length;

    // Buckets sembrados por los DOS niveles.
    //
    // Antes solo se recorrían las filas de anuncio, y la pasada de campaña se limitaba a
    // decorar un bucket que ya existiera. Con eso, todo campaña-día con gasto a nivel
    // campaña pero sin filas a nivel anuncio desaparecía sin dejar rastro: Meta omite en
    // `level=ad` los anuncios borrados, pero conserva su gasto en `level=campaign`. Una
    // cuenta cuya consulta de anuncios volviera vacía no escribía absolutamente nada.
    //
    // Es la diferencia con Campañas Meta, que escribe directo desde el nivel campaña.
    const buckets = bucketsOf(parsed);
    for (const [key, fila] of acc.campaignLevelByKey) {
      if (buckets.has(key)) continue;
      const extKey = normalizeCampaignMapKey(fila.externalCampaignId);
      if (seleccion && !seleccion.has(extKey)) continue;
      buckets.set(key, {
        externalCampaignId: fila.externalCampaignId,
        campaignName: fila.displayName ?? null,
        ymd: ymdOf(fila.recordDate),
        recordDate: fila.recordDate,
        adRows: [],
      });
    }

    if (buckets.size === 0) continue;

    let campaignIdByExt = new Map<string, string>();
    if (!opts.dryRun) {
      const persisted = await persistAdsForAccount(companyId, acc.advertisingAccountId, parsed, {
        metaAccountId: acc.metaAccountId,
        desde: v.desde,
        hasta: v.hasta,
        metaAdsAppId: opts.metaAdsAppId,
        metaAdsSystemUserId: opts.metaAdsSystemUserId,
        errors: result.errors,
      });
      campaignIdByExt = persisted.campaignIdByExt;
      result.counters.campaignsTouched += persisted.campaignIdByExt.size;
      result.counters.adSetsTouched += persisted.adSetIdByExt.size;
      result.counters.adsTouched += persisted.adIdByExt.size;
      result.counters.adMetricsWritten += persisted.counters.adMetricsWritten;
      for (const id of persisted.campaignIdByExt.values()) touchedCampaignIds.add(id);
    } else {
      // En simulación se leen los IDs que ya existen, sin crear nada.
      const exts = [...new Set([...buckets.values()].map((b) => b.externalCampaignId))];
      const existentes = await prisma.advertisingCampaign.findMany({
        where: { companyId, externalCampaignId: { in: exts } },
        select: { id: true, externalCampaignId: true },
      });
      for (const c of existentes) campaignIdByExt.set(c.externalCampaignId, c.id);
      for (const c of existentes) touchedCampaignIds.add(c.id);
      result.counters.campaignsTouched += exts.length;
      result.counters.adsTouched += new Set(parsed.map((r) => r.externalAdId)).size;
      result.counters.adSetsTouched += new Set(parsed.map((r) => r.externalAdSetId)).size;
      result.counters.adMetricsWritten += parsed.length;
    }

    // Campañas que solo aparecen a nivel campaña: `persistAdsForAccount` no las conoce
    // porque no cuelgan de ningún anuncio de esta consulta.
    for (const b of buckets.values()) {
      if (campaignIdByExt.has(b.externalCampaignId)) continue;

      const existente = await prisma.advertisingCampaign.findUnique({
        where: {
          companyId_externalCampaignId: {
            companyId,
            externalCampaignId: b.externalCampaignId,
          },
        },
        select: { id: true },
      });
      if (existente) {
        campaignIdByExt.set(b.externalCampaignId, existente.id);
        touchedCampaignIds.add(existente.id);
        continue;
      }
      if (opts.dryRun) continue;

      const creada = await prisma.advertisingCampaign.create({
        data: {
          companyId,
          externalCampaignId: b.externalCampaignId,
          displayName: b.campaignName,
          advertisingAccountId: acc.advertisingAccountId,
        },
        select: { id: true },
      });
      campaignIdByExt.set(b.externalCampaignId, creada.id);
      touchedCampaignIds.add(creada.id);
      result.counters.campaignsTouched += 1;
    }

    for (const [ext, id] of campaignIdByExt) touchedByExt.set(normalizeCampaignMapKey(ext), id);

    // ── Nivel campaña ────────────────────────────────────────────────────────
    const previos = await loadPreviousMetrics(companyId, [...campaignIdByExt.values()], v);

    for (const b of buckets.values()) {
      const key = bucketKey(b.externalCampaignId, b.ymd);
      const built = buildUnifiedCampaignSnapshot({
        externalCampaignId: b.externalCampaignId,
        campaignName: b.campaignName,
        ymd: b.ymd,
        adRows: b.adRows,
        campaignLevel: acc.campaignLevelByKey.get(key) ?? null,
        runId,
      });

      const campaignId = campaignIdByExt.get(b.externalCampaignId);
      const previo = campaignId ? previos.get(`${campaignId}|${b.ymd}`) : undefined;
      const snapshot = mergeCampaignSnapshot(previo?.metaExcelSnapshot ?? null, built.snapshot);

      const shopify = resolveShopifySessions(opts, b.ymd, b.externalCampaignId);

      const plan: PlannedCampaignRow = {
        externalCampaignId: b.externalCampaignId,
        campaignName: b.campaignName,
        ymd: b.ymd,
        recordDate: b.recordDate,
        snapshot,
        metaLinkClicks: built.metaLinkClicks,
        metaConversationsStarted: built.metaConversationsStarted,
        shopifySessions: shopify,
        spend: spendFromMetaExcelSnapshot(snapshot).amount,
        previousSpend: previo ? spendFromMetaExcelSnapshot(previo.metaExcelSnapshot).amount : null,
      };
      result.planned.push(plan);

      if (opts.dryRun || !campaignId) continue;

      try {
        await prisma.advertisingCampaignMetric.upsert({
          where: { campaignId_recordDate: { campaignId, recordDate: b.recordDate } },
          create: {
            companyId,
            campaignId,
            recordDate: b.recordDate,
            metaLinkClicks: plan.metaLinkClicks,
            metaConversationsStarted: plan.metaConversationsStarted,
            shopifySessions: shopify,
            metaExcelSnapshot: snapshot as Prisma.InputJsonValue,
          },
          update: {
            metaLinkClicks: plan.metaLinkClicks,
            metaConversationsStarted: plan.metaConversationsStarted,
            // Solo se toca si el usuario mandó sesiones para ese campaña-día; si no, se
            // conserva lo que hubiera puesto a mano.
            ...(shopify !== null ? { shopifySessions: shopify } : {}),
            metaExcelSnapshot: snapshot as Prisma.InputJsonValue,
          },
        });
        result.counters.campaignMetricsWritten += 1;
      } catch (e) {
        result.errors.push(
          `Nivel campaña ${b.externalCampaignId} ${b.ymd}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }

  await applyProductLinks(companyId, scope, touchedByExt, result, opts.dryRun === true);
  result.unlinkedCampaigns = await reportUnlinkedCampaigns(
    companyId,
    touchedCampaignIds,
    result.planned,
  );

  return result;
}

export type UnifiedFileImportOptions = {
  buffer: Buffer;
  filename?: string;
  scope: UnifiedImportScope;
  dryRun?: boolean;
  useShopifySessions?: boolean;
  shopifySessionsByDayAndCampaign?: Record<string, Record<string, number>>;
};

/**
 * Import desde Excel/CSV, por el **mismo** camino de fusión que el de la API.
 *
 * Esto es lo que arregla el problema viejo: hasta ahora subir un archivo pisaba el
 * snapshot entero y borraba lo que había traído la API (y al revés). Pasando por
 * `mergeCampaignSnapshot`, cada escritor sustituye lo suyo y respeta lo del otro.
 *
 * No toca la jerarquía de anuncios: un archivo de nivel campaña no la contiene.
 */
export async function runUnifiedFileImport(
  companyId: string,
  opts: UnifiedFileImportOptions,
): Promise<UnifiedImportResult & { planned: PlannedCampaignRow[] }> {
  const runId = randomUUID();
  const scope = await resolveImportScope(companyId, opts.scope);

  const { rows, errors: parseErrors } = parseMetaCampaignMetricsExcel(opts.buffer, {
    sourceFilename: opts.filename,
  });

  const seleccion = scope.selectedCampaignIds ? new Set(scope.selectedCampaignIds) : null;
  const usadas = seleccion
    ? rows.filter((r) => seleccion.has(normalizeCampaignMapKey(r.externalCampaignId)))
    : rows;

  const fechas = usadas.map((r) => ymdOf(r.recordDate)).sort();
  const desde = fechas[0] ?? "";
  const hasta = fechas[fechas.length - 1] ?? "";

  const result: UnifiedImportResult & { planned: PlannedCampaignRow[] } = {
    runId,
    scope,
    desde,
    hasta,
    chunks: desde && hasta ? [{ desde, hasta }] : [],
    dryRun: opts.dryRun === true,
    counters: {
      accountsQueried: 0,
      adRowsFetched: 0,
      campaignsTouched: 0,
      adSetsTouched: 0,
      adsTouched: 0,
      adMetricsWritten: 0,
      campaignMetricsWritten: 0,
      linksCreated: 0,
    },
    unlinkedCampaigns: [],
    linkConflicts: [],
    warnings: [...scope.warnings],
    errors: [...parseErrors],
    planned: [],
  };

  if (usadas.length === 0) {
    result.warnings.push("El archivo no tiene filas que importar con el alcance elegido.");
    return result;
  }

  // ── Campañas ─────────────────────────────────────────────────────────────
  const campaignIdByExt = new Map<string, string>();
  const touchedCampaignIds = new Set<string>();
  const touchedByExt = new Map<string, string>();

  const exts = [...new Set(usadas.map((r) => r.externalCampaignId))];
  const existentes = await prisma.advertisingCampaign.findMany({
    where: { companyId, externalCampaignId: { in: exts } },
    select: { id: true, externalCampaignId: true },
  });
  for (const c of existentes) campaignIdByExt.set(c.externalCampaignId, c.id);

  for (const ext of exts) {
    if (campaignIdByExt.has(ext)) continue;
    if (opts.dryRun) continue;
    const nombre = usadas.find((r) => r.externalCampaignId === ext)?.displayName ?? null;
    // Sin cuenta publicitaria: el archivo no dice a cuál pertenece, y adivinarlo sería
    // peor que dejarlo vacío para que se asigne desde Campañas Meta.
    const creada = await prisma.advertisingCampaign.create({
      data: { companyId, externalCampaignId: ext, displayName: nombre },
      select: { id: true },
    });
    campaignIdByExt.set(ext, creada.id);
  }

  for (const [ext, id] of campaignIdByExt) {
    touchedCampaignIds.add(id);
    touchedByExt.set(normalizeCampaignMapKey(ext), id);
  }
  result.counters.campaignsTouched = exts.length;

  // ── Métricas ─────────────────────────────────────────────────────────────
  const previos = await loadPreviousMetrics(companyId, [...campaignIdByExt.values()], {
    desde,
    hasta,
  });

  for (const row of usadas) {
    const ymd = ymdOf(row.recordDate);
    const campaignId = campaignIdByExt.get(row.externalCampaignId);

    const base: CampaignSnapshot = {
      ...(row.rawRow as CampaignSnapshot),
      _writtenBy: "unified-file",
      _unifiedRunId: runId,
      _sourceFilename: opts.filename ?? null,
    };
    const previo = campaignId ? previos.get(`${campaignId}|${ymd}`) : undefined;
    const snapshot = mergeCampaignSnapshot(previo?.metaExcelSnapshot ?? null, base);

    const shopifyManual = resolveShopifySessions(
      { useShopifySessions: opts.useShopifySessions, shopifySessionsByDayAndCampaign: opts.shopifySessionsByDayAndCampaign } as UnifiedImportOptions,
      ymd,
      row.externalCampaignId,
    );
    // Si el archivo trae su propia columna de sesiones y no hay reparto manual, se usa.
    const shopify = shopifyManual ?? row.shopifySessions ?? null;

    result.planned.push({
      externalCampaignId: row.externalCampaignId,
      campaignName: row.displayName ?? null,
      ymd,
      recordDate: row.recordDate,
      snapshot,
      metaLinkClicks: row.metaLinkClicks ?? null,
      metaConversationsStarted: row.metaConversationsStarted ?? null,
      shopifySessions: shopify,
      spend: spendFromMetaExcelSnapshot(snapshot).amount,
      previousSpend: previo ? spendFromMetaExcelSnapshot(previo.metaExcelSnapshot).amount : null,
    });

    if (opts.dryRun || !campaignId) continue;

    try {
      await prisma.advertisingCampaignMetric.upsert({
        where: { campaignId_recordDate: { campaignId, recordDate: row.recordDate } },
        create: {
          companyId,
          campaignId,
          recordDate: row.recordDate,
          metaLinkClicks: row.metaLinkClicks ?? null,
          metaConversationsStarted: row.metaConversationsStarted ?? null,
          shopifySessions: shopify,
          metaExcelSnapshot: snapshot as Prisma.InputJsonValue,
        },
        update: {
          metaLinkClicks: row.metaLinkClicks ?? null,
          metaConversationsStarted: row.metaConversationsStarted ?? null,
          ...(shopify !== null ? { shopifySessions: shopify } : {}),
          metaExcelSnapshot: snapshot as Prisma.InputJsonValue,
        },
      });
      result.counters.campaignMetricsWritten += 1;
    } catch (e) {
      result.errors.push(
        `Fila ${row.externalCampaignId} ${ymd}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  await applyProductLinks(companyId, scope, touchedByExt, result, opts.dryRun === true);
  result.unlinkedCampaigns = await reportUnlinkedCampaigns(
    companyId,
    touchedCampaignIds,
    result.planned,
  );

  return result;
}

/**
 * Vincula al producto las campañas elegidas, con dos guardias.
 *
 * 1. Solo las de `linkCampaignIds`, que ya viene filtrada a lo que el usuario eligió.
 * 2. Si la campaña pertenece a otro producto, no se toca y se reporta.
 *
 * La segunda guardia existe porque `getMetaAdvertisingSpendSummary` suma el gasto
 * completo de una campaña a CADA producto vinculado: robarle una campaña a otro producto
 * no la mueve, la duplica, y el margen de los dos sube sin que nadie lo pida.
 */
async function applyProductLinks(
  companyId: string,
  scope: ResolvedImportScope,
  touchedByExt: Map<string, string>,
  result: UnifiedImportResult,
  dryRun: boolean,
): Promise<void> {
  const productId = scope.catalogProductId;
  if (scope.kind !== "product" || !productId || scope.linkCampaignIds.length === 0) return;

  for (const extKey of scope.linkCampaignIds) {
    const campaignId = touchedByExt.get(extKey);
    // La campaña elegida no apareció en lo que devolvió Meta para este rango.
    if (!campaignId) continue;

    const links = await prisma.catalogProductAdvertisingCampaign.findMany({
      where: { companyId, campaignId },
      select: { catalogProductId: true, catalogProduct: { select: { id: true, name: true } } },
    });

    if (links.some((l) => l.catalogProductId === productId)) continue; // ya estaba

    const ajeno = links[0];
    if (ajeno) {
      const campaña = await prisma.advertisingCampaign.findUnique({
        where: { id: campaignId },
        select: { externalCampaignId: true, displayName: true },
      });
      result.linkConflicts.push({
        campaignId,
        externalCampaignId: campaña?.externalCampaignId ?? extKey,
        displayName: campaña?.displayName ?? null,
        ownedByProductId: ajeno.catalogProduct.id,
        ownedByProductName: ajeno.catalogProduct.name,
      });
      continue;
    }

    if (dryRun) {
      result.counters.linksCreated += 1;
      continue;
    }

    await linkCampaignToProduct(companyId, productId, campaignId);
    result.counters.linksCreated += 1;
  }
}

/**
 * Campañas tocadas en esta corrida que no están ligadas a ningún producto.
 *
 * No es un error: su gasto suma al total del dashboard pero no al desglose por producto
 * ni al CPA. Se listan con su gasto para que se pueda decidir qué hacer con ellas.
 */
async function reportUnlinkedCampaigns(
  companyId: string,
  touchedCampaignIds: Set<string>,
  planned: PlannedCampaignRow[],
): Promise<UnifiedImportResult["unlinkedCampaigns"]> {
  if (touchedCampaignIds.size === 0) return [];

  const huerfanas = await prisma.advertisingCampaign.findMany({
    where: { companyId, id: { in: [...touchedCampaignIds] }, productLinks: { none: {} } },
    select: {
      id: true,
      externalCampaignId: true,
      displayName: true,
      advertisingAccount: { select: { metaAccountId: true, businessName: true } },
    },
  });
  if (huerfanas.length === 0) return [];

  // El gasto ya está calculado en memoria; no hace falta volver a leerlo de base.
  const gasto = new Map<string, { spend: number; days: number }>();
  for (const p of planned) {
    const k = normalizeCampaignMapKey(p.externalCampaignId);
    const acc = gasto.get(k) ?? { spend: 0, days: 0 };
    acc.spend += p.spend;
    if (p.spend > 0) acc.days += 1;
    gasto.set(k, acc);
  }

  return huerfanas
    .map((c) => {
      const g = gasto.get(normalizeCampaignMapKey(c.externalCampaignId));
      return {
        campaignId: c.id,
        externalCampaignId: c.externalCampaignId,
        displayName: c.displayName,
        metaAccountId: c.advertisingAccount?.metaAccountId ?? null,
        accountName: c.advertisingAccount?.businessName ?? null,
        spendInRange: Math.round((g?.spend ?? 0) * 100) / 100,
        daysWithSpend: g?.days ?? 0,
      };
    })
    .sort((a, b) => b.spendInRange - a.spendInRange);
}

/** Sesiones Shopify para un campaña-día, si el usuario las mandó. */
function resolveShopifySessions(
  opts: UnifiedImportOptions,
  ymd: string,
  externalCampaignId: string,
): number | null {
  if (opts.useShopifySessions !== true) return null;
  const delDia = opts.shopifySessionsByDayAndCampaign?.[ymd];
  if (!delDia) return null;
  const v = delDia[normalizeCampaignMapKey(externalCampaignId)];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Filas que ya existen en el rango, para poder fusionar en vez de pisar. */
async function loadPreviousMetrics(
  companyId: string,
  campaignIds: string[],
  rango: { desde: string; hasta: string },
): Promise<Map<string, { metaExcelSnapshot: Prisma.JsonValue }>> {
  const out = new Map<string, { metaExcelSnapshot: Prisma.JsonValue }>();
  if (campaignIds.length === 0) return out;

  const filas = await prisma.advertisingCampaignMetric.findMany({
    where: {
      companyId,
      campaignId: { in: campaignIds },
      recordDate: { gte: utcDay(rango.desde), lte: utcDay(rango.hasta) },
    },
    select: { campaignId: true, recordDate: true, metaExcelSnapshot: true },
  });

  for (const f of filas) {
    out.set(`${f.campaignId}|${ymdOf(f.recordDate)}`, { metaExcelSnapshot: f.metaExcelSnapshot });
  }
  return out;
}

export type { ResolvedImportScope };
