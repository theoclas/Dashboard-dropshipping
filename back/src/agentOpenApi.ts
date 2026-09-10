/**
 * Especificación OpenAPI de la API del agente.
 *
 * Se escribe a mano en vez de generarse con decoradores porque el valor de este documento
 * no está en la lista de campos —eso se adivina mirando una respuesta— sino en **cómo hay
 * que leer los datos sin sacar conclusiones falsas**. Esas reglas vienen de meses de
 * análisis y no hay generador que las deduzca del código.
 *
 * Se sirve sin autenticación: describe la forma de la API, no los datos. Para traer datos
 * sigue haciendo falta la credencial.
 */

const YMD = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: "2026-09-01" } as const;

const INTRO = `
# API de análisis de FersuaStore

Una API de **solo lectura** para analizar el negocio: gasto publicitario de Meta, pedidos,
CPA por producto y entregas. Devuelve **solo agregados** — nunca teléfono, dirección,
nombre ni correo de ningún cliente.

## Cómo autenticarse

Todas las rutas piden una credencial de servicio en la cabecera:

\`\`\`
Authorization: Bearer fsa_...
\`\`\`

Se crea desde el dashboard, en **Administración → Credenciales de servicio**. No caduca,
está atada a una empresa y se revoca desde esa misma pantalla.

Pulsa **Authorize** aquí arriba, pega tu credencial, y podrás ejecutar cualquier ruta de
esta página con el botón *Try it out*.

Prueba rápida desde la terminal:

\`\`\`bash
curl -H "Authorization: Bearer TU_TOKEN" \\
  "https://dashboard.fersuastudio.com/api/agent/context"
\`\`\`

## Empieza siempre por \`/context\`

Dice qué datos hay, hasta qué fecha llegan, qué productos y cuentas publicitarias existen,
y trae las reglas de lectura. Sin eso puedes estar analizando un rango donde falta la mitad
de la información.

---

# Cómo leer estos datos sin equivocarte

Esta sección es la parte importante. Son errores que ya se cometieron.

### 1. El negocio es contra entrega, y eso retrasa la verdad

El gasto de un día es definitivo al día siguiente. Los pedidos, casi. Pero **las entregas y
el margen real solo se saben entre 7 y 15 días después**.

Nunca compares el margen de un día reciente con el de uno maduro: vas a concluir que el
negocio empeora cuando lo único que pasa es que las entregas todavía no maduraron.

- Para **decidir hoy**: CPM, CTR, costo por conversación, CPA de pedido.
- Para **validar**: % de entrega, devoluciones y margen real.

### 2. Un día leído esa misma noche subestima entre 40% y 67%

Muchos pedidos llegan con datos malos —teléfono equivocado, dirección incompleta— y hay que
confirmarlos con el cliente. Se agendan al día siguiente, o no se agendan.

Medido: un martes que a las 20:03 mostraba 6 ventas cerró en 10.

**Para decidir, usa días con 48 horas de maduración.** Si un día se ve mal por la noche,
espera. Si se ve bien, es aún mejor de lo que muestra. Un cero que sigue en cero después de
varios días sí es real.

### 3. El pixel de Meta sobrerreporta, pero cuánto depende de la campaña

| Tipo de campaña | Compras del pixel vs pedidos reales |
|---|---|
| **WhatsApp** (cierre por chat) | **1,54×** — dispara sobre la intención, no sobre el pedido |
| **Web** (checkout propio) | **0,94×** — casi clavado |

En campañas de WhatsApp, a nivel de anuncio o conjunto lee **costo por conversación**, nunca
compras. En campañas web sí puedes leer compras por conjunto, pero en ventanas de 4 días o
más: nunca un día suelto.

La cifra que decide siempre es \`ventas\` de \`/cpa/daily\`, que cuenta pedidos reales.

### 4. Cuando el CPA se mueve, descomponlo

\`\`\`
CPA = (CPM / 1000) / (CTR × tasa de conversión)
\`\`\`

- Subió el **CPM** → presión de subasta o audiencia agotada.
- Cayó el **CTR** → fatiga del creativo.
- Cayó la **conversión** → la oferta, la página, la atención por WhatsApp, o competencia.

Cambiar el creativo no arregla un problema de conversión.

### 5. Día a día, nunca el rango promediado

Un promedio esconde la mitad de la historia. Y con volumen bajo, un día malo es ruido:
exige **2 o 3 días consecutivos** fuera de umbral antes de recomendar apagar algo.

Cuidado con partir el rango donde te convenga: comparar "los mejores 4 días" contra "los
peores 4" siempre da una caída dramática que no significa nada. Compara semana contra
semana, con los mismos días de la semana.

### 6. Meta reescribe el pasado

Re-atribuye los últimos ~7 días. Un día consultado hoy puede cambiar mañana, y una
reimportación cambia cifras que ya habías anotado.

### 7. El alcance no suma entre anuncios

Meta deduplica personas, así que sumar el alcance de varios anuncios cuenta a la misma
persona varias veces. **La frecuencia acumulada del periodo no se puede calcular con esta
API**; la diaria sí es exacta. No afirmes "no hay saturación" apoyándote en ella.

Gasto y conversiones sí suman.

### 8. \`utilidadAproximada\` es optimista

La fórmula es \`(ganancia × ventas − gasto) × 0,75\`. Ese 0,75 castiga también al gasto
publicitario, que es 100% hundido, así que **los días malos se ven 25% menos malos**. Para
el margen real, cruza con \`/delivery/by-product\`.
`;

