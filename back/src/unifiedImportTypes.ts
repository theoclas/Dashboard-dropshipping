/**
 * Tipos compartidos del import unificado.
 *
 * La idea de fondo: los dos alcances (un producto / todo) NO son dos flujos distintos.
 * Son el mismo bucle, parametrizado por qué cuentas consulta, qué campañas escribe y
 * cuáles vincula. Todo lo que aquí se declara existe para que eso siga siendo cierto.
 */

/**
 * Lo que pide el cliente.
 *
 * `selectedCampaignIds` son **IDs externos de Meta**, no los internos de
 * `AdvertisingCampaign`. Se normalizan con `normalizeCampaignMapKey`. La distinción
 * entre ausente y vacío es significativa:
 * - ausente (`undefined`): no filtrar, escribir todo lo que devuelva Meta;
 * - vacío (`[]`): el usuario desmarcó todo, no escribir nada.
 */
export type UnifiedImportScope =
  | {
      kind: "product";
      catalogProductId: string;
      /** Si no vienen, se usan las cuentas asignadas al producto. */
      advertisingAccountIds?: string[];
      selectedCampaignIds?: string[];
    }
  | {
      kind: "all";
      /** Si no vienen, se usan todas las cuentas de la empresa. */
      advertisingAccountIds?: string[];
      selectedCampaignIds?: string[];
    };

/** Lo que sale de `resolveImportScope`, ya listo para el bucle. */
export type ResolvedImportScope = {
  kind: "product" | "all";
  catalogProductId: string | null;
  /** IDs internos de `AdvertisingAccount`, validados contra la empresa. */
  advertisingAccountIds: string[];
  /** IDs externos normalizados a los que limitar la escritura. `null` = sin límite. */
  selectedCampaignIds: string[] | null;
  /**
   * Campañas a vincular al producto, por ID externo normalizado.
   *
   * Siempre es una lista explícita, nunca "todas": vincular de más duplica el gasto por
   * producto y con él el margen. Vacía significa que no se vincula nada y que las
   * campañas importadas se reportarán en `unlinkedCampaigns`.
   */
  linkCampaignIds: string[];
  /** Avisos para mostrar en la UI; no son errores. */
  warnings: string[];
};

/** Campaña que se importó pero no quedó ligada a ningún producto del catálogo. */
export type UnlinkedCampaignRow = {
  campaignId: string;
  externalCampaignId: string;
  displayName: string | null;
  metaAccountId: string | null;
  accountName: string | null;
  /** Gasto acumulado en el rango importado. */
  spendInRange: number;
  daysWithSpend: number;
};

/**
 * Campaña que ya pertenecía a OTRO producto y por eso no se vinculó.
 *
 * Existe por una razón concreta: `getMetaAdvertisingSpendSummary` suma el gasto completo
 * de una campaña a CADA producto vinculado. Vincular sin mirar duplicaría el gasto y,
 * con él, el margen por producto. Ante la duda, no se toca y se reporta.
 */
export type LinkConflictRow = {
  campaignId: string;
  externalCampaignId: string;
  displayName: string | null;
  /** Producto al que ya estaba vinculada. */
  ownedByProductId: string;
  ownedByProductName: string;
};

export type UnifiedImportCounters = {
  accountsQueried: number;
  adRowsFetched: number;
  campaignsTouched: number;
  adSetsTouched: number;
  adsTouched: number;
  adMetricsWritten: number;
  campaignMetricsWritten: number;
  linksCreated: number;
};

export type UnifiedImportResult = {
  runId: string;
  scope: ResolvedImportScope;
  desde: string;
  hasta: string;
  /** Tramos en los que se troceó el rango para no chocar con el tope de páginas. */
  chunks: Array<{ desde: string; hasta: string }>;
  dryRun: boolean;
  counters: UnifiedImportCounters;
  unlinkedCampaigns: UnlinkedCampaignRow[];
  linkConflicts: LinkConflictRow[];
  warnings: string[];
  errors: string[];
};
