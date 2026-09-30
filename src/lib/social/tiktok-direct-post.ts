// Règles « Direct Post » de TikTok (30/09/2026, inscription de Nebula au
// portail développeur TikTok). Module SANS dépendance : lu par la section
// TikTok de Publier (components/composer/tiktok-options.tsx), par le client
// TikTok au moment de l'envoi (social/tiktok.ts) et par les tests.
//
// Références :
//   https://developers.tiktok.com/doc/content-sharing-guidelines
//   https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
//   https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
//   https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
//
// Ce que TikTok exige, et comment Nebula le respecte :
//   - le compte qui publie (pseudo, avatar) est affiché : creator_info ;
//   - la confidentialité est choisie par l'utilisateur, SANS valeur par
//     défaut, parmi les options renvoyées pour son compte ; rien ne part
//     tant qu'elle n'est pas choisie ;
//   - Commentaires, Duo, Collage : décochés par défaut, grisés si le
//     créateur les a coupés dans TikTok ;
//   - durée de la vidéo vérifiée avant l'envoi ;
//   - contenu commercial : interrupteur éteint par défaut, « Votre marque »
//     et/ou « Contenu de marque » ; allumé sans option = envoi bloqué ; un
//     contenu de marque ne peut pas être « Moi uniquement » ;
//   - phrase de consentement avec les liens officiels de TikTok ;
//   - au moment de l'envoi (publication programmée), la confidentialité est
//     revérifiée : si elle n'est plus proposée, échec clair — jamais un
//     autre choix fait à la place de l'utilisateur.

export const TIKTOK_PRIVACY_LEVELS = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] as const;
export type TiktokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Tout le monde",
  MUTUAL_FOLLOW_FRIENDS: "Amis (abonnements mutuels)",
  FOLLOWER_OF_CREATOR: "Mes abonnés",
  SELF_ONLY: "Moi uniquement"
};

export function tiktokPrivacyLabel(level: string): string {
  return TIKTOK_PRIVACY_LABELS[level] ?? level;
}

/** Réponse de creator_info/query, en camelCase. */
export interface TiktokCreatorInfo {
  avatarUrl: string | null;
  username: string;
  nickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
}

/** Choix faits dans la section TikTok de Publier (PostTarget.metadata.tiktok). */
export interface TiktokPostOptions {
  privacyLevel: string | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** Interrupteur « Déclaration de contenu commercial ». */
  commercial: boolean;
  /** « Votre marque » : promotion de soi-même ou de sa propre entreprise. */
  yourBrand: boolean;
  /** « Contenu de marque » : partenariat rémunéré avec un tiers. */
  brandedContent: boolean;
  /** Durée de la vidéo mesurée dans Publier (secondes). */
  videoDurationSec?: number | null;
}

export const DEFAULT_TIKTOK_OPTIONS: TiktokPostOptions = {
  privacyLevel: null,
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercial: false,
  yourBrand: false,
  brandedContent: false
};

export const TIKTOK_MUSIC_USAGE_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const TIKTOK_BRANDED_CONTENT_POLICY_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

/** Contenu de marque déclaré (étiquette « Partenariat rémunéré »). */
export function isBrandedContent(o: Pick<TiktokPostOptions, "commercial" | "brandedContent">): boolean {
  return o.commercial && o.brandedContent;
}

/** Phrase de consentement, découpée pour placer les liens officiels. */
export function tiktokConsentParts(o: Pick<TiktokPostOptions, "commercial" | "brandedContent">): { text: string; href?: string }[] {
  const music = { text: "la confirmation d'utilisation de la musique", href: TIKTOK_MUSIC_USAGE_URL };
  if (isBrandedContent(o)) {
    return [{ text: "En publiant, vous acceptez " }, { text: "la politique relative au contenu de marque", href: TIKTOK_BRANDED_CONTENT_POLICY_URL }, { text: " et " }, music, { text: " de TikTok." }];
  }
  return [{ text: "En publiant, vous acceptez " }, music, { text: " de TikTok." }];
}

/** Phrase de consentement en texte simple (tests, journaux). */
export function tiktokConsentText(o: Pick<TiktokPostOptions, "commercial" | "brandedContent">): string {
  return tiktokConsentParts(o)
    .map((p) => p.text)
    .join("");
}

