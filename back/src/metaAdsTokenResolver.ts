import {
  getMetaAdsSystemUserAppToken,
  resolveDefaultMetaAdsAccessToken,
} from "./metaAdsSystemUserService";

export type MetaAccessTokenResolveInput = {
  /** Obligatorio para resolver tokens de BD (aislamiento multiempresa). */
  companyId: string;
  metaAdsAppId?: string | null;
  metaAdsSystemUserId?: string | null;
};

export async function resolveMetaAccessToken(input: MetaAccessTokenResolveInput): Promise<string> {
  const companyId = input.companyId?.trim();
  if (!companyId) {
    throw new Error("Falta companyId para resolver el token Meta Ads.");
  }

  const appId = input.metaAdsAppId?.trim();
  const userId = input.metaAdsSystemUserId?.trim();

  if (appId && userId) {
    const fromPair = await getMetaAdsSystemUserAppToken(companyId, userId, appId);
    if (fromPair) return fromPair;
    throw new Error("No hay token para esa combinación de app y usuario Meta Ads.");
  }

  const fromDefault = await resolveDefaultMetaAdsAccessToken(companyId);
  if (fromDefault) return fromDefault;

  const fromEnv =
    process.env.API_Reportes_token?.trim() || process.env.META_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(
    "No hay token Meta configurado. Crea apps y usuarios en Administración o define API_Reportes_token en .env.",
  );
}
