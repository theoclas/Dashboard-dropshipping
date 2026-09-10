import type express from "express";
import { z } from "zod";
import { authRequired, companyRequired, requireAnyPermission, requirePermission } from "./middleware";
import type { JwtPayload } from "./types";
import { prisma } from "./prisma";
import { queryAdMetrics, type AdLevel } from "./adAnalyticsService";
import { listCpaExperimental } from "./cpaExperimentalService";
import { queryEntregaByProductBreakdown } from "./dashboardEntregaByProduct";
import { getMetaAdvertisingSpendSummary } from "./metaCampaignSpend";
import { queryEntregasPorUbicacion, type GeoDimension } from "./agentGeoService";
import { agentDocsHtml, buildAgentOpenApiSpec } from "./agentOpenApi";
import { queryOrdersBreakdown, type OrdersDimension } from "./agentOrdersService";

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

type UmbralesProducto = {
  cpaObjetivo: unknown;
  cpaAlerta: unknown;
  economiaActualizadaEn: Date | null;
} | undefined;

/**
 * Veredicto de un día contra los umbrales guardados del producto.
 *
 * Se calcula aquí y no en el cliente para que la respuesta ya venga interpretada: quien
 * consulte la API no tiene por qué saber que un `cpa` nulo con gasto es la peor señal, ni
 * cuál era el equilibrio de ese producto.
 *
 * Devuelve un objeto vacío si el producto no tiene umbrales definidos. **Callar es correcto
 * aquí**: inventar un umbral por defecto sería peor que no opinar.
 */
function veredictoCpa(
  cpa: number | null,
  gasto: number | null,
  ventas: number | null,
  umbrales: UmbralesProducto,
) {
  const objetivo = umbrales ? numOrNull(umbrales.cpaObjetivo) : null;
  if (!objetivo || objetivo <= 0) return {};
  const alerta = umbrales ? numOrNull(umbrales.cpaAlerta) : null;

  // Gasto sin una sola venta: `cpa` viene null, pero eso no es «sin dato».
  if ((gasto ?? 0) > 0 && !ventas) {
    return {
      cpaObjetivo: objetivo,
      veredicto: "SIN_VENTAS" as const,
      veredictoNota: `Gastó ${Math.round(gasto ?? 0).toLocaleString("es-CO")} sin una sola venta. Es la peor señal, no un dato faltante.`,
    };
  }
  if (cpa === null) return { cpaObjetivo: objetivo };

  if (cpa > objetivo) {
    return {
      cpaObjetivo: objetivo,
      veredicto: "PIERDE" as const,
      veredictoNota: `CPA ${Math.round(cpa).toLocaleString("es-CO")} por encima del equilibrio ${Math.round(objetivo).toLocaleString("es-CO")}. Un día suelto es ruido: exige 2 o 3 seguidos antes de recortar.`,
    };
  }
  if (alerta && cpa > alerta) {
    return {
      cpaObjetivo: objetivo,
      veredicto: "ALERTA" as const,
      veredictoNota: `CPA ${Math.round(cpa).toLocaleString("es-CO")} pasó el umbral pesimista ${Math.round(alerta).toLocaleString("es-CO")}. Si la entrega baja, este día pierde.`,
    };
  }
  return { cpaObjetivo: objetivo, veredicto: "OK" as const };
}

/** Base pública, para que la spec apunte al servidor real y no a localhost. */
function baseUrl(req: express.Request): string {
  const proto = String(req.header("x-forwarded-proto") ?? req.protocol ?? "https").split(",")[0];
  return `${proto}://${req.get("host")}`;
}