/** Étiquette que TikTok affichera sur la vidéo, ou null. */
export function tiktokLabelNotice(o: Pick<TiktokPostOptions, "commercial" | "yourBrand" | "brandedContent">): string | null {
  if (!o.commercial) return null;
  if (o.brandedContent) return "Votre vidéo sera étiquetée « Partenariat rémunéré ».";
  if (o.yourBrand) return "Votre vidéo sera étiquetée « Contenu promotionnel ».";
  return null;
}

export const COMMERCIAL_CHOICE_REQUIRED = "Vous devez indiquer si votre contenu fait votre propre promotion, celle d'un tiers, ou les deux.";
export const BRANDED_CONTENT_NOT_PRIVATE = "La visibilité d'un contenu de marque ne peut pas être « Moi uniquement ».";

/** Raison pour laquelle une option de confidentialité est grisée, ou null. */
export function privacyOptionDisabledReason(level: string, o: Pick<TiktokPostOptions, "commercial" | "brandedContent">): string | null {
  return level === "SELF_ONLY" && isBrandedContent(o) ? BRANDED_CONTENT_NOT_PRIVATE : null;
}

/** Raison pour laquelle « Contenu de marque » est grisé, ou null. */
export function brandedContentDisabledReason(o: Pick<TiktokPostOptions, "privacyLevel">): string | null {
  return o.privacyLevel === "SELF_ONLY" ? `${BRANDED_CONTENT_NOT_PRIVATE} Choisissez une autre confidentialité pour le déclarer.` : null;
}

/**
 * Ce qui empêche d'envoyer la vidéo, ou null si tout est prêt. Même règle
 * dans Publier (bouton désactivé) et au moment de l'envoi (échec clair).
 */
export function tiktokBlockingReason(
  o: TiktokPostOptions,
  creator: TiktokCreatorInfo,
  ctx: { mediaType?: "VIDEO" | "IMAGE" | null; durationSec?: number | null } = {}
): string | null {
  if (ctx.mediaType && ctx.mediaType !== "VIDEO") return "TikTok : ajoutez une vidéo (la publication de photos n'est pas encore prise en charge).";
  if (!o.privacyLevel) return "TikTok : choisissez qui peut voir la vidéo.";
  if (!creator.privacyLevelOptions.includes(o.privacyLevel)) {
    return `TikTok : la confidentialité « ${tiktokPrivacyLabel(o.privacyLevel)} » n'est plus proposée pour ce compte. Choisissez-en une autre.`;
  }
  if (o.commercial && !o.yourBrand && !o.brandedContent) return `TikTok : ${COMMERCIAL_CHOICE_REQUIRED.charAt(0).toLowerCase()}${COMMERCIAL_CHOICE_REQUIRED.slice(1)}`;
  if (isBrandedContent(o) && o.privacyLevel === "SELF_ONLY") return `TikTok : ${BRANDED_CONTENT_NOT_PRIVATE.charAt(0).toLowerCase()}${BRANDED_CONTENT_NOT_PRIVATE.slice(1)}`;
  const duration = ctx.durationSec ?? o.videoDurationSec ?? null;
  if (duration !== null && creator.maxVideoPostDurationSec !== null && duration > creator.maxVideoPostDurationSec + 0.5) {
    return `TikTok : vidéo trop longue pour ce compte (${Math.round(duration)} s, ${creator.maxVideoPostDurationSec} s au plus).`;
  }
  return null;
}

/**
 * Vérification sans appel à TikTok, à la création d'une publication (Publier
 * et API publique) : confidentialité choisie, contenu commercial complet,
 * contenu de marque jamais privé. Le reste (options du compte, durée) est
 * vérifié au moment de l'envoi.
 */
export function tiktokOptionsProblem(raw: unknown): string | null {
  const o = parseTiktokOptions(raw);
  if (!o?.privacyLevel) return "TikTok : choisissez qui peut voir la vidéo (metadata.tiktok.privacyLevel : PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR ou SELF_ONLY).";
  if (o.commercial && !o.yourBrand && !o.brandedContent) return `TikTok : ${COMMERCIAL_CHOICE_REQUIRED.charAt(0).toLowerCase()}${COMMERCIAL_CHOICE_REQUIRED.slice(1)}`;
  if (isBrandedContent(o) && o.privacyLevel === "SELF_ONLY") return `TikTok : ${BRANDED_CONTENT_NOT_PRIVATE.charAt(0).toLowerCase()}${BRANDED_CONTENT_NOT_PRIVATE.slice(1)}`;
  return null;
}

