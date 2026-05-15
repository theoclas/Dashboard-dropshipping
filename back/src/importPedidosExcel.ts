import * as XLSX from "xlsx";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getExcelCell, parseDate, parseTime, toNumber, toString } from "./excelImportHelpers";

/** Prisma limita el tiempo de las transacciones por lotes; el valor por defecto (~5s) rompe imports grandes. */
const BATCH_TX_OPTIONS = { maxWait: 60_000, timeout: 300_000 } as const;

type MapeoNorm = {
  t: string;
  e: string;
  m: string;
  estadoUnificado: string;
};

function normStr(s?: string | null): string {
  if (!s) return "";
  let text = s.toLowerCase().trim();
  text = text
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u")
    .replace(/ü/g, "u");
  return text;
}

export async function createEstadoResolver(prisma: PrismaClient, companyId: string) {
  const todosMapeos = await prisma.mapeoEstado.findMany({ where: { companyId } });
  const mapeosNormalizados: MapeoNorm[] = todosMapeos.map((m) => ({
    t: normStr(m.transportadora ?? ""),
    e: normStr(m.estatusOriginal),
    m: normStr(m.ultimoMovimiento ?? ""),
    estadoUnificado: m.estadoUnificado,
  }));

  return (transportadora?: string, pedidoKey?: string, ultimoMov?: string) => {
    const t = normStr(transportadora);
    const e = normStr(pedidoKey);
    const m = normStr(ultimoMov);

    let match = mapeosNormalizados.find((x) => x.t === t && x.e === e && x.m === m);
    if (match) return match.estadoUnificado;

    match = mapeosNormalizados.find((x) => x.t === t && x.e === e && x.m === "");
    if (match) return match.estadoUnificado;

    match = mapeosNormalizados.find((x) => x.e === e);
    if (match) return match.estadoUnificado;

    return null;
  };
}

export async function getCarteraMapByOrdenIds(
  prisma: PrismaClient,
  companyId: string,
  ordenIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ordenIds.length) return map;
  const unique = [...new Set(ordenIds.filter(Boolean))];
  const BATCH = 500;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const rows = await prisma.$queryRaw<Array<{ orden_id: string | null; cartera_neto: unknown }>>(
      Prisma.sql`
      SELECT \`orden_id\` AS orden_id,
        SUM(CASE WHEN \`tipo\` = 'ENTRADA' THEN \`monto\` ELSE -\`monto\` END) AS cartera_neto
      FROM \`cartera_movimientos\`
      WHERE \`companyId\` = ${companyId}
        AND \`orden_id\` IN (${Prisma.join(batch)})
      GROUP BY \`orden_id\`
    `,
    );
    for (const r of rows) {
      if (r.orden_id) map.set(r.orden_id, Number(r.cartera_neto ?? 0));
    }
  }
  return map;
}

type PedidoRowInput = {
  id_dropi: string;
  fecha?: Date;
  cliente?: string;
  transportadora?: string;
  estado_operativo?: string;
  guia?: string;
  departamento?: string;
  ciudad?: string;
  direccion?: string;
  telefono?: string;
  notas?: string;
  venta?: number;
  ganancia_calc?: number;
  flete?: number;
  costo_devolucion_estimado?: number;
  costo_proveedor?: number;
  estatus_original?: string;
  ultimo_mov?: string;
  fecha_ult_mov?: Date;
  hora_ult_mov?: number;
  dias_desde_ult_mov?: number;
  estado_unificado?: string;
  cartera?: number;
  cartera_aplicada?: number;
  estado_cartera?: string;
};

function dec(n: number | undefined): Prisma.Decimal | null {
  if (n === undefined || n === null || Number.isNaN(n)) return null;
  return new Prisma.Decimal(String(n));
}