const errorSchema = {
  type: "object",
  properties: { message: { type: "string", example: "Usa formato YYYY-MM-DD." } },
} as const;

const respuestas = (okDesc: string, ejemplo?: unknown) => ({
  "200": {
    description: okDesc,
    content: {
      "application/json": ejemplo ? { example: ejemplo } : { schema: { type: "object" } },
    },
  },
  "400": {
    description: "Parámetros inválidos.",
    content: { "application/json": { schema: errorSchema } },
  },
  "401": {
    description: "Falta la credencial, no existe o fue revocada.",
    content: { "application/json": { schema: errorSchema } },
  },
  "403": {
    description:
      "La credencial no puede hacer esto. Solo admite GET sobre /api/agent/, y solo de su empresa.",
    content: { "application/json": { schema: errorSchema } },
  },
});

const paramDesde = {
  name: "desde",
  in: "query",
  required: true,
  schema: YMD,
  description: "Primer día del rango, inclusive.",
};
const paramHasta = {
  name: "hasta",
  in: "query",
  required: true,
  schema: YMD,
  description: "Último día del rango, inclusive.",
};

export function buildAgentOpenApiSpec(publicUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "API de análisis · FersuaStore",
      version: "1.0.0",
      description: INTRO,
    },
    servers: [{ url: publicUrl, description: "Producción" }],
    security: [{ credencialDeServicio: [] }],
    components: {
      securitySchemes: {
        credencialDeServicio: {
          type: "http",
          scheme: "bearer",
          description:
            "Credencial de servicio (empieza por `fsa_`). Se crea en Administración → Credenciales de servicio.",
        },
      },
    },
    tags: [
      { name: "Empezar aquí", description: "Qué datos hay y cómo leerlos." },
      { name: "Publicidad", description: "Meta Ads: campañas, conjuntos y anuncios." },
      { name: "Rentabilidad", description: "CPA por producto y gasto atribuido." },
      { name: "Entregas", description: "Lo que de verdad decide si un producto deja plata." },
    ],
    paths: {
      "/api/agent/context": {
        get: {
          tags: ["Empezar aquí"],
          summary: "Qué hay, hasta cuándo, y cómo leerlo",
          description:
            "**La primera llamada de cualquier análisis.** Devuelve la empresa, los productos del " +
            "catálogo con su id, las cuentas publicitarias, hasta qué fecha llega cada fuente de " +
            "datos, y las reglas de lectura del negocio.\n\n" +
            "Los `id` de producto que trae son los que se pasan como `productId` en las demás rutas.",
          responses: respuestas("Contexto de la empresa.", {
            empresa: "FersuaStore",
            rol: "LECTOR",
            productos: [
              { id: "cmp1zlboz00010h6g81i4b8ko", name: "SHAMPOO EN BARRA", sku: "1988623" },
            ],
            cuentasPublicitarias: [
              { id: "cmp69c2kk00010hpcywt3k3d3", nombre: "1ra CUENTA", metaAccountId: "1471976967613858" },
            ],
            cobertura: {
              anuncios: { filas: 1211, desde: "2026-07-01", hasta: "2026-09-09" },
              cpa: { filas: 726, desde: "2026-04-20", hasta: "2026-09-09" },
            },
            comoLeerEstosDatos: ["…reglas de negocio…"],
          }),
        },
      },

      "/api/agent/ads/daily": {
        get: {
          tags: ["Publicidad"],
          summary: "Meta Ads día a día, por campaña, conjunto o anuncio",
          description:
            "El mismo motor que la pantalla de Anuncios del dashboard.\n\n" +
            "Cada fila trae los totales del periodo y, si `daily=true`, la serie `daily[]` con una " +
            "entrada por día.\n\n" +
            "**Ojo:** `purchases` son compras del *pixel de Meta*, no pedidos reales. En campañas de " +
            "WhatsApp sobrerreportan ~1,5×. Para juzgar rentabilidad usa `/cpa/daily`; esto sirve " +
            "para comparar creativos y conjuntos entre sí.\n\n" +
            "### El porcentaje de entrega\n\n" +
            "En `level=adset` y `level=campaign` cada fila trae `presupuestoDiario` y " +
            "`pctEntregaMedia`, y cada día de `daily[]` trae su `pctEntrega`. Es el diagnóstico que " +
            "separa dos problemas opuestos que en el gasto se ven igual:\n\n" +
            "| pctEntrega | Qué significa | Qué hacer |\n" +
            "|---|---|---|\n" +
            "| **> 105%** | Topado. Meta deja pasarse hasta ~125% en un día y lo compensa en la semana. | Quiere más presupuesto |\n" +
            "| **90–105%** | Normal. | Nada |\n" +
            "| **< 90% sostenido** | Ahogado: no encuentra a quién mostrarle al costo pedido. | Subirle el presupuesto **no sirve**. Mira `bidStrategy`: si hay `COST_CAP` o `LOWEST_COST_WITH_BID_CAP`, el límite es la puja; si es `LOWEST_COST_WITHOUT_CAP`, el público es estrecho |\n\n" +
            "`presupuestoDiario` es el valor de **hoy** en Meta, no el del rango consultado. Si se " +
            "cambió a mitad del periodo, los días anteriores quedan medidos contra el valor nuevo; " +
            "`configSyncedAt` dice de cuándo es la lectura.\n\n" +
            "Viene en `null` cuando no se conoce, en vez de un 0 que se leería como «sin presupuesto».",
          parameters: [
            paramDesde,
            paramHasta,
            {
              name: "level",
              in: "query",
              schema: { type: "string", enum: ["campaign", "adset", "ad"], default: "ad" },
              description:
                "Nivel de agrupación. `ad` es el más fino y el que sirve para comparar creativos.",
            },
            {
              name: "daily",
              in: "query",
              schema: { type: "string", enum: ["true", "false"], default: "true" },
              description: "`false` devuelve solo los totales del periodo, sin la serie diaria.",
            },
            {
              name: "cpaObjetivo",
              in: "query",
              schema: { type: "number", example: 31135 },
              description:
                "Si lo mandas, cada fila trae un `verdict` (semáforo) comparando contra este umbral.",
            },
            {
              name: "advertisingAccountIds",
              in: "query",
              schema: { type: "string" },
              description: "Ids internos de cuenta publicitaria, separados por coma. Salen de `/context`.",
            },
            {
              name: "campaignIds",
              in: "query",
              schema: { type: "string" },
              description: "Ids internos de campaña, separados por coma.",
            },
            {
              name: "adSetIds",
              in: "query",
              schema: { type: "string" },
              description: "Ids internos de conjunto, separados por coma.",
            },
          ],
          responses: respuestas("Filas del nivel pedido, con totales.", {
            desde: "2026-09-01",
            hasta: "2026-09-09",
            level: "ad",
            rows: [
              {
                id: "…",
                name: "1.2 IMG Caliente",
                campaignName: "WPP CAMPAÑA ABO COLLAR",
                adSetName: "1. Conjunto Caliente",
                effectiveStatus: "ACTIVE",
                creativeObjectType: "SHARE",
                spend: 506890,
                impressions: 67707,
                clicks: 1418,
                conversations: 342,
                purchases: 106,
                ctr: 2.09,
                cpm: 7487,
                cpc: 357,
                costPerConversation: 1482,
                roas: 6.66,
                daysWithData: 15,
                presupuestoDiario: 31000,
                pctEntregaMedia: 110.4,
                bidStrategy: "LOWEST_COST_WITHOUT_CAP",
                configSyncedAt: "2026-09-10T02:00:00.000Z",
                daily: [
                  { ymd: "2026-09-01", spend: 36834, impressions: 4810, conversations: 22, ctr: 1.77, pctEntrega: 118.8 },
                ],
              },
            ],
            totals: { spend: 1871877, conversations: 570, purchases: 168 },
          }),
        },
      },

      "/api/agent/cpa/daily": {
        get: {
          tags: ["Rentabilidad"],
          summary: "CPA por producto y día — la cifra que decide",
          description:
            "Pedidos **reales** de Dropi cruzados con el gasto publicitario, día a día y por producto.\n\n" +
            "Esta es la fuente de verdad para juzgar si un producto deja plata. Todo lo demás es señal.\n\n" +
            "**Cómo leer los campos raros:**\n" +
            "- `ventas`: pedidos activos generados ese día. No distingue entregado de devuelto.\n" +
            "- `cpa` en `null` con gasto > 0 **no es «sin dato»**: es cero ventas, la peor señal " +
            "posible. Trátalo como infinito al ordenar.\n" +
            "- `rentabilidadPct`: qué porcentaje de la ganancia se come el anuncio. Por encima de 100 " +
            "estás perdiendo.\n" +
            "- `utilidadAproximada`: optimista, ver la nota 8 de la introducción.",
          parameters: [
            paramDesde,
            paramHasta,
            {
              name: "productId",
              in: "query",
              schema: { type: "string" },
              description: "Id del producto del catálogo (sale de `/context`). Sin él, todos.",
            },
          ],
          responses: respuestas("Una fila por producto y día.", {
            desde: "2026-09-01",
            hasta: "2026-09-09",
            rows: [
              {
                fecha: "2026-09-08",
                productoId: "cmrnnv5940n3jl7vnu3sqgw1j",
                producto: "Collar Girasol Giratorio CajaRosa",
                gastoPublicidad: 59977,
                conversaciones: 52,
                ventas: 10,
                totalFacturado: 754400,
                gananciaPromedio: 25994,
                cpa: 5998,
                conversionRate: 0.192,
                rentabilidadPct: 23,
                utilidadAproximada: 145984,
              },
            ],
            notas: ["…advertencias de lectura…"],
          }),
        },
      },

      "/api/agent/delivery/by-product": {
        get: {
          tags: ["Entregas"],
          summary: "Entregados, devueltos y en tránsito por producto",
          description:
            "En contra entrega, **esto es lo que decide si un producto deja plata**. Un CPA bonito " +
            "con 40% de devoluciones pierde dinero.\n\n" +
            "**Trampa importante:** el rango filtra por fecha del *pedido*, no de la entrega. Los " +
            "pedidos recientes siguen en tránsito, así que su `pct` de entrega se ve artificialmente " +
            "bajo. Mira `pctPendientes`: si es alto, el porcentaje todavía no concluye nada.\n\n" +
            "La tasa no sesgada es **entregados ÷ (entregados + devueltos)**, o sea solo sobre los " +
            "que ya se resolvieron.\n\n" +
            "`gastoPublicitario` viene en 0 en esta ruta: el gasto está en `/cpa/daily` o " +
            "`/spend/by-product`. Por eso `margen` aquí es margen de producto **sin descontar " +
            "publicidad** — no lo leas como utilidad.",
          parameters: [paramDesde, paramHasta],
          responses: respuestas("Desglose por producto.", {
            desde: "2026-09-01",
            hasta: "2026-09-09",
            entregadosByProduct: [
              {
                productKey: "cmp1zlboz00010h6g81i4b8ko",
                productName: "SHAMPOO EN BARRA",
                pedidosEnviados: 34,
                pedidos: 13,
                pendientes: 18,
                pct: 38.2,
                pctPendientes: 52.9,
              },
            ],
            devolucionesByProduct: [{ productName: "SHAMPOO EN BARRA", pedidos: 3, pct: 8.8 }],
            totalPedidosByProduct: [
              {
                productName: "SHAMPOO EN BARRA",
                pedidos: 34,
                gananciaEntregados: 521709,
                perdidasDevoluciones: 54303,
                gananciaPendientes: 718685,
                gastoPublicitario: 0,
              },
            ],
            notas: ["…"],
          }),
        },
      },

      "/api/agent/delivery/by-location": {
        get: {
          tags: ["Entregas"],
          summary: "Entregas y devoluciones por ciudad o departamento",
          description:
            "Para decidir **qué ubicaciones excluir de la segmentación**: una ciudad que devuelve el " +
            "40% se lleva la plata aunque el anuncio funcione bien.\n\n" +
            "Aquí `desde` y `hasta` son opcionales; sin ellos toma todo el histórico, que para esta " +
            "pregunta suele ser lo correcto —cuantos más pedidos resueltos, más fiable el porcentaje.\n\n" +
            "Usa `minPedidos` para no sacar conclusiones de una ciudad con 2 pedidos.",
          parameters: [
            { ...paramDesde, required: false, description: "Opcional. Sin rango, todo el histórico." },
            { ...paramHasta, required: false, description: "Opcional." },
            {
              name: "dimension",
              in: "query",
              schema: { type: "string", enum: ["ciudad", "departamento"], default: "ciudad" },
              description: "Agrupar por ciudad o por departamento.",
            },
            {
              name: "productId",
              in: "query",
              schema: { type: "string" },
              description: "Filtra a un solo producto del catálogo.",
            },
            {
              name: "minPedidos",
              in: "query",
              schema: { type: "integer", example: 10 },
              description: "Descarta ubicaciones con menos pedidos que esto. Muy recomendable.",
            },
          ],
          responses: respuestas("Filas por ubicación, ordenadas.", {
            dimension: "departamento",
            totales: { pedidos: 65, entregados: 25, devueltos: 7, pctEntrega: 38.5 },
            rows: [
              {
                ubicacion: "CUNDINAMARCA",
                pedidos: 19,
                entregados: 6,
                devueltos: 4,
                enTransito: 9,
                pctEntrega: 31.6,
                pctDevolucion: 21.1,
                pctPendiente: 47.4,
                gananciaEntregados: 209660.5,
                perdidaDevoluciones: 56728,
                gananciaNeta: 152932.5,
                gananciaPorPedido: 8049.08,
              },
            ],
          }),
        },
      },

      "/api/agent/events": {
        get: {
          tags: ["Empezar aquí"],
          summary: "Bitácora: qué cambió en la operación y cuándo",
          description:
            "**Consúltala antes de explicar cualquier cambio en las cifras.** Un CPA que se dispara " +
            "el martes casi siempre tiene una causa el lunes, y suele estar aquí.\n\n" +
            "La mayoría de las filas las escribe el import solo, comparando la configuración que " +
            "trae Meta contra la guardada: subidas y bajadas de presupuesto, cambios de estrategia " +
            "de puja, pausas y activaciones. Las de `automatico: false` son notas escritas a mano, " +
            "para lo que Meta no sabe — que cambió la oferta, que subió el precio, que se agotó el " +
            "stock.\n\n" +
            "**`ocurrioEn` es cuándo se detectó, no cuándo se hizo.** El import compara contra lo " +
            "guardado, así que un cambio hecho por la mañana aparece con la hora del import. Acota " +
            "la fecha, no la hora.\n\n" +
            "Un evento de tipo `PRESUPUESTO` reinicia el aprendizaje de Meta: **los días " +
            "posteriores no son comparables con los anteriores**, y los primeros suelen ser peores " +
            "sin que eso signifique que el cambio fue malo.",
          parameters: [
            { ...paramDesde, required: false, description: "Opcional." },
            { ...paramHasta, required: false, description: "Opcional." },
            {
              name: "tipo",
              in: "query",
              schema: { type: "string", example: "PRESUPUESTO,PUJA" },
              description:
                "Filtra por tipo, separados por coma: PRESUPUESTO, ESTADO, PUJA, OFERTA, PRECIO, STOCK, CREATIVO, OTRO.",
            },
            {
              name: "entidadId",
              in: "query",
              schema: { type: "string" },
              description: "Historial de un solo conjunto, campaña o producto.",
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 200, maximum: 500 },
              description: "Máximo de filas. Se devuelven las más recientes primero.",
            },
          ],
          responses: respuestas("Eventos, del más reciente al más antiguo.", {
            rows: [
              {
                id: "…",
                ocurrioEn: "2026-09-03T14:20:00.000Z",
                tipo: "PRESUPUESTO",
                entidad: "ADSET",
                entidadId: "…",
                etiqueta: "4.2 Cliente MENOS ESPACIO, MENOS DESORDEN",
                valorAntes: "14.000",
                valorDespues: "20.000",
                nota: "El presupuesto diario de \"4.2 Cliente MENOS ESPACIO\" subió de 14.000 a 20.000 (+43%). Un cambio de presupuesto reinicia el aprendizaje: los primeros días no son comparables.",
                automatico: true,
              },
            ],
            notas: ["…advertencias de lectura…"],
          }),
        },
      },

      "/api/agent/orders/breakdown": {
        get: {
          tags: ["Entregas"],
          summary: "Pedidos agregados por transportadora, estado o tiempo de tránsito",
          description:
            "Responde preguntas que el CPA no puede. Si una transportadora entrega al 65% y otra " +
            "al 85%, eso mueve más plata que cualquier ajuste de puja.\n\n" +
            "**Usa `pctEntregaResueltos`, no `pctEntrega`.** El primero mira solo los pedidos que " +
            "ya terminaron (entregados + devueltos) y es el único comparable entre grupos. El " +
            "segundo divide entre todos, incluidos los que siguen en camino, y castiga a los " +
            "grupos con pedidos recientes.\n\n" +
            "`margenBruto` es venta − flete − costo de proveedor − costo de las devoluciones. **No " +
            "descuenta publicidad**: eso vive en `/cpa/daily`.\n\n" +
            "`dias_transito` agrupa en tramos (0-2, 3-5, 6-8, 9-15, más de 15) porque el número " +
            "exacto no dice nada. En contra entrega, un tramo lento suele traer más devoluciones — " +
            "y eso se arregla con la transportadora, no con el anuncio.\n\n" +
            "Solo cuenta y suma: no expone ningún pedido concreto ni dato de cliente.",
          parameters: [
            {
              name: "dimension",
              in: "query",
              schema: {
                type: "string",
                enum: ["transportadora", "estado", "departamento", "dias_transito"],
                default: "transportadora",
              },
              description: "Por qué agrupar.",
            },
            { ...paramDesde, required: false, description: "Opcional. Filtra por fecha del PEDIDO." },
            { ...paramHasta, required: false, description: "Opcional." },
            {
              name: "minPedidos",
              in: "query",
              schema: { type: "integer", example: 10 },
              description: "Descarta grupos con menos pedidos. Un 100% sobre 2 pedidos no significa nada.",
            },
          ],
          responses: respuestas("Filas por grupo, más los totales.", {
            dimension: "transportadora",
            rows: [
              {
                clave: "SERVIENTREGA",
                pedidos: 48,
                entregados: 31,
                devueltos: 7,
                enTransito: 10,
                pctEntrega: 64.6,
                pctDevolucion: 14.6,
                pctEntregaResueltos: 81.6,
                venta: 3120000,
                flete: 412000,
                costoProveedor: 1180000,
                costoDevoluciones: 98000,
                margenBruto: 1430000,
                margenPorPedido: 29791.67,
                diasHastaResolver: 4.5,
              },
            ],
            totales: { clave: "TOTAL", pedidos: 65, pctEntregaResueltos: 79.2 },
            notas: ["…advertencias de lectura…"],
          }),
        },
      },

      "/api/agent/spend/by-product": {
        get: {
          tags: ["Rentabilidad"],
          summary: "Gasto de Meta agrupado por producto",
          description:
            "Cuánto se gastó en publicidad por producto en el rango, según los vínculos " +
            "campaña ↔ producto configurados en el dashboard.\n\n" +
            "`total` incluye todo el gasto; la suma de `byProduct` puede ser menor si hay campañas " +
            "sin producto vinculado. Esa diferencia es gasto que no se está atribuyendo a nadie, y " +
            "vale la pena mirarla.",
          parameters: [paramDesde, paramHasta],
          responses: respuestas("Gasto total y desglose.", {
            desde: "2026-09-01",
            hasta: "2026-09-09",
            total: 1146333,
            metricRowsWithSpend: 18,
            byProduct: [
              {
                productId: "cmp1zlboz00010h6g81i4b8ko",
                productName: "SHAMPOO EN BARRA",
                amount: 620844,
                metricDays: 9,
              },
            ],
          }),
        },
      },
    },
  };
}

