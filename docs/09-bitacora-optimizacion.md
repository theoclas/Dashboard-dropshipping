# Bitácora de optimización de campañas

Registro de qué se analizó, qué se decidió y con qué evidencia. Se agrega una entrada por sesión.
Sirve para dos cosas: no repetir análisis y —sobre todo— **poder mirar atrás y saber si la decisión
funcionó**.

Formato de cada entrada: fecha · qué se miró · qué se encontró · qué se hizo · qué falta verificar.

---

## 2026-08-15 — Shampoo en Barra, cuentas 1 y 3

### Qué se miró

Nivel anuncio agrupado por conjunto, día por día, del 12 al 14 de agosto. Las dos campañas
`🟡 WEB 12/08/2026 ABO SHAMPOO` (mismo nombre, cuentas distintas):

- **1ra CUENTA PUBLICITARIA FER** (`52611063937531`) — conjuntos 3.x CALIENTE + 4.x CLIENTE
- **3ra Cuenta Publicitaria** (`120251120511650548`) — conjuntos 1.x FRIO + 2.x TIBIO

No son la misma prueba duplicada: entre las dos cubren cuatro temperaturas de audiencia.

### Qué se encontró

**El CPA objetivo es $26.493**, no el margen bruto. Ver la nota de economía: 20% de devoluciones
que además cuestan flete. Con CPA real de ~$32.000, el shampoo estaba perdiendo plata.

**Ranking por temperatura** (12-14 ago, $390.064 y 17 compras):

| Temperatura | Gasto | CPM | CTR | Costo/compra |
|---|---:|---:|---:|---:|
| CALIENTE | $101.722 | $13.854 | 1,75% | $20.344 |
| CLIENTE | $100.319 | $14.851 | 2,08% | $20.064 |
| FRIO | $90.100 | $16.349 | 1,96% | $22.525 |
| TIBIO | $97.923 | $22.387 | **2,64%** | **$32.641** |

TIBIO: el mejor CTR y el peor resultado. Cuarto producto consecutivo con el mismo patrón.

**Frecuencias entre 1,02 y 1,24 en todos los conjuntos** — sin saturación en ninguna audiencia.
El problema no es fatiga.

**El problema es el CPM.** $14.000–$22.000 contra $4.900 de las campañas de collar. Hipótesis sin
confirmar: **12 conjuntos de shampoo corriendo a la vez** entre las dos cuentas, varios apuntando a
la misma temperatura con distintos ángulos, compitiendo entre sí en la subasta.

### Qué se hizo

Apagados (16 de 16 aplicados y verificados por reimportación):

| Cuenta | Qué | Por qué |
|---|---|---|
| 3ra | **TIBIO completo** (2.1, 2.2, 2.3 — 10 anuncios) | $97.923 para 3 compras |
| 1ra | `Caliente 3.3.2` | CTR 0,79% con 49,5% de su conjunto |
| 1ra | `Cliente 4.3.1` | CPM $32.526; un día marcó $110.765 |
| 1ra | `Caliente 3.1.4` | 0 clics en 122 impresiones |
| 3ra | `Frio 1.3.1` | CTR 1,12% contra 2,84% de su hermano |
| 3ra | `Frio 1.1.2` | CPM $38.774, entrega rota |
| 3ra | `Frio 1.2.3` | CTR 0% |

Liberó el **37,4% del gasto histórico**. Los sobrevivientes habrían rendido $19.009 por compra
contra $22.945 — 17% mejor, pero es cálculo retrospectivo, no resultado.

### Qué falta verificar

- **No hay datos posteriores al cambio.** El último día con gasto sigue siendo el 14 de agosto.
  Importar el 15 y el 16 antes de sacar conclusiones.
- `Cliente 4.1.3` quedó activo con CPM $52.875 y cero clics — se pasó por alto, hay que apagarlo.
- **Meta le da el 87% del presupuesto al peor anuncio de los dos mejores conjuntos**: `4.1.1`
  (1 compra en $35.005) y `1.2.1` (0 compras en $27.448), mientras `4.1.4` y `1.2.2` venden con el
  7-11%. Si sigue igual, sacar los dos que venden a conjuntos propios.
