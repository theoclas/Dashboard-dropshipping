import type { PrismaClient } from "@prisma/client";

/** Clasificación por bucket (misma lógica que Petho `pedido-logistica-sql`, adaptada a MySQL). */
const BUCKET_CASE = `(CASE
  WHEN LOWER(COALESCE(p.estado_unificado,'')) LIKE '%cancel%' OR LOWER(COALESCE(p.estado_operativo,'')) LIKE '%cancel%' THEN 'cancelado'
  WHEN LOWER(COALESCE(p.estado_unificado,'')) LIKE '%rechaz%' OR LOWER(COALESCE(p.estado_operativo,'')) LIKE '%rechaz%' THEN 'rechazado'
  WHEN LOWER(COALESCE(p.estado_unificado,'')) LIKE '%devoluci%' OR LOWER(COALESCE(p.estado_operativo,'')) LIKE '%devoluci%' THEN 'devolucion'
  WHEN p.estado_unificado = 'ENTREGADO' OR p.estado_operativo = 'ENTREGADO' THEN 'entregado'
  ELSE 'transito'
END)`;

export type EfectividadTransportadoraRow = {
  empresa: string;
  enviados: number;
  transito: number;
  pctTransito: number;
  devoluciones: number;
  pctDevoluciones: number;
  cancelados: number;
  rechazados: number;
  entregados: number;
  pctEntregados: number;
};

export type ComparativaGeograficaPunto = {
  ubicacion: string;
  transportadora: string;
  valorPct: number;
  numerador: number;
  denominador: number;
};

export type ComparativaGeograficaResponse = {
  dimension: "departamento" | "ciudad";
  metrica: "efectividad" | "devolucion";
  ubicaciones: string[];
  puntos: ComparativaGeograficaPunto[];
};

function parseDateRange(desde?: string, hasta?: string): { start: Date; end: Date } | null {
  if (!desde?.trim() || !hasta?.trim()) return null;
  const [y0, m0, d0] = desde.trim().split("-").map(Number);
  const [y1, m1, d1] = hasta.trim().split("-").map(Number);
  if (![y0, m0, d0, y1, m1, d1].every((n) => Number.isFinite(n))) return null;
  return {
    start: new Date(Date.UTC(y0, m0 - 1, d0, 0, 0, 0, 0)),
    end: new Date(Date.UTC(y1, m1 - 1, d1, 23, 59, 59, 999)),
  };
}

function mapEfectividadRows(
  rows: {
    empresa: string | null;
    enviados: bigint | number;
    transito: bigint | number;
    devoluciones: bigint | number;
    cancelados: bigint | number;
    rechazados: bigint | number;
    entregados: bigint | number;
  }[],
): EfectividadTransportadoraRow[] {
  return rows.map((r) => {
    const enviados = Number(r.enviados) || 0;
    const transito = Number(r.transito) || 0;
    const devoluciones = Number(r.devoluciones) || 0;
    const cancelados = Number(r.cancelados) || 0;
    const rechazados = Number(r.rechazados) || 0;
    const entregados = Number(r.entregados) || 0;
    const den = enviados > 0 ? enviados : 1;
    return {
      empresa: r.empresa ?? "",
      enviados,
      transito,
      pctTransito: Math.round((transito / den) * 1000) / 10,
      devoluciones,
      pctDevoluciones: Math.round((devoluciones / den) * 1000) / 10,
      cancelados,
      rechazados,
      entregados,
      pctEntregados: Math.round((entregados / den) * 1000) / 10,
    };
  });
}

