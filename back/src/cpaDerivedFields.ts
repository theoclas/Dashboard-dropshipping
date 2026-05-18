/**
 * Campos derivados CPA (plantilla CPA_JD / Excel):
 * - `conversion_rate`: como en Excel `SI.ERROR([@VENTAS]/[@CONVERSACIONES];"")` — ratio `ventas/conversaciones`
 *   (0–1); en la UI se muestra como porcentaje (×100).
 * - `costo_publicitario`: como en Excel `SI([@CPA]="";"";[@CPA]*100%/[@[TICKET PROMEDIO DE PRODUCTO]])`,
 *   es decir `(CPA / ticket_promedio) * 100` usando los valores ya calculados de CPA y ticket.
 * - `rentabilidad`: como en Excel
 *   `SI.ERROR(SI([@VENTAS]="";"";SI([@VENTAS]=0;100%;[@CPA]/[@[GANANCIA PROMEDIO]]));"")`:
 *   vacío si no hay ventas; **100** (puntos %) si ventas = 0; si no `(CPA / ganancia_promedio) * 100` en puntos %.
 * - `utilidad_aproximada`: como en Excel
 *   `SI([@VENTAS]=0;-[@GASTO];(([@GANANCIA]*[@VENTAS])-[@GASTO])*0.75)` con `ganancia_promedio` y `gasto_publicidad`.
 */

export type CpaRowLike = {
  semana?: string;
  fecha?: Date;
  producto?: string;
  cuenta_publicitaria?: string;
  gasto_publicidad?: number | null;
  ventas?: number | null;
  conversaciones?: number | null;
  total_facturado?: number | null;
  ganancia_promedio?: number | null;
  ticket_promedio_producto?: number | null;
  cpa?: number | null;
  /** Gasto publicitario sin ventas del día (pedidos / Excel). */
  cpa_es_perdida?: boolean;
  conversion_rate?: number | null;
  costo_publicitario?: number | null;
  rentabilidad?: number | null;
  utilidad_aproximada?: number | null;
};

function roundDec(n: number, scale: number): number {
  const f = 10 ** scale;
  return Math.round(n * f) / f;
}

export function applyCpaDerivedFields(r: CpaRowLike): void {
  const gasto =
    r.gasto_publicidad != null && !Number.isNaN(Number(r.gasto_publicidad))
      ? Number(r.gasto_publicidad)
      : null;
  const ventas =
    r.ventas != null && !Number.isNaN(Number(r.ventas)) ? Math.trunc(Number(r.ventas)) : null;
  const conv =
    r.conversaciones != null && !Number.isNaN(Number(r.conversaciones))
      ? Math.trunc(Number(r.conversaciones))
      : null;
  const total =
    r.total_facturado != null && !Number.isNaN(Number(r.total_facturado)) ? Number(r.total_facturado) : null;
  const gan =
    r.ganancia_promedio != null && !Number.isNaN(Number(r.ganancia_promedio))
      ? Number(r.ganancia_promedio)
      : null;

  const hayGasto = gasto != null && gasto > 0;
  const sinVentas = ventas == null || ventas === 0;

  if (ventas != null && ventas > 0) {
    r.cpa_es_perdida = false;
    r.ticket_promedio_producto = total != null ? roundDec(total / ventas, 2) : null;
    r.cpa = gasto != null ? roundDec(gasto / ventas, 2) : null;
  } else {
    r.ticket_promedio_producto = null;
    r.cpa = null;
    r.cpa_es_perdida = hayGasto && sinVentas;
  }

  // Excel: SI.ERROR([@VENTAS]/[@CONVERSACIONES];"")
  if (conv != null && conv > 0 && ventas != null && !Number.isNaN(ventas)) {
    r.conversion_rate = roundDec(ventas / conv, 4);
  } else {
    r.conversion_rate = null;
  }

  // Excel: SI(CPA="";""; CPA*100%/TICKET_PROMEDIO)
  const cpaVal = r.cpa != null ? Number(r.cpa) : null;
  const ticketVal = r.ticket_promedio_producto != null ? Number(r.ticket_promedio_producto) : null;
  if (
    cpaVal != null &&
    ticketVal != null &&
    !Number.isNaN(cpaVal) &&
    !Number.isNaN(ticketVal) &&
    ticketVal > 0
  ) {
    r.costo_publicitario = roundDec((cpaVal / ticketVal) * 100, 2);
  } else {
    r.costo_publicitario = null;
  }

  // Excel: SI([@VENTAS]=0;-GASTO;((GAN*VENTAS)-GASTO)*0.75)
  if (sinVentas && hayGasto) {
    r.utilidad_aproximada = roundDec(-gasto!, 2);
  } else if (ventas == null || Number.isNaN(ventas)) {
    r.utilidad_aproximada = null;
  } else if (ventas === 0) {
    r.utilidad_aproximada = null;
  } else if (gan != null && gasto != null) {
    r.utilidad_aproximada = roundDec((gan * ventas - gasto) * 0.75, 2);
  } else {
    r.utilidad_aproximada = null;
  }

  // Excel: SI.ERROR(SI([@VENTAS]="";"";SI([@VENTAS]=0;100%;[@CPA]/[@[GANANCIA PROMEDIO]]));"")
  if (sinVentas && hayGasto) {
    r.rentabilidad = 100;
  } else if (ventas == null || Number.isNaN(ventas)) {
    r.rentabilidad = null;
  } else if (ventas === 0) {
    r.rentabilidad = null;
  } else {
    const cpaForRent = r.cpa != null ? Number(r.cpa) : null;
    if (
      cpaForRent != null &&
      gan != null &&
      gan !== 0 &&
      !Number.isNaN(cpaForRent) &&
      !Number.isNaN(gan)
    ) {
      r.rentabilidad = roundDec((cpaForRent / gan) * 100, 2);
    } else {
      r.rentabilidad = null;
    }
  }
}
