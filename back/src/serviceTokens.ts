import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OPERATOR_PERMISSION_KEYS, type OperatorPermissionKey } from "./operatorPermissions";

/**
 * Credenciales de servicio para la API de solo lectura del agente.
 *
 * A diferencia del JWT de login (8 horas), estas **no caducan**: existen para que un agente
 * externo consulte sin tener que pedir un token nuevo cada sesión. Lo que las hace
 * manejables es que son **revocables** y que su alcance no depende de lo que afirme el
 * token, sino de una regla del middleware que no se puede negociar:
 *
 *   **solo GET, y solo bajo `/api/agent/`.**
 *
 * Aunque alguien lograra manipular los permisos, la credencial seguiría siendo incapaz de
 * escribir: el resto de la API la rechaza antes de mirar nada más.
 */

/** Marca de agua del token. Permite distinguirlo de un JWT sin intentar verificarlo. */
export const SERVICE_TOKEN_PREFIX = "fsa_";

/** Bytes de aleatoriedad. 32 bytes = 256 bits, de sobra contra fuerza bruta. */
const TOKEN_BYTES = 32;

/** Cuántos caracteres del token se guardan en claro para reconocerlo en la lista. */
const DISPLAY_PREFIX_LEN = 12;

export type GeneratedServiceToken = {
  /** El token completo. Se le muestra al usuario UNA vez y no se vuelve a poder leer. */
  token: string;
  /** SHA-256 en hex. Es lo único que se guarda. */
  tokenHash: string;
  /** Primeros caracteres, para identificarlo después sin exponerlo. */
  prefix: string;
};

export function generateServiceToken(): GeneratedServiceToken {
  const token = SERVICE_TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("hex");
  return {
    token,
    tokenHash: hashServiceToken(token),
    prefix: token.slice(0, DISPLAY_PREFIX_LEN),
  };
}

/**
 * SHA-256 en hex.
 *
 * No lleva salt ni bcrypt a propósito: el token son 256 bits aleatorios, no una contraseña
 * elegida por una persona, así que no hay diccionario que atacar y la búsqueda por hash
 * tiene que ser un lookup indexado. bcrypt obligaría a recorrer todas las filas.
 */
export function hashServiceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** ¿Este valor tiene forma de token de servicio? No dice que sea válido. */
export function isServiceToken(token: string): boolean {
  return token.startsWith(SERVICE_TOKEN_PREFIX);
}

/** Comparación en tiempo constante, para no filtrar el hash por diferencia de tiempos. */
export function serviceTokenHashMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * La regla que hace que esta credencial no pueda escribir.
 *
 * Se evalúa sobre la ruta real de la petición, no sobre la que Express creyó enrutar, para
 * que no dependa de cómo esté montado el handler.
 */
export function isAgentReadOnlyRequest(method: string, rawPath: string): boolean {
  if (method.toUpperCase() !== "GET") return false;
  // Fuera query string y fragmento; nos interesa solo el path.
  const path = rawPath.split("?")[0].split("#")[0];
  return path === "/api/agent" || path.startsWith("/api/agent/");
}

/**
 * Permisos de una credencial de servicio.
 *
 * Se declaran explícitos en vez de reutilizar `defaultLectorPermissions()`: si algún día se
 * le añade un módulo a LECTOR, no queremos que estas credenciales se amplíen solas y sin
 * que nadie lo note. Son exactamente los módulos que exigen las rutas de `/api/agent/*`.
 */
const SERVICE_TOKEN_MODULES: OperatorPermissionKey[] = [
  "moduleDashboard",
  "moduleReportes",
  "moduleCpa",
  "moduleAnuncios",
  "moduleCampanasMeta",
];

export function serviceTokenPermissions(): Record<OperatorPermissionKey, boolean> {
  const perms = Object.fromEntries(
    OPERATOR_PERMISSION_KEYS.map((k) => [k, false]),
  ) as Record<OperatorPermissionKey, boolean>;
  for (const k of SERVICE_TOKEN_MODULES) perms[k] = true;
  return perms;
}

/**
 * Cada cuánto se refresca `lastUsedAt`.
 *
 * Sin esto, cada consulta del agente provocaría un UPDATE. Con 5 minutos basta para saber
 * si una credencial sigue viva y sobra para detectar una que ya nadie usa.
 */
export const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export function shouldRefreshLastUsed(lastUsedAt: Date | null, now: Date): boolean {
  if (!lastUsedAt) return true;
  return now.getTime() - lastUsedAt.getTime() >= LAST_USED_REFRESH_MS;
}
