# Desarrollo local (Fersua Dashboard)

## Requisitos

- Node.js reciente (LTS)
- Docker (MySQL definido en `docker-compose.yml` en la raíz del repo Dashboard)

## Arranque

1. Levanta MySQL: desde la raíz del proyecto Dashboard, `docker compose up -d` (puerto host habitual `3307`, ver `docker-compose.yml`).
2. Copia `back/.env.example` a `back/.env` y ajusta `DATABASE_URL` y `JWT_SECRET`.
3. Define `IMPORT_WIPE_SECRET` en `back/.env` si quieres usar la limpieza desde la UI (Importaciones → solo ADMIN).
4. En `back/`: `npm install`, `npx prisma generate`, `npx prisma db push` (o `npm run prisma:migrate` si usas migraciones).
5. API: `npm run dev` en `back/` (puerto `4000` por defecto).
6. Front: `cp front/.env.example` si existe, o `VITE_API_URL=http://localhost:4000/api`; luego `npm install` y `npm run dev` en `front/`.

## Orden de importación recomendado

1. **Mapeo de estados** (Excel o CRUD en pantalla «Mapeo estados») — recomendado antes de pedidos para evitar `SIN MAPEAR`.
2. **Cartera** → **Productos** → **Pedidos** (pantalla «Importaciones»).
3. Tras cambiar mapeo sobre datos ya cargados: botón **Remapear pedidos «SIN MAPEAR»**.
4. **CPA** es independiente; cada import CPA **reemplaza** todas las filas CPA de la empresa activa.

## Datos demo

- Crea empresa y admin con `POST /api/auth/register` (ver mensaje en pantalla de login) o flujo que ya uses.
- Asigna usuarios desde **Empresas** (rol ADMIN).
- Valida en MySQL (Workbench, DBeaver, etc.) tablas `pedidos`, `productos_detalle`, `cartera_movimientos`, `mapeo_estados`, `cpas` filtrando por `company_id`.

## Pruebas automáticas (backend)

En `back/`: `npm test` — incluye comprobaciones mínimas de `IMPORT_WIPE_SECRET` / limpieza.
