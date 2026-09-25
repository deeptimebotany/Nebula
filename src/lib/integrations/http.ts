// Appels aux sources d'import de médias par la porte commune (lot 8) :
// délai garanti, absence de réponse classée, réponse vérifiée par son
// contrat (voir src/lib/social/base.ts et contract.ts), puis traduction en
// ImportError lisible dans Publier.
//
// Avant : fetch sans délai (une plateforme lente bloquait la fonction
// jusqu'à sa coupure par Vercel), réponses « castées » sans vérification.
import type { ZodType, ZodTypeDef } from "zod";
import { SocialApiError, fetchJson, type Provider, type RequestOptions } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { alertOwnerFormatChange } from "@/lib/owner-alerts";
import { ImportError } from "./errors";

export type ImportProvider = Extract<Provider, "GOOGLE_DRIVE" | "DROPBOX" | "ONEDRIVE" | "UNSPLASH" | "CANVA">;

export const IMPORT_LABEL: Record<ImportProvider, string> = {
  GOOGLE_DRIVE: "Google Drive",
  DROPBOX: "Dropbox",
  ONEDRIVE: "OneDrive",
  UNSPLASH: "Unsplash",
  CANVA: "Canva"
};

function strip(message: string): string {
  return message.replace(/^\[[A-Z_]+\] /, "");
}

/** Traduit une erreur de la porte commune en ImportError (statut HTTP renvoyé à Publier). */
export function toImportError(source: ImportProvider, err: unknown): unknown {
  if (!(err instanceof SocialApiError)) return err;
  const label = IMPORT_LABEL[source];
  const { category } = classifyProviderError(err);
  switch (category) {
    case "AUTH_EXPIRED":
      return new ImportError(`Connexion ${label} expirée : reliez à nouveau votre compte.`, 401);
    case "RATE_LIMITED":
      return new ImportError(`${label} limite temporairement les requêtes : réessayez dans quelques minutes.`, 429);
    case "TRANSIENT":
    case "TIMEOUT":
      return new ImportError(`${label} ne répond pas pour le moment : réessayez dans un instant.`, 503);
    case "UNEXPECTED_RESPONSE":
      void alertOwnerFormatChange(label, `import-format:${source}`, err.message, { where: "src/lib/integrations" });
      return new ImportError(`${label} a répondu dans un format inattendu : réessayez plus tard, l'équipe Nebula est prévenue.`, 502);
    case "PERMISSION_MISSING":
      return new ImportError(`${label} refuse l'accès à ce fichier : ${strip(err.message)}`, 403);
    default:
      return new ImportError(strip(err.message) || `${label} a répondu ${err.status ?? "une erreur"}.`, 502);
  }
}

/** Appel JSON à une source d'import : contrat obligatoire, erreurs traduites. */
export async function importJson<T>(
  source: ImportProvider,
  url: string,
  init: RequestOptions & { schema: ZodType<T, ZodTypeDef, unknown> },
  translate?: (err: SocialApiError) => ImportError | null
): Promise<T> {
  try {
    return await fetchJson(source, url, { cache: "no-store", timeoutMs: 20_000, ...init });
  } catch (err) {
    if (err instanceof SocialApiError) {
      const custom = translate?.(err);
      if (custom) throw custom;
    }
    throw toImportError(source, err);
  }
}

/**
 * Point d'accès des jetons OAuth (Canva, Microsoft). Un REFUS (code
 * invalide, autorisation retirée : `error` dans la réponse) demande de relier
 * à nouveau le compte ; une panne ou un délai dépassé, seulement de
 * réessayer (avant le lot 8, tout échec faisait croire à un compte délié).
 */
export function tokenRefusal(source: ImportProvider) {
  return (err: SocialApiError): ImportError | null => {
    // OAuth : un refus (invalid_grant, code expiré…) arrive en 400 ou 401,
    // quelle que soit la forme du corps ; 429 et 5xx ne sont pas des refus.
    if (err.status !== 400 && err.status !== 401) return null;
    const raw = err.raw as { error_description?: unknown; message?: unknown } | undefined;
    const text = typeof raw?.error_description === "string" ? raw.error_description : typeof raw?.message === "string" ? raw.message : "";
    const detail = text.split("\r\n")[0];
    return new ImportError(detail ? `${IMPORT_LABEL[source]} a refusé la connexion : ${detail}` : `${IMPORT_LABEL[source]} a refusé la connexion : reliez à nouveau votre compte.`, 401);
  };
}