- `4.3` y `1.1` van en $26.868 y $24.367 con cero compras. Todavía dentro del ruido; se mueren al
  llegar a $53.000 (2× el CPA objetivo) sin vender.
- Reconstruir `cpa_experimental` de los días recientes: se toma como snapshot y queda incompleto.

### Palancas que no se tocaron y valen más que mover presupuesto

1. **Consolidar conjuntos** para dejar de competir contra uno mismo y bajar el CPM.
2. **Bajar las devoluciones del 20% al 12%** — sube el equilibrio a ~$30.000 sin tocar publicidad.

---

## 2026-08-15 — Collar Girasol CajaRosa

### CPA objetivo

**$17.695 por pedido generado** (julio: 61 pedidos, 70,5% entrega, **26,2% devoluciones**,
$31.337 por pedido entregado). Más ajustado que el shampoo y con peor tasa de devolución.

### Estado de la campaña principal (`CAJAROSA 14/07`, 1-14 ago)

$819.366 · CPM $5.857 · 493 conversaciones a $1.662 · 89 compras · cierre 18,1% ·
**$9.206 por compra → gana $8.489 por venta.** Rentable incluso castigándola por el
sobrerreporte de Meta.

| Conjunto | CPM | Costo/conv | Cierre | Costo/compra |
|---|---:|---:|---:|---:|
| 1. Caliente | $4.728 | $1.363 | 19,6% | **$6.956** |
| 3. Frio | $6.469 | $1.757 | 17,7% | $9.914 |
| 2. Tibio | $8.071 | $2.364 | 14,1% | $16.744 |

Estructura limpia: **un anuncio por conjunto**. Probablemente por eso el CPM es un tercio del
que paga el shampoo, que tenía 3-5 anuncios por conjunto y 12 conjuntos compitiendo.

### El cambio del 14 de agosto y su resultado

Se apagó Tibio (−$14.564/día) y se subió a los otros dos (+$7.510/día).

| | 13 ago | 14 ago | |
|---|---:|---:|---|
| Gasto | $58.523 | $51.469 | −12% |
| Conversaciones | 32 | 34 | +6% |
| Compras | 8 | 8 | igual |
| **Costo/compra** | $7.315 | **$6.433** | **−12%** |

Frio absorbió el aumento muy bien (costo/conv de $1.756 a **$1.126**); Caliente empeoró ese día
($1.297 → $2.068). **La causa probable no fue el presupuesto sino la campaña INT**, que ese mismo
día gastó $18.125 sobre las mismas audiencias. Al pausarla, el 15 los dos bajaron de CPM.

### La campaña INT: objetivo equivocado, no creativos malos

`CAMPAÑA INT ABO GIRASOL CAJAROSA 11/08` estaba optimizada por **interacciones**. Por eso tenía
mejor CTR (2,19% vs 1,64%) y el triple de costo por conversación ($5.126 vs $1.662): Meta buscaba
gente que reacciona, no que escribe.

**Su data no sirve para elegir creativos ganadores** — Meta le dio el 80,7% del presupuesto al
anuncio de *menor* CTR, porque optimizaba por reacciones y comentarios, no por clics. Cada creativo
recibió una sub-audiencia distinta.

Pausada el 14. Los creativos se reutilizan tal cual en una campaña nueva de ventas: nunca tuvieron
una prueba justa.

### Decisiones tomadas el 15 de agosto

- Subido Caliente a ~$32.000/día y Frio a ~$26.000/día. Aumentos bajo el 20% para no reactivar la
  fase de aprendizaje.
- **Test de creativos aplazado al martes 18.** El lunes 17 es festivo en Colombia y se comporta
  como domingo; el primer día hábil normal es el martes. La regla de "no testear en fin de semana"
  aplica al test, no a escalar una campaña ya madura — y los datos propios no muestran castigo de
  fin de semana ($7.210 por compra el finde contra $7.285 entre semana).

