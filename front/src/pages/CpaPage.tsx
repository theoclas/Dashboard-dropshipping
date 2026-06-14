/**
 * @deprecated Módulo CPA clásico (import Excel + tabla `cpas`).
 * Ya no se usa en la UI: el menú y el dashboard usan CPA experimental (`/app/cpa-experimental`).
 * Se mantiene el código por compatibilidad con rutas API legacy e importaciones antiguas.
 */
import { CpaRecordsView } from "../CpaRecordsView";

export function CpaPage() {
  return <CpaRecordsView />;
}