/** `post_info` envoyé à /v2/post/publish/video/init/. */
export function tiktokPostInfo(o: TiktokPostOptions, creator: TiktokCreatorInfo, caption: string, aiGenerated = false): Record<string, string | boolean> {
  return {
    title: caption,
    privacy_level: o.privacyLevel ?? "",
    // Coupé par l'utilisateur OU par le créateur dans ses réglages TikTok.
    disable_comment: !o.allowComment || creator.commentDisabled,
    disable_duet: !o.allowDuet || creator.duetDisabled,
    disable_stitch: !o.allowStitch || creator.stitchDisabled,
    brand_content_toggle: isBrandedContent(o),
    brand_organic_toggle: o.commercial && o.yourBrand,
    // Étiquette « Creator labeled as AI-generated » de TikTok.
    ...(aiGenerated ? { is_aigc: true } : {})
  };
}

/** Choix TikTok lus dans PostTarget.metadata.tiktok (données libres en base). */
export function parseTiktokOptions(raw: unknown): TiktokPostOptions | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const bool = (v: unknown) => v === true;
  const privacyLevel = typeof r.privacyLevel === "string" && (TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(r.privacyLevel) ? r.privacyLevel : null;
  const duration = typeof r.videoDurationSec === "number" && Number.isFinite(r.videoDurationSec) && r.videoDurationSec > 0 ? r.videoDurationSec : null;
  return {
    privacyLevel,
    allowComment: bool(r.allowComment),
    allowDuet: bool(r.allowDuet),
    allowStitch: bool(r.allowStitch),
    commercial: bool(r.commercial),
    yourBrand: bool(r.yourBrand),
    brandedContent: bool(r.brandedContent),
    videoDurationSec: duration
  };
}

// --- Envoi du fichier par morceaux (FILE_UPLOAD) ------------------------------
// Règles de TikTok : morceaux de 5 à 64 Mo envoyés dans l'ordre ; le dernier
// absorbe le reste (jusqu'à 128 Mo) ; nombre de morceaux = taille ÷ taille
// d'un morceau, arrondi à l'entier inférieur ; une vidéo de moins de 5 Mo
// part en un seul morceau ; 1 000 morceaux et 4 Go au plus.

export const TIKTOK_MIN_CHUNK = 5 * 1024 * 1024;
export const TIKTOK_MAX_CHUNK = 64 * 1024 * 1024;
/** 10 Mo : un morceau part en quelques secondes, bien sous la limite de 60 s d'une fonction. */
export const TIKTOK_CHUNK_SIZE = 10 * 1024 * 1024;
export const TIKTOK_MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;

export interface TiktokChunkPlan {
  videoSize: number;
  chunkSize: number;
  totalChunks: number;
}

export function tiktokChunkPlan(videoSize: number, preferred = TIKTOK_CHUNK_SIZE): TiktokChunkPlan {
  if (!Number.isFinite(videoSize) || videoSize <= 0) throw new Error("Taille de vidéo inconnue.");
  if (videoSize > TIKTOK_MAX_VIDEO_BYTES) throw new Error("Vidéo trop lourde pour TikTok (4 Go au plus).");
  // Petite vidéo (jusqu'à un morceau) : un seul envoi, de la taille du fichier.
  if (videoSize <= Math.max(preferred, TIKTOK_MIN_CHUNK)) return { videoSize, chunkSize: videoSize, totalChunks: 1 };
  let chunkSize = Math.min(Math.max(preferred, TIKTOK_MIN_CHUNK), TIKTOK_MAX_CHUNK);
  // Au plus 1 000 morceaux : on grossit les morceaux pour une très grosse vidéo.
  if (Math.floor(videoSize / chunkSize) > 1000) chunkSize = Math.min(TIKTOK_MAX_CHUNK, Math.ceil(videoSize / 1000));
  return { videoSize, chunkSize, totalChunks: Math.floor(videoSize / chunkSize) };
}

/** Octets du morceau `index` (0…totalChunks-1), bornes incluses. */
export function tiktokChunkRange(plan: TiktokChunkPlan, index: number): { start: number; end: number } {
  const start = index * plan.chunkSize;
  const end = index === plan.totalChunks - 1 ? plan.videoSize - 1 : start + plan.chunkSize - 1;
  return { start, end };
}
