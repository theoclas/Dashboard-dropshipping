# CONTEXTO PARA CURSOR — Automatización de Actividad de Pago / Facturación Meta Ads

## 1. Objetivo

Adaptar la aplicación existente para consultar, guardar y analizar información de **facturación, saldos y actividad de pago** de las cuentas publicitarias de Meta Ads de `FersuaStore`.

Este módulo es complementario al módulo de reportes de rendimiento que usa:

```http
/act_<AD_ACCOUNT_ID>/insights
```

Para facturación/pagos se debe trabajar principalmente con:

```http
/act_<AD_ACCOUNT_ID>?fields=...
/act_<AD_ACCOUNT_ID>/activities?fields=...
```

> Nota importante: la información visible en la pantalla de **Facturación y pagos > Actividad de pago** puede no estar expuesta 1:1 por API. Se debe probar el endpoint `/activities` y revisar el contenido de `extra_data` para determinar qué campos entrega Meta, especialmente identificadores de factura, estados de pago y detalles del método de pago.

---

## 2. Configuración ya realizada en Meta

Ya quedó configurado lo siguiente:

- Negocio / Portfolio comercial: `FersuaStore`
- App Meta Developers: `FersuaStore Reportes`
- Usuario del sistema: `API Reportes`
- Permiso del token: `ads_read`
- Las cuentas publicitarias fueron asignadas al usuario del sistema.
- El token fue probado correctamente en Graph API Explorer.
- El endpoint `/insights` ya respondió con datos reales usando `date_preset=yesterday`.

El token de acceso se guardará en `.env`.

---

## 3. Variables de entorno sugeridas

Agregar o validar estas variables:

```env
META_GRAPH_VERSION=v25.0
META_ACCESS_TOKEN=PEGAR_TOKEN_AQUI
META_AD_ACCOUNT_IDS=act_1471976967613858,act_27681534604769560,act_1744585636881421,act_139983555499119
META_BILLING_SYNC_ENABLED=true
META_TIMEZONE=America/Bogota
```

Reglas:

- Nunca imprimir `META_ACCESS_TOKEN` en logs.
- Nunca subir `.env` al repositorio.
- Agregar `.env` al `.gitignore`.
- Guardar fecha de caducidad del token para renovarlo antes de que falle el proceso.

---

## 4. Cuentas publicitarias actuales

De acuerdo con la pantalla de Facturación y pagos:

```txt
4ta CUENTA PUBLICITARIA FERSUASTORE
ID: 139983555499119
API ID: act_139983555499119

3ra CUENTA PUBLICITARIA FERSUASTORE
ID: 1744585636881421
API ID: act_1744585636881421

2nd CUENTA PUBLICITARIA FERSUASTORE
ID: 27681534604769560
API ID: act_27681534604769560

1ra CUENTA PUBLICITARIA FERSUASTORE
ID: 1471976967613858
API ID: act_1471976967613858
```

---

## 5. Endpoints a implementar / probar

### 5.1. Información general de la cuenta publicitaria

Usar este endpoint para obtener saldo, moneda, estado y datos generales.

```http
GET https://graph.facebook.com/{META_GRAPH_VERSION}/act_<AD_ACCOUNT_ID>
```

Parámetros sugeridos:

```txt
fields=account_id,name,currency,account_status,balance,amount_spent,spend_cap,funding_source_details,timezone_name,timezone_offset_hours_utc,business
access_token={META_ACCESS_TOKEN}
```

Ejemplo:

```http
GET https://graph.facebook.com/v25.0/act_1471976967613858?fields=account_id,name,currency,account_status,balance,amount_spent,spend_cap,funding_source_details,timezone_name,timezone_offset_hours_utc,business&access_token=TOKEN
```

Campos esperados / útiles:

