// Appels aux régies publicitaires par la porte commune (lot 8) : délai
// garanti, absence de réponse classée, réponse vérifiée par son contrat
// (voir src/lib/social/base.ts et contract.ts), puis traduction en AdsError
// lisible pour la page Analytics → Publicité et la synchro.
//
// Avant : fetch sans délai, réponses « castées » sans vérification. Un
// rapport au format changé donnait zéro jour… et la synchro remettait à
// zéro 30 jours de dépenses déjà enregistrées.
import type { ZodType, ZodTypeDef } from "zod";
import { SocialApiError, fetchJson, type RequestOptions } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { alertOwnerFormatChange } from "@/lib/owner-alerts";
import { AD_PLATFORM_META, AdsError, type AdPlatform } from "./types";

function strip(message: string): string {
  return message.replace(/^\[[A-Z_]+\] /, "");
}

/**
 * Traduit une erreur de la porte commune en AdsError. Le statut porté par
 * AdsError pilote la synchro : 401 = compte à reconnecter, 429 = nouvel
 * essai dans 30 min, autre = au prochain cycle.
 */
export function toAdsError(platform: AdPlatform, err: unknown): unknown {
  if (!(err instanceof SocialApiError)) return err;
  const label = AD_PLATFORM_META[platform].label;
  const { category } = classifyProviderError(err);
  switch (category) {
    case "AUTH_EXPIRED":
      return new AdsError(`Connexion ${label} expirée : reconnectez le compte.`, 401, category);
    case "RATE_LIMITED":
      return new AdsError(`${label} limite temporairement les requêtes : nouvel essai plus tard.`, 429, category);
    case "TRANSIENT":
    case "TIMEOUT":
      return new AdsError(`${label} ne répond pas pour le moment : nouvel essai plus tard.`, 429, category);
    case "UNEXPECTED_RESPONSE":
      void alertOwnerFormatChange(label, `ads-format:${platform}`, err.message, { where: "src/lib/ads", href: "/analytics?tab=ads" });
      return new AdsError(`${label} a répondu dans un format inattendu : les chiffres déjà enregistrés sont conservés, l'équipe Nebula est prévenue.`, 502, category);
    case "PERMISSION_MISSING":
      return new AdsError(`${label} refuse l'accès à ce compte : ${strip(err.message)}`, 403, category);
    default:
      return new AdsError(strip(err.message) || `${label} a répondu ${err.status ?? "une erreur"}.`, err.status && err.status >= 400 ? err.status : 400, category);
  }
}

/** Appel JSON à une régie : contrat obligatoire, erreurs traduites. */
export async function adsJson<T>(
  platform: AdPlatform,
  url: string,
  init: RequestOptions & { schema: ZodType<T, ZodTypeDef, unknown> },
  translate?: (err: SocialApiError) => AdsError | null
): Promise<T> {
  try {
    return await fetchJson(platform, url, { cache: "no-store", timeoutMs: 20_000, ...init });
  } catch (err) {
    if (err instanceof SocialApiError) {
      const custom = translate?.(err);
      if (custom) throw custom;
    }
    throw toAdsError(platform, err);
  }
}
