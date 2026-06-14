import {
  getMetaAdsSystemUserAppToken,
  resolveDefaultMetaAdsAccessToken,
} from "./metaAdsSystemUserService";

export type MetaAccessTokenResolveInput = {
  metaAdsAppId?: string | null;
  metaAdsSystemUserId?: string | null;
};

export async function resolveMetaAccessToken(input?: MetaAccessTokenResolveInput | string | null): Promise<string> {
  const opts: MetaAccessTokenResolveInput =
    typeof input === "string" || input == null ? { metaAdsSystemUserId: input } : input;

  const appId = opts.metaAdsAppId?.trim();
  const userId = opts.metaAdsSystemUserId?.trim();

  if (appId && userId) {
    const fromPair = await getMetaAdsSystemUserAppToken(userId, appId);
    if (fromPair) return fromPair;
    throw new Error("No hay token para esa combinación de app y usuario Meta Ads.");
  }

  const fromDefault = await resolveDefaultMetaAdsAccessToken();
  if (fromDefault) return fromDefault;

  const fromEnv =
    process.env.API_Reportes_token?.trim() || process.env.META_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(
    "No hay token Meta configurado. Crea apps y usuarios en Administración o define API_Reportes_token en .env.",
  );
}