| Campo | Uso en la app |
|---|---|
| `account_id` | ID de la cuenta publicitaria |
| `name` | Nombre visible de la cuenta |
| `currency` | Moneda, por ejemplo `COP` |
| `account_status` | Estado de la cuenta |
| `balance` | Saldo actual / balance, según disponibilidad de Meta |
| `amount_spent` | Monto gastado acumulado reportado por Meta |
| `spend_cap` | Límite de gasto, si existe |
| `funding_source_details` | Información parcial del método de pago |
| `timezone_name` | Zona horaria de la cuenta |
| `business` | Negocio asociado |

### 5.2. Actividad de pago / eventos de cuenta

Usar este endpoint para explorar actividades relacionadas con facturación, cargos y cambios de la cuenta.

```http
GET https://graph.facebook.com/{META_GRAPH_VERSION}/act_<AD_ACCOUNT_ID>/activities
```

Parámetros sugeridos:

```txt
fields=event_time,event_type,translated_event_type,actor_name,object_id,object_name,extra_data
since=YYYY-MM-DD
until=YYYY-MM-DD
limit=100
access_token={META_ACCESS_TOKEN}
```

Ejemplo:

```http
GET https://graph.facebook.com/v25.0/act_1471976967613858/activities?fields=event_time,event_type,translated_event_type,actor_name,object_id,object_name,extra_data&since=2026-06-08&until=2026-06-14&limit=100&access_token=TOKEN
```

Eventos a revisar especialmente:

```txt
ad_account_billing_charge
ad_account_billing_charge_back
ad_account_billing_chargeback
ad_account_update_spend_limit
ad_account_reset_spend_limit
ad_account_billing_charge_failed
```

> Cursor debe implementar este módulo de forma exploratoria: guardar la respuesta cruda de `extra_data` para cada evento, porque Meta puede variar el formato según cuenta, país, método de pago y tipo de transacción.

---

## 6. Comportamiento esperado del módulo

Crear un módulo llamado, por ejemplo:

```txt
meta-billing
meta-ads-billing
meta-payment-activity
```

Debe permitir:

1. Consultar todas las cuentas configuradas en `META_AD_ACCOUNT_IDS`.
2. Obtener información general de cada cuenta.
3. Obtener actividades dentro de un rango de fechas.
4. Filtrar o clasificar eventos de facturación/pago.
5. Guardar los datos normalizados en base de datos.
6. Guardar también el payload crudo (`raw_json`) para auditoría.
7. Evitar duplicados con `UPSERT`.
8. Permitir ejecución manual y ejecución programada.
9. Manejar paginación.
10. Manejar errores por cuenta sin detener todo el proceso.

---

## 7. Modelo de datos sugerido

### 7.1. Tabla: `meta_ad_accounts`

