import type express from "express";
import { z } from "zod";
import { authRequired, companyRequired, requireAnyPermission, requirePermission } from "./middleware";
import type { JwtPayload } from "./types";
import { prisma } from "./prisma";
import { queryAdMetrics, type AdLevel } from "./adAnalyticsService";
import { listCpaExperimental } from "./cpaExperimentalService";
import { queryEntregaByProductBreakdown } from "./dashboardEntregaByProduct";
import { getMetaAdvertisingSpendSummary } from "./metaCampaignSpend";

/**
 * API de solo lectura pensada para que un agente externo analice el negocio.
 *
 * Reglas de esta superficie:
 * - **Solo agregados.** Nada de teléfono, dirección, nombre o email de clientes: esos datos
 *   están en `pedidos` y no tienen por qué salir de aquí.
 * - **Solo lectura.** No hay POST/PATCH/DELETE. Un token filtrado no puede alterar nada.
 * - **Aislada por empresa.** Todo sale del `companyId` del JWT, nunca de un parámetro.
 * - **Permisos reutilizados.** Cada endpoint exige el mismo permiso que su módulo en la UI,
 *   así que un usuario LECTOR restringido ve exactamente lo que se le habilitó.
 */

function user(req: express.Request): JwtPayload {
  return (req as express.Request & { user?: JwtPayload }).user!;
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa formato YYYY-MM-DD.");

const rangeSchema = z.object({ desde: ymd, hasta: ymd });

function csvList(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const arr = Array.isArray(raw) ? raw.map(String) : String(raw).split(",");
  const out = arr.map((s) => s.trim()).filter(Boolean);
  return out.length > 0 ? out : undefined;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ymdOf(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function registerAgentRoutes(app: express.Express): void {
  /**
   * Punto de entrada. Dice qué hay, hasta qué fecha, y —lo más importante— cómo se debe
   * leer esta data para no sacar conclusiones falsas.
   */
  app.get("/api/agent/context", authRequired, companyRequired, async (req, res) => {
    const u = user(req);
    try {
      const [company, accounts, products, adMetricRange, cpaRange, campaignMetricRange] =
        await Promise.all([
          prisma.company.findUnique({ where: { id: u.companyId }, select: { name: true } }),
          prisma.advertisingAccount.findMany({
            where: { companyId: u.companyId },
            select: { id: true, businessName: true, metaAccountId: true },
          }),
          prisma.catalogProduct.findMany({
            where: { companyId: u.companyId, isActive: true },
            select: { id: true, name: true, sku: true },
            orderBy: { name: "asc" },
          }),
          prisma.adMetric.aggregate({
            where: { companyId: u.companyId },
            _min: { recordDate: true },
            _max: { recordDate: true },
            _count: true,
          }),
          prisma.cpaExperimentalRecord.aggregate({
            where: { companyId: u.companyId },
            _min: { fecha: true },
            _max: { fecha: true },
            _count: true,
          }),
          prisma.advertisingCampaignMetric.aggregate({
            where: { companyId: u.companyId },
            _min: { recordDate: true },
            _max: { recordDate: true },
            _count: true,
          }),
        ]);

      return res.json({
        empresa: company?.name ?? null,
        permisos: u.operatorPerms ?? null,
        rol: u.role,
        cuentasPublicitarias: accounts.map((a) => ({
          id: a.id,
          nombre: a.businessName?.trim() || a.metaAccountId,
          metaAccountId: a.metaAccountId,
        })),
        productos: products,
        cobertura: {
          anuncios: {
            filas: adMetricRange._count,
            desde: adMetricRange._min.recordDate ? ymdOf(adMetricRange._min.recordDate) : null,
            hasta: adMetricRange._max.recordDate ? ymdOf(adMetricRange._max.recordDate) : null,
          },
          campanas: {
            filas: campaignMetricRange._count,
            desde: campaignMetricRange._min.recordDate
              ? ymdOf(campaignMetricRange._min.recordDate)
              : null,
            hasta: campaignMetricRange._max.recordDate
              ? ymdOf(campaignMetricRange._max.recordDate)
              : null,
          },
          cpa: {
            filas: cpaRange._count,
            desde: cpaRange._min.fecha ? ymdOf(cpaRange._min.fecha) : null,
            hasta: cpaRange._max.fecha ? ymdOf(cpaRange._max.fecha) : null,
          },
        },
        endpoints: [
          { ruta: "GET /api/agent/ads/daily", que: "Anuncios día a día por nivel campaign/adset/ad." },
          { ruta: "GET /api/agent/cpa/daily", que: "CPA por producto y día (gasto, ventas, margen aproximado)." },
          { ruta: "GET /api/agent/delivery/by-product", que: "Entregados, devueltos y en tránsito por producto." },
          { ruta: "GET /api/agent/spend/by-product", que: "Gasto publicitario Meta agrupado por producto." },
        ],
        comoLeerEstosDatos: [
          "Negocio contra entrega (COD) en Colombia: el gasto de un día es definitivo al día siguiente, los pedidos casi, pero las entregas y el margen real solo se conocen entre 7 y 15 días después. Nunca compares el margen de un día reciente con el de uno maduro: vas a concluir que el negocio empeora cuando solo falta que maduren las entregas.",
          "Para decidir hoy usa métricas adelantadas: CPM, CTR, costo por conversación y CPA de pedido. Para validar usa las rezagadas: % de entrega, devoluciones y margen real.",
          "Cuando el CPA se mueve, descomponlo: CPA = (CPM/1000) / (CTR × tasa de conversión). Si subió el CPM es presión de subasta o audiencia; si cayó el CTR es fatiga del creativo; si cayó la conversión es la oferta, el landing o la atención por WhatsApp. Cambiar el creativo no arregla un problema de conversión.",
          "A nivel anuncio NO hay ventas reales de Dropi: los pedidos no guardan de qué anuncio vinieron. Las compras que ves ahí son las del pixel de Meta. Sirven para testear creativos, no para juzgar rentabilidad final; esa vive en /api/agent/cpa/daily a nivel producto.",
          "El alcance no suma entre anuncios: Meta deduplica personas. Gasto y conversiones sí suman.",
          "Meta re-atribuye los días recientes durante unos 7 días; un día consultado hoy puede cambiar mañana.",
          "Con volumen diario bajo, un día con pocos pedidos es ruido. No recomiendes pausar por un solo día malo: exige 2 o 3 días consecutivos fuera de umbral, o un gasto acumulado suficiente.",
        ],
      });
    } catch (e) {
      return res.status(500).json({ message: e instanceof Error ? e.message : "Error al armar el contexto." });
    }
  });

  /** Anuncios día a día. Mismo motor que la vista Anuncios del dashboard. */
  app.get(
    "/api/agent/ads/daily",
    authRequired,
    companyRequired,
    requirePermission("moduleAnuncios"),
    async (req, res) => {
      const u = user(req);
      const parsed = rangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." });
      }
      const levelRaw = String(req.query.level ?? "ad");
      const level: AdLevel = levelRaw === "campaign" || levelRaw === "adset" ? levelRaw : "ad";

      try {
        const result = await queryAdMetrics(u.companyId, {
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          level,
          daily: String(req.query.daily ?? "true") !== "false",
          cpaObjetivo: numOrNull(req.query.cpaObjetivo),
          advertisingAccountIds: csvList(req.query.advertisingAccountIds),
          campaignIds: csvList(req.query.campaignIds),
          adSetIds: csvList(req.query.adSetIds),
        });
        return res.json(result);
      } catch (e) {
        return res.status(400).json({ message: e instanceof Error ? e.message : "Error al consultar anuncios." });
      }
    },
  );

  /** CPA por producto y día, ya calculado por el módulo CPA experimental. */
  app.get(
    "/api/agent/cpa/daily",
    authRequired,
    companyRequired,
    requirePermission("moduleCpa"),
    async (req, res) => {
      const u = user(req);
      const parsed = rangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." });
      }
      const catalogProductId = req.query.productId ? String(req.query.productId) : undefined;

      try {
        const rows = await listCpaExperimental(u.companyId, {
          catalogProductId,
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
        });

        return res.json({
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          rows: rows.map((r) => ({
            fecha: r.fecha ? ymdOf(r.fecha) : null,
            productoId: r.catalogProductId,
            producto: r.producto ?? r.catalogProduct?.name ?? null,
            gastoPublicidad: numOrNull(r.gastoPublicidad),
            conversaciones: r.conversaciones,
            ventas: r.ventas,
            totalFacturado: numOrNull(r.totalFacturado),
            gananciaPromedio: numOrNull(r.gananciaPromedio),
            ticketPromedio: numOrNull(r.ticketPromedioProducto),
            cpa: numOrNull(r.cpa),
            conversionRate: numOrNull(r.conversionRate),
            costoPublicitarioPct: numOrNull(r.costoPublicitario),
            rentabilidadPct: numOrNull(r.rentabilidad),
            utilidadAproximada: numOrNull(r.utilidadAproximada),
          })),
          notas: [
            "`ventas` son pedidos activos del día (sin cancelados ni rechazados). NO distingue entregado de devuelto, así que `rentabilidadPct` y `utilidadAproximada` asumen que todo se entrega y quedan optimistas. Cruza con /api/agent/delivery/by-product para el dato real.",
            "`cpa` viene null cuando hubo gasto y cero ventas. Eso no es «sin dato»: es la peor señal posible. Trátalo como CPA infinito al ordenar.",
            "`rentabilidadPct` es qué porcentaje de la ganancia se come el anuncio. Por encima de 100 estás perdiendo plata.",
          ],
        });
      } catch (e) {
        return res.status(400).json({ message: e instanceof Error ? e.message : "Error al consultar CPA." });
      }
    },
  );

  /** Entregados / devueltos / en tránsito y margen por producto. Solo agregados. */
  app.get(
    "/api/agent/delivery/by-product",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleDashboard", "moduleReportes"]),
    async (req, res) => {
      const u = user(req);
      const parsed = rangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." });
      }
      try {
        const data = await queryEntregaByProductBreakdown(prisma, u.companyId, {
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
        });
        return res.json({
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          ...data,
          notas: [
            "El rango filtra por fecha del PEDIDO, no por fecha de entrega. Los pedidos recientes todavía están en tránsito, así que su % de entrega se ve artificialmente bajo.",
            "`pctPendientes` te dice cuánto falta por resolver: si es alto, el % de entrega todavía no es concluyente.",
          ],
        });
      } catch (e) {
        return res.status(400).json({ message: e instanceof Error ? e.message : "Error al consultar entregas." });
      }
    },
  );

  /** Gasto publicitario Meta agrupado por producto del catálogo. */
  app.get(
    "/api/agent/spend/by-product",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleDashboard", "moduleCampanasMeta", "moduleAnuncios"]),
    async (req, res) => {
      const u = user(req);
      const parsed = rangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." });
      }
      try {
        const data = await getMetaAdvertisingSpendSummary(prisma, u.companyId, {
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
        });
        return res.json({ desde: parsed.data.desde, hasta: parsed.data.hasta, ...data });
      } catch (e) {
        return res.status(400).json({ message: e instanceof Error ? e.message : "Error al consultar gasto." });
      }
    },
  );
}
