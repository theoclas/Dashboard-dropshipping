# Checklist manual (local)

Después de `docker compose up`, `prisma db push` y `npm run dev` en back y front:

- [ ] Login y selector de empresa cargan `/auth/me` y `/companies`.
- [ ] **Importaciones**: subir cartera, luego productos, luego pedidos; revisar mensajes `imported` / `errors`.
- [ ] **Mapeo**: crear una fila manual o importar Excel; **Remapear** y comprobar en **Pedidos** que bajan los `SIN MAPEAR` cuando aplica.
- [ ] **Pedidos**: búsqueda, paginación y **Exportar Excel**.
- [ ] **Reportes**: pestañas por estado unificado y por ciudad coherentes con datos importados.
- [ ] **CPA**: importar Excel de prueba y ver filas en la tabla (máx. 200 en listado API).
- [ ] **ADMIN**: `IMPORT_WIPE_SECRET` en `.env`; limpiar datos importados y comprobar en DB que solo afecta la empresa activa.
- [ ] `npm test` en `back/` pasa.
