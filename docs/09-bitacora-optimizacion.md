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