### Qué falta verificar

- Efecto del aumento: revisar el martes con el lunes ya cerrado. **Sábado, domingo y festivo son
  tres días atípicos seguidos** — no sacar conclusiones duras de esa ventana.
- Si el CPM de Caliente vuelve a $4.500-5.000, confirma que el problema del 14 era la INT y se
  puede subir otro 30%. Si se queda sobre $5.500, es techo de audiencia.
- El test de creativos volverá a competir por la audiencia Caliente (~30% del gasto). Ese es el
  precio de testear; hay que mirarlo en el CPM de la principal.
- La campaña de **VIDEOS del Girasol Giratorio**, pausada el 5 de agosto, iba en $14.652 contra un
  objetivo de $21.026 — era rentable. Su debilidad era el cierre (9,7% contra 18,1%), no el
  tráfico: tiene el CPM más bajo de toda la cuenta ($4.362). Vale revisarla.

### Nota sobre el módulo

Una campaña creada pero sin entregar **no aparece en el dashboard**: el import se alimenta de
`/insights`, que solo devuelve campañas con entrega. Mejora pendiente: leer también los edges
`/campaigns`, `/adsets` y `/ads` para ver la estructura antes del primer peso gastado.

---

## 2026-08-18 — Segunda ronda: shampoo y collar

### Shampoo — resultado de la ronda 1 (apagados del 15)

Validada. Sobre días hábiles comparables el CPA real pasó de **$25.025 a $18.352** (−27%), y el
martes 18 cerró en **$16.544 por venta**, el mejor día del producto.

La semana completa quedó en $26.549 contra un equilibrio de $26.493 — cero neto — porque el
domingo 16 y el festivo 17 costaron **$267.159 para 6 ventas ($44.527 cada una)**. Dos días
borraron la ganancia de cuatro. Vigilar si se repite el domingo 23.

Hallazgo estructural: **entre el 12 y el 18 el CPM subió en todos los conjuntos** aunque el gasto
diario cayó 40%. No es concentración de presupuesto — la audiencia del producto se agota en bloque.
El único que aguantó fue `4.1 RECOMPRA POR PACKS` (+14% de CPM contra +29% a +110% del resto).

### Shampoo — ronda 2, aplicada el 18 a las 18:00

- `4.1 RECOMPRA` de $17.000 a **$21.000** (+23,5%)
- `3.2 VIAJES` de $12.000 a **$15.000**
- Apagados: `4.3 ADIÓS A TANTAS BOTELLAS` y **los tres conjuntos FRIO de la cuenta 3**

Los cuatro apagados alcanzaron a gastar $29.880 ese día — el 35% del gasto del martes — con CPM
entre $29.527 y $40.781 contra los $14.425 de 4.1.

Gasto diario del shampoo: de ~$112.700 a **~$72.000 (−36%)**. La cuenta 3 sale completa del producto.

**Presupuesto compartido, confirmado.** Por eso los conjuntos gastan por encima de su asignación
individual y por eso subir a dos conjuntos le quita a los otros tres sin tocarlos.

### Collar CajaRosa — el aumento del 15 funcionó

| | Antes (8–13) | Después (16–17) | |
|---|---|---|---|
| Gasto/día | $45.908 | $67.014 | **+46%** |
| Conversaciones/día | 34,5 | 47,5 | +38% |
| Compras/día | 6,2 | 8,5 | +37% |
| Costo/compra | $7.405 | $7.884 | +6% |

**Absorbió 46% más presupuesto con el costo por venta subiendo solo 6%.** CPM de Caliente +8%,
el de Frio **−2%**. Frecuencia entre 1,14 y 1,23 sin moverse.

Con pedidos reales: 23 ventas del 15 al 18 a **$10.110** contra un objetivo de $17.695 —
unos **$174.000 de utilidad en cuatro días**, incluyendo domingo y festivo, que en este producto
no hacen daño.

Los dos conjuntos estaban **topando su presupuesto** (Caliente gastó 125% de su asignación, Frio
114%): limitados por plata, no por audiencia.

