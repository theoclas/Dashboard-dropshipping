import { listProductAdvertisingAccounts, getCatalogProduct } from "./catalogProductService";
import { listAdvertisingAccounts } from "./advertisingAccountService";
import { normalizeCampaignMapKey } from "./metaCampaignExcelParse";
import type { ResolvedImportScope, UnifiedImportScope } from "./unifiedImportTypes";

/**
 * Resolución del alcance del import unificado.
 *
 * La decisión está partida en dos: `resolveScopeFrom` es pura y contiene toda la lógica;
 * `resolveImportScope` solo hace las lecturas a base de datos y se la pasa. Así el
 * comportamiento se puede probar sin levantar nada.
 *
 * ## La regla que no se puede relajar
 *
 * Solo se vinculan al producto las campañas que el usuario eligió **explícitamente**.
 * Nunca "todas las que aparezcan".
 *
 * El motivo es de dinero: `getMetaAdvertisingSpendSummary` suma el gasto completo de una
 * campaña a cada producto vinculado, así que vincular de más infla el margen del producto
 * y el de todos los que compartan campaña. Y como el alcance de producto puede acabar
 * consultando todas las cuentas de la empresa (cuando el producto aún no tiene cuentas
 * asignadas), "vincular todo lo que venga" significaría colgarle al producto nuevo las
 * campañas de todos los demás. Ante la duda: se importa, no se vincula, y se reporta.
 */

export type ScopeContext = {
  /** Todas las cuentas publicitarias de la empresa (IDs internos). */
  companyAccountIds: string[];
  /** Cuentas asignadas al producto. Irrelevante en alcance "todo". */
  productAccountIds: string[];
  /** `false` si el producto no existe o es de otra empresa. */
  productExists: boolean;
};

function uniq(ids: string[]): string[] {
  return [...new Set(ids.filter((s) => typeof s === "string" && s.trim() !== ""))];
}

/**
 * Los IDs de campaña que viajan por aquí son **IDs externos de Meta**, normalizados con
 * la misma función que usa el resto del import. Mezclarlos con IDs internos de
 * `AdvertisingCampaign` haría que la selección no case con nada, en silencio.
 */
function uniqCampaignKeys(ids: string[]): string[] {
  return uniq(ids.map((id) => normalizeCampaignMapKey(id)));
}

/** Núcleo puro: dado lo que pidió el cliente y lo que hay en base, qué se consulta. */
export function resolveScopeFrom(
  scope: UnifiedImportScope,
  ctx: ScopeContext,
): ResolvedImportScope {
  const warnings: string[] = [];
  const permitidas = new Set(ctx.companyAccountIds);

  // Una cuenta pedida que no sea de esta empresa se descarta, pero con aviso: casi
  // siempre significa que el cliente mandó un ID de otra sesión.
  function filtrarPedidas(pedidas: string[]): string[] {
    const limpias = uniq(pedidas);
    const validas = limpias.filter((id) => permitidas.has(id));
    const descartadas = limpias.length - validas.length;
    if (descartadas > 0) {
      warnings.push(`Se descartaron ${descartadas} cuenta(s) que no pertenecen a esta empresa.`);
    }
    return validas;
  }

  // `undefined` significa "no filtres"; `[]` significa "el usuario desmarcó todo".
  // Confundirlos invierte la seguridad: un array vacío pasaría a importar todo.
  let selectedCampaignIds: string[] | null = null;
  if (Array.isArray(scope.selectedCampaignIds)) {
    selectedCampaignIds = uniqCampaignKeys(scope.selectedCampaignIds);
    if (selectedCampaignIds.length === 0) {
      warnings.push("No se seleccionó ninguna campaña: no se escribirá ninguna métrica.");
    }
  }

  if (scope.kind === "all") {
    const cuentas =
      scope.advertisingAccountIds && scope.advertisingAccountIds.length > 0
        ? filtrarPedidas(scope.advertisingAccountIds)
        : uniq(ctx.companyAccountIds);

    if (cuentas.length === 0) warnings.push("No hay cuentas publicitarias que consultar.");

    return {
      kind: "all",
      catalogProductId: null,
      advertisingAccountIds: cuentas,
      selectedCampaignIds,
      // En "todo" no hay un producto al que vincular.
      linkCampaignIds: [],
      warnings,
    };
  }

  if (!ctx.productExists) {
    // Sin esto, un ID de producto borrado o de otra empresa caería en el escape de
    // "sin cuentas asignadas" y acabaría consultando toda la empresa.
    return {
      kind: "product",
      catalogProductId: scope.catalogProductId,
      advertisingAccountIds: [],
      selectedCampaignIds,
      linkCampaignIds: [],
      warnings: [...warnings, "El producto no existe o no pertenece a esta empresa."],
    };
  }

  // Filtrar contra la empresa ANTES de decidir si el producto "tiene" cuentas: si las
  // que tiene asignadas ya no existen, el caso es el mismo que no tener ninguna.
  const delProducto = uniq(ctx.productAccountIds).filter((id) => permitidas.has(id));

  let cuentas: string[];
  if (scope.advertisingAccountIds && scope.advertisingAccountIds.length > 0) {
    cuentas = filtrarPedidas(scope.advertisingAccountIds);
  } else if (delProducto.length > 0) {
    cuentas = delProducto;
  } else {
    // Sin este escape un producto nuevo nunca podría importar la primera vez: hoy el
    // import masivo lo salta con "Sin campañas vinculadas" y se queda en un callejón.
    cuentas = uniq(ctx.companyAccountIds);
    warnings.push(
      "El producto no tiene cuentas publicitarias asignadas; se consultaron todas las de la empresa.",
    );
  }

  if (cuentas.length === 0) warnings.push("No hay cuentas publicitarias que consultar.");

  // Solo se vincula lo elegido a mano. Ver la nota de cabecera: esto es lo que impide
  // colgarle a un producto las campañas de todos los demás.
  const linkCampaignIds = selectedCampaignIds ?? [];
  if (linkCampaignIds.length === 0) {
    warnings.push(
      "No se vinculará ninguna campaña al producto: elige las campañas en la vista previa. " +
        "Las que queden sin vincular se listan al terminar.",
    );
  }

  return {
    kind: "product",
    catalogProductId: scope.catalogProductId,
    advertisingAccountIds: cuentas,
    selectedCampaignIds,
    linkCampaignIds,
    warnings,
  };
}

/** Envoltura con las lecturas a base de datos. */
export async function resolveImportScope(
  companyId: string,
  scope: UnifiedImportScope,
): Promise<ResolvedImportScope> {
  const cuentas = await listAdvertisingAccounts(companyId);
  const companyAccountIds = cuentas.map((c) => c.id);

  let productAccountIds: string[] = [];
  let productExists = true;
  if (scope.kind === "product") {
    const producto = await getCatalogProduct(companyId, scope.catalogProductId);
    productExists = producto !== null && producto !== undefined;
    if (productExists) {
      const delProducto = await listProductAdvertisingAccounts(companyId, scope.catalogProductId);
      productAccountIds = delProducto.map((c) => c.id);
    }
  }

  return resolveScopeFrom(scope, { companyAccountIds, productAccountIds, productExists });
}
