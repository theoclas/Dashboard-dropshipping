# Fase 1 - Backend Core Multiempresa

## Entregado
- API base en `back/src/server.ts`.
- Prisma schema MySQL en `back/prisma/schema.prisma`.
- Registro/login/me con JWT y empresa activa.
- Middleware de auth y company context obligatorio.

## Endpoints base
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET/POST /api/companies`
- `POST /api/companies/:companyId/users`