### Collar — aumento aplicado el 18

- `1. Caliente` de $30.000 a **$39.000**
- `3. Frio` de $28.000 a **$36.400**
- Total activo: de $58.000 a **$75.400/día**

`2. Tibio` y `4. Cliente` siguen apagados y así deben seguir: Tibio gastó $200.928 para 12 compras
con cierre del 14,1%; los conjuntos Cliente, $86.816 para 2 compras con cierre del 3,9%.

### Campaña nueva de ventas — primer día

`🟡 CAMPAÑA Vent ABO GIRASOL CAJAROSA 17 08 2026`, arrancó el 18 con arranque parcial (Meta no
activó algunos anuncios). Cinco anuncios corriendo: uno de video y cuatro en el conjunto Frio.

| | Campaña principal | **Campaña nueva** |
|---|---|---|
| CPM | $5.473 | **$1.480** |
| CTR | 1,86% | **4,03%** |
| **Clic → conversación** | **22%** | **0,46%** |
| Costo/conversación | $1.337 | **$8.038** |

CPM 73% más barato y CTR el doble, pero **la conversión de clic a conversación es 48 veces peor**.
Es la firma del tráfico basura: clics baratos y abundantes que no escriben. Primer sospechoso:
las ubicaciones (Audience Network y similares).

Un día y con arranque roto, así que no se juzga todavía. **Umbral: si al tercer día el costo por
conversación sigue sobre $4.000, revisar ubicaciones antes que creativos.**

### Qué falta

- Revisar el **viernes 21** con miércoles y jueves cerrados en los tres frentes.
- Construir el **job diario** de import y el **registro de cambios desde Meta** (`/activities`),
  para no depender de que los movimientos se recuerden a mano.
- Traer los **presupuestos** al módulo, para medir aprovechamiento real.

---

## 2026-08-22 — Shampoo: la poda funcionó, y dos correcciones importantes

Primera entrada en la que las conclusiones se sometieron a **verificación adversarial** antes de
recomendar mover presupuesto: cuatro escépticos independientes intentaron refutarlas. **Las cuatro
cayeron**, y con razón. Lo que sigue es la versión corregida.

### Corrección 1 — la semana del 12 al 18 no quedó en cero: se perdió plata

El cálculo anterior ($26.549) usaba el gasto que registra `cpa_experimental`, que solo cuenta
campañas vinculadas al producto. El correcto usa **todo** el gasto de Meta:

**$906.810 ÷ 33 pedidos reales = $27.479 por pedido**, contra un equilibrio de $26.493.
Pérdida de la semana: **~$32.500**.

### Corrección 2 — el pixel de Meta no sirve como cifra de decisión

Se había concluido que el pixel era buen proxy porque en 12-18 marcó 35 compras contra 33 reales
(~6% de diferencia). **Es falso**: ese 6% es un neto que cancela errores opuestos.

- Error absoluto acumulado: 8 sobre 33 = **24%**. Por día llega a **+150%** (17 ago: pixel 5,
  reales 2) y **−40%** (18 ago: pixel 3, reales 5).
- **3 de 7 días el pixel manda la decisión contraria** respecto al equilibrio.
- Con 35 vs 33 conteos, el IC95 del cociente va de 0,66 a 1,71: no hay poder para detectar sesgos
  menores al 40%.
- Y volvió a fallar en la ventana siguiente: reportó 17 compras del 19 al 22 y hubo **19 reales**
  (−12%, al revés que la semana anterior).

Ver la nota de memoria `meta-sobrereporta-compras`, ya corregida.

### El resultado real de la poda

Pedidos reales de Dropi:

| | Antes (12–18) | Después (19–22) |
|---|---:|---:|
| Gasto | $906.810 | $271.854 |
| Ventas reales | 33 | 19 |
| **CPA real** | **$27.479** | **$14.308** |
| Resultado | −$32.500 | **+$231.500** |

Día a día del período nuevo: $26.303 (mié 19, primer día tras el cambio, aún en aprendizaje) →
$13.604 → $14.218 → **$8.973** (sáb 22).

