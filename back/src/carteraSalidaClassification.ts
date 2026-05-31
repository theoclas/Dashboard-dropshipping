export type CarteraSalidaCategoria = "pedido" | "retiro" | "recarga_tarjeta" | "otro";

export const CARTERA_SALIDA_CATEGORIA_LABELS: Record<CarteraSalidaCategoria, string> = {
  pedido: "Pedido",
  retiro: "Retiro de saldo",
  recarga_tarjeta: "Recarga / tarjeta Dropi",
  otro: "Otra salida",
};

function normalizarTexto(s: string | undefined | null): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Extrae ID Dropi de pedido desde descripción (p. ej. flete inicial). */
export function extractOrdenIdFromDescripcion(descripcion: string | undefined | null): string | null {
  const desc = String(descripcion ?? "");
  const flete = desc.match(/FLETE\s+INICIAL\s*:\s*(\d+)/i);
  if (flete?.[1]) return flete[1];
  const orden = desc.match(/ORDEN\s+(?:COMO\s+DROPSHIPPER\s*:\s*)?(\d+)/i);
  if (orden?.[1]) return orden[1];
  return null;
}

export function esSalidaCartera(tipo: string | undefined | null): boolean {
  return normalizarTexto(tipo) === "SALIDA";
}

export function clasificarSalidaCartera(input: {
  tipo?: string | null;
  descripcion?: string | null;
  ordenId?: string | null;
}): CarteraSalidaCategoria | null {
  if (!esSalidaCartera(input.tipo)) return null;

  const desc = normalizarTexto(input.descripcion);
  const ordenRef = String(input.ordenId ?? "").trim() || extractOrdenIdFromDescripcion(input.descripcion);

  if (desc.includes("PETICION DE RETIRO DE SALDO EN CARTERA") || desc.includes("RETIRO DE SALDO EN CARTERA")) {
    return "retiro";
  }

  if (
    desc.includes("RECARGA DE TARJETA") ||
    (desc.includes("TARJETA") && desc.includes("MANTENIMIENTO"))
  ) {
    return "recarga_tarjeta";
  }

  if (
    ordenRef ||
    desc.includes("FLETE INICIAL") ||
    desc.includes("COBRO DE FLETE") ||
    desc.includes("ORDEN COMO DROPSHIPPER")
  ) {
    return "pedido";
  }

  return "otro";
}

export function resolveOrdenIdForSalida(input: {
  ordenId?: string | null;
  descripcion?: string | null;
}): string | null {
  const direct = String(input.ordenId ?? "").trim();
  if (direct) return direct;
  return extractOrdenIdFromDescripcion(input.descripcion);
}