export async function queryEfectividadTransportadoras(
  prisma: PrismaClient,
  companyId: string,
  params: { desde?: string; hasta?: string; transportadora?: string },
): Promise<EfectividadTransportadoraRow[]> {
  const dr = parseDateRange(params.desde, params.hasta);
  const tLike = params.transportadora?.trim() ? `%${params.transportadora.trim()}%` : null;

  const sql = `
SELECT TRIM(p.transportadora) AS empresa,
  COUNT(*) AS enviados,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'transito' THEN 1 ELSE 0 END) AS transito,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'devolucion' THEN 1 ELSE 0 END) AS devoluciones,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'cancelado' THEN 1 ELSE 0 END) AS cancelados,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'rechazado' THEN 1 ELSE 0 END) AS rechazados,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'entregado' THEN 1 ELSE 0 END) AS entregados
FROM pedidos p
WHERE p.companyId = ?
  AND p.transportadora IS NOT NULL AND TRIM(p.transportadora) <> ''
  ${dr ? "AND p.fecha >= ? AND p.fecha <= ?" : ""}
  ${tLike ? "AND TRIM(p.transportadora) LIKE ?" : ""}
GROUP BY TRIM(p.transportadora)
ORDER BY enviados DESC
`;

  const args: unknown[] = [companyId];
  if (dr) {
    args.push(dr.start, dr.end);
  }
  if (tLike) {
    args.push(tLike);
  }

  const rows = await prisma.$queryRawUnsafe<
    {
      empresa: string | null;
      enviados: bigint;
      transito: bigint;
      devoluciones: bigint;
      cancelados: bigint;
      rechazados: bigint;
      entregados: bigint;
    }[]
  >(sql, ...args);

  return mapEfectividadRows(rows);
}

export async function queryCiudadesComparativa(
  prisma: PrismaClient,
  companyId: string,
  params: { desde?: string; hasta?: string },
): Promise<string[]> {
  const dr = parseDateRange(params.desde, params.hasta);
  const sql = `
SELECT TRIM(p.ciudad) AS c
FROM pedidos p
WHERE p.companyId = ?
  AND p.transportadora IS NOT NULL AND TRIM(p.transportadora) <> ''
  AND p.ciudad IS NOT NULL AND TRIM(p.ciudad) <> ''
  ${dr ? "AND p.fecha >= ? AND p.fecha <= ?" : ""}
GROUP BY TRIM(p.ciudad)
ORDER BY COUNT(*) DESC
`;
  const args: unknown[] = [companyId];
  if (dr) args.push(dr.start, dr.end);
  const rows = await prisma.$queryRawUnsafe<{ c: string | null }[]>(sql, ...args);
  return rows.map((r) => r.c).filter((c): c is string => Boolean(c?.trim()));
}

function buildPuntosComparativa(
  det: Array<{
    loc: string | null;
    empresa: string | null;
    enviados: bigint | number;
    entregados: bigint | number;
    devoluciones: bigint | number;
  }>,
  metrica: "efectividad" | "devolucion",
): ComparativaGeograficaPunto[] {
  const puntos: ComparativaGeograficaPunto[] = [];
  for (const r of det) {
    const env = Number(r.enviados) || 0;
    if (env === 0) continue;
    const ent = Number(r.entregados) || 0;
    const dev = Number(r.devoluciones) || 0;
    const raw = metrica === "efectividad" ? (ent / env) * 100 : (dev / env) * 100;
    const valorPct = Math.round(raw * 10) / 10;
    const numerador = metrica === "efectividad" ? ent : dev;
    puntos.push({
      ubicacion: r.loc ?? "",
      transportadora: (r.empresa ?? "").toUpperCase(),
      valorPct,
      numerador,
      denominador: env,
    });
  }
  return puntos;
}