**El dato que lo demuestra todo: ventas por día antes 4,71, después 4,75.** Se vende exactamente lo
mismo gastando la mitad. Los ~$70.000 diarios recortados **no producían ni una venta adicional**.

Significancia: si la eficiencia anterior se hubiera mantenido, $271.854 debían producir 9,9 ventas;
produjeron 19 (2,9 sigma, **p ≈ 0,002**). Excluyendo el sábado por si está parcial: 13 contra 7,9
esperadas, p ≈ 0,036. Sigue significativo.

### Lo que los escépticos dejaron en pie y hay que respetar

- **El CPM es una tendencia, no un escalón**: $15.419 (12 ago) → $23.518 (22 ago), **+53% en diez
  días mientras el gasto caía a la mitad**. Descarta que sea por concentrar presupuesto: es
  agotamiento del pool. Deja una o dos semanas de margen.
- **La mejora de CTR y clic-a-compra es un escalón de una sola vez** — efecto aritmético de apagar
  16 de 40 anuncios. Un escalón no puede seguir compensando una tendencia.
- **Riesgo estructural no contabilizado**: 11 de 17 compras vienen de audiencias de lista de
  clientes (4.1 RECOMPRA, 4.2 CLIENTE) y el 18 se apagó toda la prospección FRÍO. Se está
  cosechando la base sin reponerla — eso explica a la vez el buen CPA y el CPM en alza.
- **Los rankings por conjunto a este volumen son ruido**: 4.2 pasó de peor conjunto del 15-18
  ($51.727/compra) a mejor del 19-22 ($11.177) sin ningún cambio de configuración. Regresión a la
  media con n=4.
- **El umbral de $26.493 se calculó sobre la mezcla de julio.** La mezcla actual es mayoritariamente
  recompra, que plausiblemente entrega mejor. Cada temperatura podría tener su propio equilibrio.

### Decisiones tomadas el 22 de agosto

- **Capado `3.3 MENOS PLÁSTICO`** a la mitad. Único corte con base estadística que no depende de
  ninguna conversión: peor CPM de la cuenta ($26.582, +101%) y **CPC de $997, un 47% por encima**
  del $678 de 4.1, medido sobre 1.613 impresiones.
- **NO se apagó `3.1 REEMPLAZA LA BOTELLA`.** Se iba a recomendar y habría sido un error: su CPC es
  $682 —prácticamente idéntico al $678 del mejor conjunto— y tiene el **CTR más alto de los cinco**
  (2,89%). Toda su desventaja vive en un único evento de conversión. Además la regla escrita el 15
  dice que un conjunto muere a los $53.000 **sin vender**, y 3.1 va en $49.148 **con** una venta.
- **NO se escaló nada.** Antes se justificaba por el CPM; ahora hay prueba directa: el dinero
  recortado producía cero ventas, así que devolverlo produciría cero.

### Regla de corte, escrita antes de volver a mirar la tabla

Un conjunto se apaga cuando **acumula ≥3 conversiones y su costo por pedido real (Dropi) se mantiene
sobre $26.493**, o cuando llega a $53.000 **sin vender**. Sin excepciones improvisadas.

### Qué falta

- **El domingo 23 es la prueba pendiente.** El domingo 16 y el festivo 17 costaron $267.263 para 6
  ventas ($44.544 cada una). La configuración nueva no ha pasado un domingo. Si vuelve a costar el
  triple, programar la campaña para no correr domingos.
- **Pedidos reales por conjunto.** `cpa_experimental` es por producto y día, no por conjunto, así
  que las decisiones a nivel conjunto siguen apoyándose en CPM y CPC. Es la limitación de fondo.
- **Entrega y devolución de agosto por temperatura de audiencia**, para saber si $26.493 sigue
  siendo el umbral correcto para esta mezcla.
- **Reabrir prospección fría.** Con el producto dejando ~$57.000 diarios hay margen para
  financiarla. Ese es el próximo movimiento, no escalar lo existente.
