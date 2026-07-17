import { extractOrdenIdFromDescripcion } from "./carteraSalidaClassification";

export type CarteraEntradaCategoria = "pedido" | "otro";

function normalizarTexto(s: string | undefined | null): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function clasificarEntradaCartera(input: {
  tipo?: string | null;
  descripcion?: string | null;
  ordenId?: string | null;
}): CarteraEntradaCategoria | null {
  if (normalizarTexto(input.tipo) !== "ENTRADA") return null;
  const ordenId = String(input.ordenId ?? "").trim() || extractOrdenIdFromDescripcion(input.descripcion);
  return ordenId ? "pedido" : "otro";
}

export function resolveOrdenIdForEntrada(input: {
  ordenId?: string | null;
  descripcion?: string | null;
}): string | null {
  const direct = String(input.ordenId ?? "").trim();
  return direct || extractOrdenIdFromDescripcion(input.descripcion);
}
