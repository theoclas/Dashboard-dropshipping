/**
 * Presupuestos de Meta: de lo que devuelve la API a pesos.
 *
 * **La trampa:** `/insights` devuelve `spend` ya en la moneda de la cuenta (17900 son
 * diecisiete mil novecientos pesos), pero los edges `/adsets` y `/campaigns` devuelven
 * `daily_budget` en la **unidad menor** de esa moneda. No son la misma escala, aunque las
 * dos vengan del mismo token y parezcan números comparables.
 *
 * Por eso en la base se guarda el valor **crudo, tal cual llega**, y la conversión se hace
 * aquí, en un solo sitio: si el factor resulta estar mal, se arregla en una línea sin tener
 * que reimportar nada.
 */

/**
 * Cuántas unidades menores tiene un peso según Meta.
 *
 * **Para el COP es 1**: Meta lo trata como moneda sin decimales, así que un presupuesto de
 * $25.000 llega literalmente como `"25000"`. Verificado en producción el 12 de septiembre
 * de 2026, cuando una subida de 13.000 a 25.000 se registró como `13000 -> 25000`.
 *
 * Se deja como constante y no como `1` suelto porque **no es universal**: en monedas con
 * centavos (USD, EUR) Meta sí devuelve la unidad menor y el factor sería 100. Si algún día
 * esta cuenta factura en otra moneda, se cambia aquí.
 *
 * Cuando el factor está mal se nota de inmediato: `porcentajeDeEntrega` daría valores
 * absurdos —1% o 10.000%— en vez de rondar el 100%. Eso es exactamente lo que atrapó
 * `presupuestoEsPlausible` la primera vez, devolviendo `null` en lugar de un número que
 * habría llevado a decidir al revés.
 */
export const UNIDADES_MENORES_POR_PESO = 1;

/** Convierte el valor crudo de Meta a pesos. `null` si no hay presupuesto en ese nivel. */
export function normalizeMetaBudget(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n / UNIDADES_MENORES_POR_PESO;
}

/**
 * Qué porcentaje del presupuesto logró gastar Meta ese día.
 *
 * Es el diagnóstico que distingue dos problemas opuestos que se ven igual en el gasto:
 *
 * - **Por encima de ~105%**: el conjunto está topado. Meta permite pasarse hasta un ~125%
 *   en un día y compensarlo en la semana, así que un conjunto pegado ahí *quiere más plata*.
 * - **Por debajo de ~90% de forma sostenida**: está ahogado. Meta no encuentra a quién
 *   mostrarle al costo que le pides. Subirle el presupuesto no sirve de nada: o el público
 *   es estrecho, o la estrategia de puja tiene un límite que apreta.
 *
 * Devuelve `null` cuando no hay presupuesto conocido, para no inventar un 0%.
 */
export function porcentajeDeEntrega(gasto: number, presupuesto: number | null): number | null {
  if (presupuesto === null || presupuesto <= 0) return null;
  return (gasto / presupuesto) * 100;
}

/**
 * Guardia contra el error de escala.
 *
 * Un presupuesto convertido tiene que estar en el mismo orden de magnitud que el gasto del
 * día. Si está 20 veces por encima o por debajo, el factor de conversión está mal y es
 * mejor no mostrar el dato que mostrar uno que lleve a decidir al revés.
 */
export function presupuestoEsPlausible(presupuesto: number | null, gastoDelDia: number): boolean {
  if (presupuesto === null || presupuesto <= 0) return false;
  if (gastoDelDia <= 0) return true; // sin gasto no hay con qué comparar; no se descarta
  const ratio = presupuesto / gastoDelDia;
  return ratio >= 0.05 && ratio <= 20;
}