export function registerAgentRoutes(app: express.Express): void {
  /**
   * Documentación. **Sin autenticación a propósito.**
   *
   * Describe la forma de la API, no los datos: para traer datos sigue haciendo falta la
   * credencial. Pedir token para leer la documentación rompería justo el caso de uso —
   * pasarle la referencia a alguien, o a otra IA, para que sepa qué puede consultar.
   */
  app.get("/api/agent/openapi.json", (req, res) => {
    res.json(buildAgentOpenApiSpec(baseUrl(req)));
  });

  app.get("/api/agent/docs", (req, res) => {
    // helmet pone `default-src 'self'`, que bloquearía el CDN de Swagger UI. Se abre solo aquí.
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "font-src 'self' data:",
      ].join("; "),
    );
    res.type("html").send(agentDocsHtml(`${baseUrl(req)}/api/agent/openapi.json`));
  });

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
            select: {
              id: true,
              name: true,
              sku: true,
              cpaObjetivo: true,
              cpaAlerta: true,
              costoUnitario: true,
              precios: true,
              proveedor: true,
              economiaActualizadaEn: true,
            },
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
        productos: products.map((p) => ({
          ...p,
          cpaObjetivo: numOrNull(p.cpaObjetivo),
          cpaAlerta: numOrNull(p.cpaAlerta),
          costoUnitario: numOrNull(p.costoUnitario),
          economiaActualizadaEn: p.economiaActualizadaEn
            ? ymdOf(p.economiaActualizadaEn)
            : null,
        })),
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
          {
            ruta: "GET /api/agent/delivery/by-location",
            que: "Entregas y devoluciones por ciudad o departamento, filtrable por producto (?dimension=ciudad|departamento&productId=&minPedidos=). Para decidir qué ubicaciones excluir de la segmentación.",
          },
          { ruta: "GET /api/agent/spend/by-product", que: "Gasto publicitario Meta agrupado por producto." },
          {
            ruta: "GET /api/agent/events",
            que: "Bitácora: qué cambió en la operación y cuándo. La escribe el import solo al detectar cambios en Meta.",
          },
          {
            ruta: "GET /api/agent/orders/breakdown",
            que: "Pedidos agregados por transportadora, estado, departamento o días de tránsito. Solo cuenta y suma.",
          },
          {
            ruta: "GET /api/agent/docs",
            que: "Documentación navegable (Swagger UI), con las reglas de lectura del negocio. No pide credencial.",
          },
          {
            ruta: "GET /api/agent/openapi.json",
            que: "La misma documentación en OpenAPI 3.0, para consumirla desde otra herramienta o agente.",
          },
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

        // Umbrales guardados por producto. Sin ellos no hay veredicto posible: un CPA "malo"
        // solo existe contra un número que alguien definió.
        const economia = new Map(
          (
            await prisma.catalogProduct.findMany({
              where: { companyId: u.companyId },
              select: { id: true, cpaObjetivo: true, cpaAlerta: true, economiaActualizadaEn: true },
            })
          ).map((p) => [p.id, p]),
        );

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
            ...veredictoCpa(numOrNull(r.cpa), numOrNull(r.gastoPublicidad), r.ventas, economia.get(r.catalogProductId)),
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

  /**
   * Entregas y devoluciones por departamento o ciudad, filtrable por producto.
   * Sirve para decidir qué ubicaciones excluir de la segmentación: una ciudad que
   * devuelve el 40% se lleva la plata aunque el anuncio funcione.
   */
  app.get(
    "/api/agent/delivery/by-location",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleDashboard", "moduleReportes"]),
    async (req, res) => {
      const u = user(req);
      const parsed = rangeSchema.partial().safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." });
      }
      const dimRaw = String(req.query.dimension ?? "ciudad");
      const dimension: GeoDimension = dimRaw === "departamento" ? "departamento" : "ciudad";

      try {
        const data = await queryEntregasPorUbicacion(prisma, u.companyId, {
          dimension,
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          catalogProductId: req.query.productId ? String(req.query.productId) : undefined,
          minPedidos: numOrNull(req.query.minPedidos) ?? undefined,
        });
        return res.json(data);
      } catch (e) {
        return res
          .status(400)
          .json({ message: e instanceof Error ? e.message : "Error al consultar entregas por ubicación." });
      }
    },
  );

  /**
   * Bitácora: qué cambió en la operación y cuándo.
   *
   * Es lo que permite correlacionar causa y efecto sin preguntarle a nadie. Antes, para
   * juzgar si una subida de presupuesto había funcionado, había que deducir la fecha de un
   * salto en el gasto y confiar en que se recordara bien.
   *
   * La mayoría de las filas las escribe el import solo, comparando lo que trae Meta contra
   * lo guardado.
   */
  app.get(
    "/api/agent/events",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleDashboard", "moduleAnuncios", "moduleCampanasMeta"]),
    async (req, res) => {
      const u = user(req);
      const parsed = rangeSchema.partial().safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." });
      }
      const tipos = csvList(req.query.tipo);
      const where: Record<string, unknown> = { companyId: u.companyId };
      if (parsed.data.desde || parsed.data.hasta) {
        const r: Record<string, Date> = {};
        if (parsed.data.desde) r.gte = new Date(`${parsed.data.desde}T00:00:00.000Z`);
        if (parsed.data.hasta) r.lte = new Date(`${parsed.data.hasta}T23:59:59.999Z`);
        where.ocurrioEn = r;
      }
      if (tipos) where.tipo = { in: tipos };
      if (req.query.entidadId) where.entidadId = String(req.query.entidadId);

      try {
        const rows = await prisma.operationEvent.findMany({
          where,
          orderBy: { ocurrioEn: "desc" },
          take: Math.min(Number(req.query.limit ?? 200) || 200, 500),
          select: {
            id: true,
            ocurrioEn: true,
            tipo: true,
            entidad: true,
            entidadId: true,
            etiqueta: true,
            valorAntes: true,
            valorDespues: true,
            nota: true,
            automatico: true,
          },
        });
        return res.json({
          desde: parsed.data.desde ?? null,
          hasta: parsed.data.hasta ?? null,
          rows: rows.map((r) => ({ ...r, ocurrioEn: r.ocurrioEn.toISOString() })),
          notas: [
            "`ocurrioEn` es cuándo se DETECTÓ el cambio, no cuándo se hizo: el import compara contra lo guardado, así que un cambio hecho por la mañana aparece con la hora del import.",
            "Un cambio de presupuesto reinicia el aprendizaje de Meta. Los primeros días después de un evento PRESUPUESTO no son comparables con los anteriores.",
            "`automatico: false` son notas escritas a mano, para lo que Meta no sabe: cambió la oferta, subió el precio, se agotó el stock.",
          ],
        });
      } catch (e) {
        return res
          .status(400)
          .json({ message: e instanceof Error ? e.message : "Error al consultar la bitácora." });
      }
    },
  );

  /**
   * Pedidos agregados por transportadora, estado, departamento o días de tránsito.
   *
   * Responde preguntas que el CPA no puede: si una transportadora entrega al 65% y otra al
   * 85%, eso mueve más plata que cualquier ajuste de puja. Solo cuenta y suma; no expone
   * ningún pedido concreto ni dato de cliente.
   */
  app.get(
    "/api/agent/orders/breakdown",
    authRequired,
    companyRequired,
    requireAnyPermission(["moduleDashboard", "moduleReportes"]),
    async (req, res) => {
      const u = user(req);
      const parsed = rangeSchema.partial().safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." });
      }
      const dimRaw = String(req.query.dimension ?? "transportadora");
      const dimension: OrdersDimension = (
        ["transportadora", "estado", "departamento", "dias_transito"] as const
      ).includes(dimRaw as OrdersDimension)
        ? (dimRaw as OrdersDimension)
        : "transportadora";

      try {
        const data = await queryOrdersBreakdown(prisma, u.companyId, {
          dimension,
          desde: parsed.data.desde,
          hasta: parsed.data.hasta,
          minPedidos: numOrNull(req.query.minPedidos) ?? undefined,
        });
        return res.json({ desde: parsed.data.desde ?? null, hasta: parsed.data.hasta ?? null, ...data });
      } catch (e) {
        return res
          .status(400)
          .json({ message: e instanceof Error ? e.message : "Error al consultar pedidos." });
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