```sql
CREATE TABLE meta_ad_accounts (
  id BIGSERIAL PRIMARY KEY,
  account_id VARCHAR(50) NOT NULL UNIQUE,
  account_api_id VARCHAR(80) NOT NULL UNIQUE,
  name TEXT,
  currency VARCHAR(10),
  account_status INTEGER,
  balance NUMERIC(18, 2),
  amount_spent NUMERIC(18, 2),
  spend_cap NUMERIC(18, 2),
  timezone_name VARCHAR(100),
  funding_source_raw JSONB,
  business_raw JSONB,
  raw_json JSONB,
  last_synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 7.2. Tabla: `meta_billing_activities`

```sql
CREATE TABLE meta_billing_activities (
  id BIGSERIAL PRIMARY KEY,
  account_id VARCHAR(50) NOT NULL,
  account_api_id VARCHAR(80) NOT NULL,
  event_time TIMESTAMP,
  event_type VARCHAR(150),
  translated_event_type TEXT,
  actor_name TEXT,
  object_id VARCHAR(100),
  object_name TEXT,
  transaction_id TEXT,
  invoice_id TEXT,
  payment_status TEXT,
  amount NUMERIC(18, 2),
  currency VARCHAR(10),
  payment_method_brand TEXT,
  payment_method_last4 TEXT,
  raw_extra_data JSONB,
  raw_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, event_time, event_type, object_id)
);
```

> Si la base actual es SQL Server en vez de PostgreSQL, adaptar `JSONB` a `NVARCHAR(MAX)` guardando JSON serializado.

---

## 8. Normalización sugerida

Crear una función que reciba cada actividad y devuelva un objeto normalizado.

Ejemplo conceptual:

```ts
type MetaBillingActivityNormalized = {
  accountId: string;
  accountApiId: string;
  eventTime: string | null;
  eventType: string | null;
  translatedEventType: string | null;
  actorName: string | null;
  objectId: string | null;
  objectName: string | null;
  transactionId: string | null;
  invoiceId: string | null;
  paymentStatus: string | null;
  amount: number | null;
  currency: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  rawExtraData: unknown;
  rawJson: unknown;
};
```

La normalización debe ser tolerante a campos faltantes.

Prioridades:

1. Si `extra_data` contiene monto, extraerlo.
2. Si `extra_data` contiene moneda, extraerla.
3. Si `extra_data` contiene ID de transacción o factura, guardarlo.
4. Si no es posible extraer campos, guardar `raw_json` y dejar campos normalizados en `null`.

---

## 9. Paginación

Los endpoints de Graph API pueden devolver paginación.

Implementar loop con:

```ts
response.data.paging?.next
```

Reglas:

- Mientras exista `paging.next`, seguir consultando.
- Limitar llamadas por ejecución para evitar loops infinitos.
- Registrar cuántas páginas se consultaron por cuenta.
- Si falla una página, loguear error sin imprimir token.

---

## 10. Manejo de errores

Manejar mínimo estos casos:

| Caso | Acción |
|---|---|
| Token expirado | Marcar job como fallido y alertar renovación |
| Permiso insuficiente | Loguear cuenta y endpoint afectado |
| Cuenta sin datos | Guardar sync exitoso con cero registros |
| Rate limit | Retry con backoff exponencial |
| Error temporal 5xx | Retry limitado |
| Error permanente 4xx | No reintentar infinitamente |
| Respuesta con formato inesperado | Guardar raw y alertar |

Nunca imprimir:

```txt
access_token
Authorization
META_ACCESS_TOKEN
```

---

## 11. Jobs sugeridos

### 11.1. Sync diario de actividad de pago

Ejecutar una vez al día, preferiblemente en la mañana:

```txt
06:30 America/Bogota
```

Debe consultar el rango:

```txt
ayer 00:00:00 → hoy 00:00:00
```

O consultar últimos 2-3 días para capturar pagos procesados tarde.

### 11.2. Sync manual por rango

Crear comando o endpoint interno:

```txt
syncMetaBillingActivities({ since: '2026-06-08', until: '2026-06-14' })
```

Esto sirve para reconstruir históricos.

---

## 12. Pruebas iniciales recomendadas

Antes de integrar por completo, probar en Graph API Explorer y luego desde backend.

### Prueba A — cuenta

```http
act_1471976967613858?fields=account_id,name,currency,account_status,balance,amount_spent,spend_cap,funding_source_details,timezone_name
```

### Prueba B — actividades

```http
act_1471976967613858/activities?fields=event_time,event_type,translated_event_type,actor_name,object_id,object_name,extra_data&since=2026-06-08&until=2026-06-14&limit=100
```

### Prueba C — repetir por todas las cuentas

```txt
act_1471976967613858
act_27681534604769560
act_1744585636881421
act_139983555499119
```

---

## 13. Criterio de éxito

El módulo se considera funcional si logra:

1. Leer saldo/estado general de cada cuenta.
2. Leer actividades del periodo consultado.
3. Identificar eventos de facturación/pago si aparecen.
4. Guardar datos crudos y normalizados.
5. No duplicar registros.
6. No exponer el token en logs.
7. Permitir comparación básica con la pantalla de Meta.

---

## 14. Limitaciones conocidas

- La pantalla de Meta puede mostrar información que no está completamente disponible por API.
- El ID de factura de IVA y el archivo descargable pueden no venir directamente en `/activities`.
- Algunos campos pueden venir dentro de `extra_data` con formatos variables.
- Los montos pueden venir en unidades menores o como strings; validar antes de guardar.
- Los estados `Pagado`, `Error`, etc. podrían no venir traducidos igual que en la UI.
- Se debe probar con datos reales de las 4 cuentas.

---

## 15. Implementación sugerida en TypeScript / Node.js

Estructura sugerida:

```txt
src/
  meta/
    meta.config.ts
    meta-http.client.ts
    meta-billing.service.ts
    meta-billing.repository.ts
    meta-billing.normalizer.ts
    meta-billing.job.ts