function mapUpsert(
  companyId: string,
  p: PedidoRowInput,
): { create: Prisma.OrderCreateInput; update: Prisma.OrderUpdateInput } {
  const base = {
    fecha: p.fecha ?? null,
    cliente: p.cliente ?? null,
    transportadora: p.transportadora ?? null,
    estadoOperativo: p.estado_operativo ?? null,
    guia: p.guia ?? null,
    departamento: p.departamento ?? null,
    ciudad: p.ciudad ?? null,
    direccion: p.direccion ?? null,
    telefono: p.telefono ?? null,
    notas: p.notas ?? null,
    venta: dec(p.venta),
    gananciaCalc: dec(p.ganancia_calc),
    flete: dec(p.flete),
    costoDevolucionEstimado: dec(p.costo_devolucion_estimado),
    costoProveedor: dec(p.costo_proveedor),
    estatusOriginal: p.estatus_original ?? null,
    ultimoMov: p.ultimo_mov ?? null,
    fechaUltMov: p.fecha_ult_mov ?? null,
    horaUltMov: p.hora_ult_mov !== undefined ? dec(p.hora_ult_mov) : null,
    diasDesdeUltMov: p.dias_desde_ult_mov ?? null,
    estadoUnificado: p.estado_unificado ?? null,
    cartera: dec(p.cartera),
    carteraAplicada: dec(p.cartera_aplicada),
    estadoCartera: p.estado_cartera ?? null,
  };
  return {
    create: {
      company: { connect: { id: companyId } },
      externalOrderId: p.id_dropi,
      ...base,
    },
    update: base,
  };
}

/**
 * Import de pedidos desde Excel Dropi (hoja Sheet1, columnas y cálculos).
 * Misma lógica de negocio que el proyecto original (Petho); la única diferencia es el aislamiento por `companyId`.
 */
