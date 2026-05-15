# Fase 0 - Architecture Foundation

## Estructura
- `back`: API REST TypeScript con Prisma y MySQL.
- `front`: React + Vite + Ant Design.
- `docs`: decisiones y guias por fase.

## Decisiones base
- Multiempresa por `company_id` en todas las tablas de dominio.
- Membresias N:N con `user_companies` y rol por empresa.
- JWT incluye empresa activa y rol de la membresia seleccionada.

## Convenciones
- Todas las rutas privadas requieren token y contexto de empresa.
- Toda query de dominio debe filtrar por `companyId`.
- Migraciones versionadas con Prisma.