```

### Cliente HTTP base

```ts
import axios from 'axios';

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

if (!META_ACCESS_TOKEN) {
  throw new Error('META_ACCESS_TOKEN is required');
}

export async function metaGet<T>(path: string, params: Record<string, any> = {}): Promise<T> {
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`;

  const response = await axios.get(url, {
    params: {
      ...params,
      access_token: META_ACCESS_TOKEN,
    },
  });

  return response.data as T;
}
```

### Consultar cuenta

```ts
export async function getAdAccountBillingInfo(accountApiId: string) {
  return metaGet(`${accountApiId}`, {
    fields: [
      'account_id',
      'name',
      'currency',
      'account_status',
      'balance',
      'amount_spent',
      'spend_cap',
      'funding_source_details',
      'timezone_name',
      'timezone_offset_hours_utc',
      'business',
    ].join(','),
  });
}
```

### Consultar actividades

```ts
export async function getAdAccountActivities(accountApiId: string, since: string, until: string) {
  const fields = [
    'event_time',
    'event_type',
    'translated_event_type',
    'actor_name',
    'object_id',
    'object_name',
    'extra_data',
  ].join(',');

  const allRows: any[] = [];

  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    first = false;

    const response: any = nextUrl
      ? await axios.get(nextUrl).then((r) => r.data)
      : await metaGet(`${accountApiId}/activities`, {
          fields,
          since,
          until,
          limit: 100,
        });

    allRows.push(...(response.data || []));
    nextUrl = response.paging?.next || null;
  }

  return allRows;
}
```

---

## 16. Prompt corto para Cursor

Usa este resumen para pedirle a Cursor que implemente el módulo:

```txt
Necesito crear un módulo para sincronizar actividad de pago/facturación de Meta Ads.

Ya tengo un token de usuario del sistema con ads_read en META_ACCESS_TOKEN y las cuentas en META_AD_ACCOUNT_IDS.

Implementa:

1. Consulta de información general por cuenta usando /act_<id>?fields=account_id,name,currency,account_status,balance,amount_spent,spend_cap,funding_source_details,timezone_name,business.
2. Consulta de actividades usando /act_<id>/activities?fields=event_time,event_type,translated_event_type,actor_name,object_id,object_name,extra_data&since=YYYY-MM-DD&until=YYYY-MM-DD&limit=100.
3. Paginación con paging.next.
4. Normalización de eventos de facturación, guardando siempre raw_json y raw_extra_data.
5. UPSERT para evitar duplicados por cuenta + fecha + tipo + objeto.
6. Manejo de errores, token expirado y rate limits.
7. No imprimir nunca el token.
8. Job diario y ejecución manual por rango.

La información exacta de facturas/IVA/PDF puede no venir igual que la interfaz, así que implementa el módulo de forma exploratoria y conserva el JSON crudo para analizar campos reales.
```

---

## 17. Fuentes oficiales para validar

- Meta Marketing API — Ad Account Reference
- Meta Marketing API — Activities / Ad Activity Reference
- Meta Graph API Explorer para pruebas con token real