export async function importPedidosExcel(
  prisma: PrismaClient,
  companyId: string,
  buffer: Buffer,
): Promise<{ imported: number; errors: string[] }> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.find((s) => s === "Sheet1") || wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;

  if (!ws) {
    throw new Error("No se encontró la hoja Sheet1");
  }

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
    defval: null,
  });

  const errors: string[] = [];
  const pedidosParaInsertar: PedidoRowInput[] = [];

  const resolveEstadoEnMemoria = await createEstadoResolver(prisma, companyId);

  const todosLosIds: string[] = rows
    .map((r) => toString(getExcelCell(r, "ID")))
    .filter((id): id is string => !!id);

  const carteraMap = await getCarteraMapByOrdenIds(prisma, companyId, todosLosIds);

  const normalizeKey = (text: string): string => {
    let s = text.toLowerCase().trim();
    s = s.replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u").replace(/ü/g, "u");
    return s;
  };

  for (const row of rows) {
    try {
      const idDropi = toString(getExcelCell(row, "ID"));
      if (!idDropi) continue;

      const transportadora = toString(getExcelCell(row, "TRANSPORTADORA"));
      const venta =
        toNumber(getExcelCell(row, "VALOR DE COMPRA EN PRODUCTOS")) ||
        toNumber(getExcelCell(row, "VALOR FACTURADO")) ||
        toNumber(getExcelCell(row, "TOTAL DE LA ORDEN")) ||
        0;
      const flete = toNumber(getExcelCell(row, "PRECIO FLETE")) || 0;
      const costoProveedor = toNumber(getExcelCell(row, "TOTAL EN PRECIOS DE PROVEEDOR")) || 0;
      const estatusOriginal = toString(getExcelCell(row, "ESTATUS")) || "";
      const ultimoMov = toString(getExcelCell(row, "ÚLTIMO MOVIMIENTO", "ULTIMO MOVIMIENTO"));
      const fechaUltMov = parseDate(getExcelCell(row, "FECHA DE ÚLTIMO MOVIMIENTO"));

      const gananciaCalc = venta - flete - costoProveedor;

      const esInterrapidisimo = transportadora ? transportadora.toUpperCase().includes("INTERRAPIDISIMO") : false;
      const costoDevolucionEstimado = esInterrapidisimo ? -flete : -(flete * 0.8);

      let diasDesdeUltMov: number | undefined;
      if (fechaUltMov) {
        const now = new Date();
        diasDesdeUltMov = Math.floor((now.getTime() - fechaUltMov.getTime()) / (1000 * 60 * 60 * 24));
      }

      const estNorm = normalizeKey(estatusOriginal);
      const movNorm = ultimoMov ? normalizeKey(ultimoMov) : "";

      let pedidoKey: string | undefined;
      if (estNorm !== "" && estNorm !== "guia_generada" && estNorm !== "guia generada") {
        pedidoKey = estatusOriginal;
      } else if (movNorm !== "") {
        pedidoKey = ultimoMov;
      } else {
        pedidoKey = estatusOriginal;
      }

      let estadoUnificado = resolveEstadoEnMemoria(transportadora, pedidoKey, ultimoMov);
      if (!estadoUnificado || estadoUnificado.trim() === "") {
        estadoUnificado = "SIN MAPEAR";
      }

      let estadoOperativo = estadoUnificado;
      if (estadoUnificado === "OFICINA" && diasDesdeUltMov !== undefined && diasDesdeUltMov > 1) {
        estadoOperativo = "OFICINA 1";
      }

      const carteraNeto = carteraMap.get(idDropi) || 0;

      const estadosConCartera = ["ENTREGADO", "DEVOLUCION", "DEVOLUCIÓN"];
      const carteraAplicada = estadosConCartera.includes(estadoUnificado.toUpperCase()) ? carteraNeto : 0;

      const estadoCartera =
        carteraNeto !== 0 && estadosConCartera.includes(estadoUnificado.toUpperCase()) ? "OK" : "";

      let cartera = 0;
      if (estadoOperativo === "ENTREGADO") {
        cartera = gananciaCalc;
      } else if (estadoOperativo === "DEVOLUCION" || estadoOperativo === "DEVOLUCIÓN") {
        cartera = costoDevolucionEstimado;
      }

      pedidosParaInsertar.push({
        id_dropi: idDropi,
        fecha: parseDate(getExcelCell(row, "FECHA")),
        cliente: toString(getExcelCell(row, "NOMBRE CLIENTE", "NOMBRE DEL CLIENTE")),
        transportadora,
        estado_operativo: estadoOperativo,
        guia: toString(getExcelCell(row, "NÚMERO GUIA", "NUMERO GUIA", "NUMERO DE GUIA")),
        departamento: toString(getExcelCell(row, "DEPARTAMENTO DESTINO")),
        ciudad: toString(getExcelCell(row, "CIUDAD DESTINO")),
        direccion: toString(getExcelCell(row, "DIRECCION", "DIRECCIÓN")),
        telefono: toString(getExcelCell(row, "TELÉFONO", "TELEFONO")),
        notas: toString(getExcelCell(row, "NOTAS")),
        venta,
        ganancia_calc: gananciaCalc,
        flete,
        costo_devolucion_estimado: costoDevolucionEstimado,
        costo_proveedor: costoProveedor,
        estatus_original: estatusOriginal,
        ultimo_mov: ultimoMov,
        fecha_ult_mov: fechaUltMov,
        hora_ult_mov: parseTime(getExcelCell(row, "HORA DE ÚLTIMO MOVIMIENTO", "HORA DE ULTIMO MOVIMIENTO")),
        dias_desde_ult_mov: diasDesdeUltMov,
        estado_unificado: estadoUnificado,
        cartera,
        cartera_aplicada: carteraAplicada,
        estado_cartera: estadoCartera,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Fila con ID ${getExcelCell(row, "ID") ?? "?"}: ${msg}`);
    }
  }

  const CHUNK = 100;
  let imported = 0;
  for (let i = 0; i < pedidosParaInsertar.length; i += CHUNK) {
    const batch = pedidosParaInsertar.slice(i, i + CHUNK);
    await prisma.$transaction(
      async (tx) => {
        for (const p of batch) {
          const { create, update } = mapUpsert(companyId, p);
          await tx.order.upsert({
            where: {
              companyId_externalOrderId: { companyId, externalOrderId: p.id_dropi },
            },
            create,
            update,
          });
        }
      },
      BATCH_TX_OPTIONS,
    );
    imported += batch.length;
  }

  return { imported, errors };
}
