# Roadmap

## Fases locales L1–L7 (sin producción)

| Fase | Objetivo | Estado |
|------|-----------|--------|
| **L1** | UI y tipos de **Pedidos** alineados con Prisma (`cliente`, `ciudad`, `estadoOperativo`, `estadoUnificado`, `venta`, etc.) y listado paginado `GET /api/orders` | Hecho |
| **L2** | Pantalla **Importaciones**: cartera → productos → pedidos, endpoints alineados al flujo Dropi | Hecho |
| **L3** | **Mapeo de estados**: CRUD API, import Excel, remapeo masivo por empresa | Hecho |
| **L4** | `IMPORT_WIPE_SECRET`, wipe por empresa (pedidos/productos/cartera y CPA), modal/UI ADMIN | Hecho |
| **L5** | **CPA**: import desde Excel + vista listado; import sustituye CPA de la empresa | Hecho |
| **L6** | Reportes existentes + export Excel de pedidos (`POST /api/orders/export`) desde UI | Hecho |
| **L7** | Tests mínimos (`npm test` en back) + documentación local y checklist | Hecho |

Fuera de este roadmap local: despliegue Hostinger, CI remoto, observabilidad en nube.
