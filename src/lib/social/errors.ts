// Classement des erreurs des réseaux (lot 5, résilience des API).
//
// Avant : une erreur de réseau était un texte, et le reste du code devinait
// sa nature par des expressions régulières (« expir », « 401 »…). Une panne
// passagère chez TikTok faisait échouer la publication pour de bon ; une
// connexion expirée n'était signalée que par la synchro des statistiques.
//
// Maintenant, chaque erreur reçoit une CATÉGORIE, à partir du code HTTP et
// des codes propres à chaque réseau (Meta 190/4/17…, TikTok
// « rate_limit_exceeded », Google « quotaExceeded »…). La catégorie décide :
//  - si la publication peut être relancée automatiquement sans risque de
//    doublon (limite de débit, panne passagère avec réponse du réseau) ;
//  - si le compte doit être reconnecté (connexion expirée ou révoquée) ;
//  - si l'erreur compte pour le disjoncteur du réseau (panne générale) ;
//  - le conseil affiché à l'utilisateur.
//
// Règle de prudence : une requête dont on ne sait pas si elle a abouti
// (délai dépassé, connexion coupée en cours de route) n'est JAMAIS renvoyée
// automatiquement pour une publication — elle a peut-être été publiée.
import { NO_RESPONSE_CODES, SocialApiError, UNEXPECTED_RESPONSE } from "./base";

export { NO_RESPONSE_CODES, parseRetryAfter } from "./base";
export { errorAdvice } from "./error-advice";

