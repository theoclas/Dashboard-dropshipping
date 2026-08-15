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