/**
 * Página de Swagger UI.
 *
 * Carga la librería desde CDN y lleva su propia cabecera `Content-Security-Policy`: helmet
 * pone por defecto `default-src 'self'`, que bloquearía el script y las hojas de estilo.
 * El permiso se abre **solo en esta ruta**, no en toda la aplicación.
 */
export function agentDocsHtml(specUrl: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API de análisis · FersuaStore</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .topbar { display: none; }
      .swagger-ui .info { margin: 24px 0; }
      .swagger-ui .info .title { font-size: 32px; }
      .swagger-ui .info table { border-collapse: collapse; margin: 8px 0; }
      .swagger-ui .info table td, .swagger-ui .info table th {
        border: 1px solid #ddd; padding: 6px 10px; text-align: left;
      }
      #aviso {
        background: #1f6feb; color: #fff; padding: 12px 20px;
        font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      #aviso code { background: rgba(255,255,255,.18); padding: 1px 5px; border-radius: 3px; }
    </style>
  </head>
  <body>
    <div id="aviso">
      Para ejecutar cualquier ruta, pulsa <strong>Authorize</strong> y pega tu credencial
      (empieza por <code>fsa_</code>). Es de solo lectura: no puede modificar nada.
    </div>
    <div id="swagger"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: "#swagger",
        deepLinking: true,
        persistAuthorization: true,
        defaultModelsExpandDepth: -1,
        docExpansion: "list",
        tryItOutEnabled: true,
      });
    </script>
  </body>
</html>`;
}
