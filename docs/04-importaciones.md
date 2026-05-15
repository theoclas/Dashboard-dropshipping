# Importaciones

## Wizard (UI)

Ruta de menú: **Importaciones**. Orden recomendado:

1. **Cartera** — `POST /api/import/cartera/` (multipart `file`).
2. **Productos** — `POST /api/import/productos/`.
3. **Pedidos** — `POST /api/import/pedidos/`.

Respuesta habitual: `{ imported, errors }` (errores por fila u operación según implementación).

## Mapeo de estados

- **CRUD**: `GET/POST/PATCH/DELETE /api/mapeo-estados` (filtrado por empresa del token / header).
- **Excel**: `POST /api/import/mapeo-estados/`.
- **Remapeo**: `POST /api/import/remapear-estados` recalcula pedidos con `estadoUnificado = "SIN MAPEAR"` en lotes, solo para la empresa activa.

## Limpieza (wipe)

Requiere variable de entorno `IMPORT_WIPE_SECRET` en el backend y rol **ADMIN**.

- `POST /api/import/wipe-imported-tables` — cuerpo `{ "password": "<IMPORT_WIPE_SECRET>" }`. Borra `pedidos`, `productos_detalle`, `cartera_movimientos` de la empresa activa.
- `POST /api/import/wipe-cpa` — mismo esquema de contraseña; borra filas `cpas` de la empresa activa.

La contraseña se compara con hash SHA-256 de forma constante en tiempo.

## CPA

- `POST /api/import/cpa/` — importa Excel de CPA; **sustituye** todas las filas CPA de la empresa actual (no mezcla con datos antiguos).
- Listado reciente: `GET /api/cpa-records`.

## Export pedidos

- `POST /api/orders/export` — body opcional `{ "q": "texto" }` para filtrar como el listado; descarga `.xlsx`.
