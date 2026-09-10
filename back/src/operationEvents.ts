import { normalizeMetaBudget } from "./metaBudget";

/**
 * Detección de cambios de operación comparando la configuración de Meta contra la guardada.
 *
 * Lo interesante no es guardar el estado actual —eso ya lo hace el import— sino saber
 * **cuándo cambió**. Sin esta bitácora, para juzgar si una subida de presupuesto funcionó
 * había que deducir la fecha de un salto en el gasto y preguntarle al usuario si de verdad
 * la había aplicado.
 *
 * Es puro: recibe el antes y el después, devuelve los eventos. Sin base de datos, para
 * poder probarlo sin montar nada.
 */

export type TipoEvento = "PRESUPUESTO" | "ESTADO" | "PUJA" | "OFERTA" | "PRECIO" | "STOCK" | "CREATIVO" | "OTRO";
export type EntidadEvento = "ADSET" | "CAMPAIGN" | "AD" | "PRODUCTO" | "GENERAL";

export type EventoDetectado = {
  tipo: TipoEvento;
  entidad: EntidadEvento;
  entidadId: string | null;
  etiqueta: string | null;
  valorAntes: string | null;
  valorDespues: string | null;
  nota: string;
};

/** Lo que se guardaba antes de este import. */
export type ConfigGuardada = {
  dailyBudgetRaw?: string | null;
  bidStrategy?: string | null;
  effectiveStatus?: string | null;
};

/** Lo que acaba de traer Meta. */
export type ConfigEntrante = ConfigGuardada;

function pesos(raw: string | null | undefined): string | null {
  const n = normalizeMetaBudget(raw ?? null);
  return n === null ? null : Math.round(n).toLocaleString("es-CO");
}

/**
 * Compara una entidad y devuelve un evento por cada campo que cambió.
 *
 * **Solo detecta cambios, no altas.** Cuando el valor anterior es `undefined` —la entidad
 * es nueva, o el campo nunca se había traído— no se emite nada: la primera vez que corre el
 * import con presupuestos, todo "cambiaría" de nada a algo y la bitácora nacería con cientos
 * de eventos falsos.
 */
export function detectarCambios(params: {
  entidad: EntidadEvento;
  entidadId: string;
  etiqueta: string | null;
  antes: ConfigGuardada;
  despues: ConfigEntrante;
}): EventoDetectado[] {
  const { entidad, entidadId, etiqueta, antes, despues } = params;
  const out: EventoDetectado[] = [];
  const base = { entidad, entidadId, etiqueta };
  const nombre = etiqueta ?? entidadId;

  // Presupuesto: se compara en crudo pero se reporta en pesos, que es como se piensa.
  if (
    antes.dailyBudgetRaw !== undefined &&
    antes.dailyBudgetRaw !== null &&
    despues.dailyBudgetRaw !== undefined &&
    despues.dailyBudgetRaw !== null &&
    antes.dailyBudgetRaw !== despues.dailyBudgetRaw
  ) {
    const de = normalizeMetaBudget(antes.dailyBudgetRaw);
    const a = normalizeMetaBudget(despues.dailyBudgetRaw);
    const pct = de && a ? Math.round(((a - de) / de) * 100) : null;
    const direccion = de !== null && a !== null && a > de ? "subió" : "bajó";
    out.push({
      ...base,
      tipo: "PRESUPUESTO",
      valorAntes: pesos(antes.dailyBudgetRaw),
      valorDespues: pesos(despues.dailyBudgetRaw),
      nota:
        `El presupuesto diario de "${nombre}" ${direccion} de ${pesos(antes.dailyBudgetRaw)} a ` +
        `${pesos(despues.dailyBudgetRaw)}` +
        (pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%).` : ".") +
        " Un cambio de presupuesto reinicia el aprendizaje: los primeros días no son comparables.",
    });
  }

  if (
    antes.bidStrategy !== undefined &&
    despues.bidStrategy !== undefined &&
    antes.bidStrategy !== despues.bidStrategy
  ) {
    out.push({
      ...base,
      tipo: "PUJA",
      valorAntes: antes.bidStrategy ?? null,
      valorDespues: despues.bidStrategy ?? null,
      nota:
        `La estrategia de puja de "${nombre}" pasó de ${antes.bidStrategy ?? "sin definir"} a ` +
        `${despues.bidStrategy ?? "sin definir"}. Si el conjunto empieza a no gastar su presupuesto, ` +
        "mira aquí antes de culpar al público.",
    });
  }

  if (
    antes.effectiveStatus !== undefined &&
    despues.effectiveStatus !== undefined &&
    antes.effectiveStatus !== despues.effectiveStatus
  ) {
    out.push({
      ...base,
      tipo: "ESTADO",
      valorAntes: antes.effectiveStatus ?? null,
      valorDespues: despues.effectiveStatus ?? null,
      nota: `"${nombre}" pasó de ${antes.effectiveStatus ?? "sin estado"} a ${despues.effectiveStatus ?? "sin estado"}.`,
    });
  }

  return out;
}