export const ERROR_CATEGORIES = [
  "AUTH_EXPIRED",
  "PERMISSION_MISSING",
  "RATE_LIMITED",
  "QUOTA_EXHAUSTED",
  "INVALID_MEDIA",
  "INVALID_REQUEST",
  "VERSION_SUNSET",
  "TRANSIENT",
  "TIMEOUT",
  // Lot 7 : réponse « OK » mais hors contrat (champ disparu, type changé) —
  // voir contract.ts. Souvent un changement d'API chez le réseau.
  "UNEXPECTED_RESPONSE",
  "UNKNOWN"
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export interface ClassifiedError {
  category: ErrorCategory;
  /** Peut être renvoyée automatiquement plus tard, sans risque de doublon. */
  autoRetry: boolean;
  /** Délai demandé par le réseau (en-tête Retry-After), en millisecondes. */
  retryAfterMs?: number;
  /** Le compte doit être reconnecté par l'utilisateur. */
  needsReconnect: boolean;
  /** Signe d'un incident chez le réseau (compte pour le disjoncteur). */
  outage: boolean;
  /**
   * La requête a peut-être abouti (pas de réponse, ou réponse illisible) :
   * une publication n'est jamais renvoyée, elle est d'abord cherchée sur le
   * réseau (lot 6, « déjà en ligne ? »).
   */
  uncertain: boolean;
}

const MEDIA_WORDS = /m[ée]dia|vid[ée]o|image|photo|format|dur[ée]e|resolution|résolution|aspect|ratio|fichier|file|frame|bitrate|codec|size|taille/i;

function metaCategory(code: number, subcode: number | null, raw: unknown): ErrorCategory | null {
  if ((raw as { error?: { is_transient?: boolean } } | undefined)?.error?.is_transient === true) return "TRANSIENT";
  if (code === 190 || code === 102 || subcode === 463 || subcode === 467 || subcode === 460) return "AUTH_EXPIRED";
  if (code === 10 || (code >= 200 && code <= 299)) return "PERMISSION_MISSING";
  if (code === 4 || code === 17 || code === 32 || code === 613 || (code >= 80001 && code <= 80014)) return "RATE_LIMITED";
  // Instagram : limite de publications sur 24 h atteinte.
  if (code === 9 && subcode === 2207042) return "QUOTA_EXHAUSTED";
  if (code === 1 || code === 2) return "TRANSIENT";
  if (code === 12 || code === 2635) return "VERSION_SUNSET";
  if (code === 352 || (code >= 36000 && code <= 36004)) return "INVALID_MEDIA";
  if (subcode !== null && [2207026, 2207052, 2207004, 2207005, 2207009, 2207010, 2207023].includes(subcode)) return "INVALID_MEDIA";
  return null;
}

const TIKTOK_CODES: Record<string, ErrorCategory> = {
  access_token_invalid: "AUTH_EXPIRED",
  token_expired: "AUTH_EXPIRED",
  invalid_grant: "AUTH_EXPIRED",
  scope_not_authorized: "PERMISSION_MISSING",
  scope_permission_missed: "PERMISSION_MISSING",
  url_ownership_unverified: "PERMISSION_MISSING",
  spam_risk_user_banned_from_posting: "PERMISSION_MISSING",
  rate_limit_exceeded: "RATE_LIMITED",
  spam_risk_too_many_posts: "QUOTA_EXHAUSTED",
  spam_risk_too_many_pending_share: "QUOTA_EXHAUSTED",
  reached_active_user_cap: "QUOTA_EXHAUSTED",
  file_format_check_failed: "INVALID_MEDIA",
  duration_check_failed: "INVALID_MEDIA",
  frame_rate_check_failed: "INVALID_MEDIA",
  picture_size_check_failed: "INVALID_MEDIA",
  video_pull_failed: "INVALID_MEDIA",
  photo_pull_failed: "INVALID_MEDIA",
  internal_error: "TRANSIENT"
};

const GOOGLE_REASONS: Record<string, ErrorCategory> = {
  authError: "AUTH_EXPIRED",
  invalid_grant: "AUTH_EXPIRED",
  insufficientPermissions: "PERMISSION_MISSING",
  forbidden: "PERMISSION_MISSING",
  youtubeSignupRequired: "PERMISSION_MISSING",
  quotaExceeded: "QUOTA_EXHAUSTED",
  dailyLimitExceeded: "QUOTA_EXHAUSTED",
  uploadLimitExceeded: "QUOTA_EXHAUSTED",
  rateLimitExceeded: "RATE_LIMITED",
  userRateLimitExceeded: "RATE_LIMITED",
  backendError: "TRANSIENT",
  internalError: "TRANSIENT",
  invalidVideoMetadata: "INVALID_REQUEST",
  mediaBodyRequired: "INVALID_MEDIA",
  invalidFilename: "INVALID_MEDIA"
};

// API Marketing de TikTok (régie, lot 8). 40100 est une LIMITE DE REQUÊTES
// (« requests made too frequently »), pas un jeton invalide : avant le lot 8,
// il marquait le compte pub « à reconnecter ».
const TIKTOK_ADS_CODES: Record<string, ErrorCategory> = {
  "40100": "RATE_LIMITED",
  "40016": "RATE_LIMITED",
  "51021": "RATE_LIMITED",
  "40101": "AUTH_EXPIRED",
  "40102": "AUTH_EXPIRED",
  "40104": "AUTH_EXPIRED",
  "40105": "AUTH_EXPIRED",
  "40001": "PERMISSION_MISSING",
  "40002": "INVALID_REQUEST",
  "50000": "TRANSIENT",
  "50002": "TRANSIENT"
};

const BLUESKY_CODES: Record<string, ErrorCategory> = {
  ExpiredToken: "AUTH_EXPIRED",
  InvalidToken: "AUTH_EXPIRED",
  AuthenticationRequired: "AUTH_EXPIRED",
  RateLimitExceeded: "RATE_LIMITED",
  BlobTooLarge: "INVALID_MEDIA",
  InvalidMimeType: "INVALID_MEDIA",
  InvalidRequest: "INVALID_REQUEST"
};

/** Catégorie tirée des codes propres au réseau, s'il y en a. */
function networkCategory(err: SocialApiError): ErrorCategory | null {
  const raw = err.raw as Record<string, unknown> | undefined;
  switch (err.network) {
    case "INSTAGRAM":
    case "FACEBOOK":
    case "THREADS":
    // Même Graph API et mêmes codes pour la publicité Meta (lot 8).
    case "META_ADS": {
      if (!err.code || !/^\d+(\/\d+)?$/.test(err.code)) return null;
      const [code, sub] = err.code.split("/").map(Number);
      return metaCategory(code, Number.isFinite(sub) ? sub : null, raw);
    }
    case "TIKTOK": {
      const code = err.code ?? (typeof raw?.error === "string" ? raw.error : (raw?.error as { code?: string } | undefined)?.code);
      return (code && TIKTOK_CODES[code]) || null;
    }
    case "YOUTUBE": {
      const errorObj = raw?.error as { errors?: { reason?: string }[] } | string | undefined;
      const reason = typeof errorObj === "string" ? errorObj : errorObj?.errors?.[0]?.reason;
      return (reason && GOOGLE_REASONS[reason]) || null;
    }
    case "BLUESKY": {
      const code = typeof raw?.error === "string" ? raw.error : undefined;
      return (code && BLUESKY_CODES[code]) || null;
    }
    case "LINKEDIN":
      return err.status === 426 ? "VERSION_SUNSET" : null;
    case "TIKTOK_ADS":
      // Codes numériques de l'API Marketing, renvoyés avec un statut HTTP 200.
      return (err.code && TIKTOK_ADS_CODES[err.code]) || null;
    default:
      return null;
  }
}

function httpCategory(err: SocialApiError): ErrorCategory {
  const status = err.status;
  if (err.code === NO_RESPONSE_CODES.TIMEOUT || err.code === NO_RESPONSE_CODES.CONNECTION_LOST) return "TIMEOUT";
  if (err.code === NO_RESPONSE_CODES.UNREACHABLE) return "TRANSIENT";
  // Erreur levée par Nebula avant tout appel (texte trop long, média
  // manquant…) : un problème de contenu, jamais un incident.
  if (status === undefined) return MEDIA_WORDS.test(err.message) ? "INVALID_MEDIA" : "INVALID_REQUEST";
  if (status === 401) return "AUTH_EXPIRED";
  if (status === 403) return "PERMISSION_MISSING";
  if (status === 429) return "RATE_LIMITED";
  if (status === 426) return "VERSION_SUNSET";
  // Délai dépassé côté passerelle du réseau : la requête a peut-être abouti.
  if (status === 504) return "TIMEOUT";
  if (status === 408 || status >= 500) return "TRANSIENT";
  if (status >= 400) return MEDIA_WORDS.test(err.message) ? "INVALID_MEDIA" : "INVALID_REQUEST";
  return "UNKNOWN";
}

/** Classe une erreur levée par un client réseau (ou n'importe quelle erreur). */
export function classifyProviderError(err: unknown): ClassifiedError {
  if (!(err instanceof SocialApiError)) {
    return { category: "UNKNOWN", autoRetry: false, needsReconnect: false, outage: false, uncertain: false };
  }
  const category: ErrorCategory = err.code === UNEXPECTED_RESPONSE ? "UNEXPECTED_RESPONSE" : (networkCategory(err) ?? httpCategory(err));
  return {
    category,
    // Refus explicite (limite de débit) ou panne avec réponse du réseau :
    // rien n'a été publié, on peut réessayer plus tard.
    autoRetry: category === "RATE_LIMITED" || category === "TRANSIENT",
    retryAfterMs: err.retryAfterMs,
    needsReconnect: category === "AUTH_EXPIRED",
    // Un format inattendu ne compte PAS pour le disjoncteur : ce n'est pas
    // une panne (et un changement touchant les statistiques ne doit pas
    // suspendre les publications). Le propriétaire est prévenu à part.
    outage: category === "TRANSIENT" || category === "TIMEOUT" || category === "RATE_LIMITED",
    uncertain: category === "TIMEOUT" || category === "UNEXPECTED_RESPONSE"
  };
}

/** Nombre maximal de relances automatiques d'une publication. */
export const MAX_AUTO_RETRIES = 3;
const RETRY_DELAYS_MS = [2 * 60_000, 10 * 60_000, 30 * 60_000];

/**
 * Délai avant la relance n° `retry` (1, 2, 3…) : celui demandé par le réseau
 * s'il est raisonnable, sinon 2 min, 10 min puis 30 min, à ±20 % près pour
 * ne pas renvoyer toutes les publications en même temps.
 */
export function retryDelayMs(retry: number, retryAfterMs?: number, random: () => number = Math.random): number {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(Math.max(retryAfterMs, 30_000), 60 * 60_000);
  const base = RETRY_DELAYS_MS[Math.min(Math.max(retry, 1), RETRY_DELAYS_MS.length) - 1];
  return Math.round(base * (0.8 + random() * 0.4));
}