export async function queryComparativaGeografica(
  prisma: PrismaClient,
  companyId: string,
  params: {
    dimension: "departamento" | "ciudad";
    metrica: "efectividad" | "devolucion";
    top: number;
    desde?: string;
    hasta?: string;
    ciudad?: string;
  },
): Promise<ComparativaGeograficaResponse> {
  const dr = parseDateRange(params.desde, params.hasta);
  const top = Math.min(50, Math.max(1, Math.floor(params.top || 15)));
  const geoCol = params.dimension === "ciudad" ? "p.ciudad" : "p.departamento";

  const baseWhere = `
WHERE p.companyId = ?
  AND p.transportadora IS NOT NULL AND TRIM(p.transportadora) <> ''
  AND ${geoCol} IS NOT NULL AND TRIM(${geoCol}) <> ''
  ${dr ? "AND p.fecha >= ? AND p.fecha <= ?" : ""}
`;

  const pushRange = (args: unknown[]) => {
    if (dr) {
      args.push(dr.start, dr.end);
    }
  };

  if (params.dimension === "ciudad" && params.ciudad?.trim()) {
    const cf = params.ciudad.trim();
    const sqlDet = `
SELECT TRIM(${geoCol}) AS loc,
  TRIM(p.transportadora) AS empresa,
  COUNT(*) AS enviados,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'entregado' THEN 1 ELSE 0 END) AS entregados,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'devolucion' THEN 1 ELSE 0 END) AS devoluciones
FROM pedidos p
WHERE p.companyId = ?
  AND p.transportadora IS NOT NULL AND TRIM(p.transportadora) <> ''
  AND ${geoCol} IS NOT NULL AND TRIM(${geoCol}) <> ''
  AND LOWER(TRIM(p.ciudad)) = LOWER(TRIM(?))
  ${dr ? "AND p.fecha >= ? AND p.fecha <= ?" : ""}
GROUP BY TRIM(${geoCol}), TRIM(p.transportadora)
`;
    const args: unknown[] = [companyId, cf];
    pushRange(args);
    const det = await prisma.$queryRawUnsafe<
      {
        loc: string | null;
        empresa: string | null;
        enviados: bigint;
        entregados: bigint;
        devoluciones: bigint;
      }[]
    >(sqlDet, ...args);
    const ubicaciones = [...new Set(det.map((r) => r.loc).filter(Boolean))] as string[];
    const puntos = buildPuntosComparativa(det, params.metrica);
    return {
      dimension: params.dimension,
      metrica: params.metrica,
      ubicaciones,
      puntos,
    };
  }

  const sqlTop = `
SELECT TRIM(${geoCol}) AS loc, COUNT(*) AS vol
FROM pedidos p
${baseWhere}
GROUP BY TRIM(${geoCol})
ORDER BY vol DESC
LIMIT ${top}
`;
  const argsTop: unknown[] = [companyId];
  pushRange(argsTop);
  const topRows = await prisma.$queryRawUnsafe<{ loc: string | null; vol: bigint }[]>(sqlTop, ...argsTop);
  const ubicaciones = topRows.map((r) => r.loc).filter((x): x is string => Boolean(x?.trim()));
  if (ubicaciones.length === 0) {
    return { dimension: params.dimension, metrica: params.metrica, ubicaciones: [], puntos: [] };
  }

  const placeholders = ubicaciones.map(() => "?").join(", ");
  const sqlDet = `
SELECT TRIM(${geoCol}) AS loc,
  TRIM(p.transportadora) AS empresa,
  COUNT(*) AS enviados,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'entregado' THEN 1 ELSE 0 END) AS entregados,
  SUM(CASE WHEN (${BUCKET_CASE}) = 'devolucion' THEN 1 ELSE 0 END) AS devoluciones
FROM pedidos p
WHERE p.companyId = ?
  AND p.transportadora IS NOT NULL AND TRIM(p.transportadora) <> ''
  AND TRIM(${geoCol}) IN (${placeholders})
  ${dr ? "AND p.fecha >= ? AND p.fecha <= ?" : ""}
GROUP BY TRIM(${geoCol}), TRIM(p.transportadora)
`;
  const argsDet: unknown[] = [companyId, ...ubicaciones];
  pushRange(argsDet);
  const det = await prisma.$queryRawUnsafe<
    {
      loc: string | null;
      empresa: string | null;
      enviados: bigint;
      entregados: bigint;
      devoluciones: bigint;
    }[]
  >(sqlDet, ...argsDet);

  const puntos = buildPuntosComparativa(det, params.metrica);
  return {
    dimension: params.dimension,
    metrica: params.metrica,
    ubicaciones,
    puntos,
  };
}
