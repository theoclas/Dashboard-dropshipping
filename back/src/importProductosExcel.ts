import * as XLSX from "xlsx";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getExcelCell, toNumber, toString } from "./excelImportHelpers";

/**
 * Import de líneas de producto por pedido desde Excel (Dropi).
 * Paridad con Petho `importProductos`; todas las escrituras van acotadas por `companyId`.
 * - Hoja: `Sheet1` si existe, si no la primera.
 * - `sheet_to_json` con `defval: null`.
 * - Columnas: ID, PRODUCTO ID, SKU, VARIACION ID, PRODUCTO, VARIACION, CANTIDAD,
 *   PRECIO PROVEEDOR, PRECIO PROVEEDOR X CANTIDAD.
 * - Agrupa por pedido (ID), borra líneas existentes de esos pedidos, inserta en bloque.
 *
 * El borrado/inserción es por `companyId` (multiempresa).
 */

type ProductoRow = {
  pedido_id_dropi: string;
  producto_id: string | undefined;
  sku: string | undefined;
  variacion_id: string | undefined;
  producto_nombre: string | undefined;
  variacion: string | undefined;
  cantidad: number;
  precio_proveedor: number | undefined;
  precio_proveedor_x_cantidad: number | undefined;
};

export async function importProductosExcel(
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
  let imported = 0;

  const productosPorPedido = new Map<string, ProductoRow[]>();

  for (const row of rows) {
    const pedidoIdDropi = toString(getExcelCell(row, "ID"));
    if (!pedidoIdDropi) continue;

    const productoData: ProductoRow = {
      pedido_id_dropi: pedidoIdDropi,
      producto_id: toString(getExcelCell(row, "PRODUCTO ID")),
      sku: toString(getExcelCell(row, "SKU")),
      variacion_id: toString(getExcelCell(row, "VARIACION ID", "VARIACIÓN ID")),
      producto_nombre: toString(getExcelCell(row, "PRODUCTO")),
      variacion: toString(getExcelCell(row, "VARIACION", "VARIACIÓN")),
      cantidad: toNumber(getExcelCell(row, "CANTIDAD")) ?? 0,
      precio_proveedor: toNumber(getExcelCell(row, "PRECIO PROVEEDOR")),
      precio_proveedor_x_cantidad: toNumber(getExcelCell(row, "PRECIO PROVEEDOR X CANTIDAD")),
    };

    if (!productosPorPedido.has(pedidoIdDropi)) {
      productosPorPedido.set(pedidoIdDropi, []);
    }
    productosPorPedido.get(pedidoIdDropi)!.push(productoData);
  }

  const todosLosProductos: ProductoRow[] = [];
  const todosPedidoIds = Array.from(productosPorPedido.keys());

  for (const productos of productosPorPedido.values()) {
    todosLosProductos.push(...productos);
  }

  try {
    const DELETE_BATCH = 1000;
    if (todosPedidoIds.length > 0) {
      for (let i = 0; i < todosPedidoIds.length; i += DELETE_BATCH) {
        const batch = todosPedidoIds.slice(i, i + DELETE_BATCH);
        await prisma.productDetail.deleteMany({
          where: { companyId, pedidoIdDropi: { in: batch } },
        });
      }
    }

    const INSERT_BATCH = 500;
    if (todosLosProductos.length > 0) {
      for (let i = 0; i < todosLosProductos.length; i += INSERT_BATCH) {
        const slice = todosLosProductos.slice(i, i + INSERT_BATCH);
        const data = slice.map((p) => ({
          companyId,
          pedidoIdDropi: p.pedido_id_dropi,
          productoId: p.producto_id ?? null,
          sku: p.sku ?? null,
          variacionId: p.variacion_id ?? null,
          productoNombre: p.producto_nombre ?? null,
          variacion: p.variacion ?? null,
          cantidad: p.cantidad,
          precioProveedor:
            p.precio_proveedor !== undefined ? new Prisma.Decimal(String(p.precio_proveedor)) : null,
          precioProveedorXCantidad:
            p.precio_proveedor_x_cantidad !== undefined
              ? new Prisma.Decimal(String(p.precio_proveedor_x_cantidad))
              : null,
        }));
        const r = await prisma.productDetail.createMany({ data });
        imported += r.count;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Error en inserción masiva de productos: ${msg}`);
  }

  return { imported, errors };
}
