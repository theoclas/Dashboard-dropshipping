/** Mensaje amigable cuando Meta rechaza por falta de permiso sobre la cuenta publicitaria. */
export function metaApiAccountAccessHint(errorMessage: string | null | undefined): string | null {
  if (!errorMessage?.trim()) return null;
  const lower = errorMessage.toLowerCase();
  const isAccountPermissionError =
    lower.includes("ads_read") ||
    lower.includes("ads_management") ||
    lower.includes("not grant") ||
    lower.includes("no grant") ||
    (lower.includes("(#200)") && lower.includes("ad account"));

  if (!isAccountPermissionError) return null;

  return "Tu token no tiene acceso a esa cuenta publicitaria. En Business Manager asigna la cuenta al usuario del sistema (p. ej. API Reportes) con permiso ads_read y, si cambiaste algo, actualiza el token en Administración → Usuarios Meta Ads.";
}
