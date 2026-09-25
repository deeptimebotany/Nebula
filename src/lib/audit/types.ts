// Audit de présence en ligne (produit n°8) — types partagés serveur et
// navigateur (aucun import serveur ici).
//
// Le rapport enregistré (PublicAudit.result) suit AuditResult. Son champ
// `version` permet de faire évoluer la forme sans casser les rapports déjà
// partagés (conservés 30 jours).

export type AuditSourceKey = "youtube" | "instagram" | "tiktok" | "website";

export const AUDIT_SOURCE_LABEL: Record<AuditSourceKey, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "Site ou page bio"
};

/** Référence d'une chaîne YouTube tirée de ce que le visiteur a collé. */
export type YoutubeRef = { kind: "handle" | "id" | "username"; value: string };

/** Entrées normalisées (clé du cache de 24 h, et ce que le rapport affiche). */
export interface AuditInput {
  youtube?: YoutubeRef;
  instagram?: string;
  tiktok?: string;
  /** Toujours en https, sans fragment. */
  website?: string;
}

/**
 * Résultat d'une source :
 *  - ok : données lues ;
 *  - not_found : compte ou page introuvable ;
 *  - private : compte qui existe peut-être, mais dont rien n'est public
 *    (Instagram personnel : seuls les comptes professionnels sont lisibles) ;
 *  - unavailable : panne ou limite atteinte (le rapport le dit) ;
 *  - disabled : source pas encore activée sur ce site.
 */
export type SourceStatus = "ok" | "not_found" | "private" | "unavailable" | "disabled";

export interface SourceOutcome<T> {
  status: SourceStatus;
  /** Explication affichée quand status ≠ ok. */
  message?: string;
  facts?: T;
}

export interface YoutubeVideoFacts {
  id: string;
  title: string;
  descriptionLength: number;
  tagsCount: number;
  publishedAt: string;
  durationSec: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  thumbnailUrl: string;
}

export interface YoutubeFacts {
  id: string;
  title: string;
  /** « @handle » (adresse personnalisée), si la chaîne en a une. */
  handle: string | null;
  url: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  keywords: string;
  country: string | null;
  createdAt: string | null;
  /** null : nombre d'abonnés masqué par la chaîne. */
  subscribers: number | null;
  views: number | null;
  videoCount: number | null;
  /** Dernières vidéos (30 au plus), de la plus récente à la plus ancienne. */
  videos: YoutubeVideoFacts[];
}

export interface InstagramMediaFacts {
  type: string;
  product: string | null;
  timestamp: string;
  likes: number | null;
  comments: number | null;
  captionLength: number;
  hashtags: number;
  permalink: string | null;
}

export interface InstagramFacts {
  username: string;
  name: string | null;
  biography: string;
  website: string | null;
  followers: number | null;
  follows: number | null;
  mediaCount: number | null;
  avatarUrl: string | null;
  /** Dernières publications (25 au plus), de la plus récente à la plus ancienne. */
  media: InstagramMediaFacts[];
}

export interface TiktokFacts {
  username: string;
  displayName: string | null;
  /** Description du profil, quand TikTok la donne. */
  bio: string | null;
  url: string;
}

export type SocialLinkKey = "youtube" | "instagram" | "tiktok" | "facebook" | "x" | "linkedin" | "pinterest" | "threads" | "bluesky";

export interface WebsiteFacts {
  /** Adresse finale, après redirections. */
  url: string;
  host: string;
  https: boolean;
  responseMs: number;
  title: string | null;
  description: string | null;
  ogImage: boolean;
  viewport: boolean;
  lang: string | null;
  noindex: boolean;
  /** Longueur du texte visible (un site presque vide en HTML est rendu en JavaScript). */
  textLength: number;
  /** Réseaux vers lesquels la page renvoie, avec l'identifiant lu dans le lien quand il y en a un. */
  socialLinks: Partial<Record<SocialLinkKey, string | true>>;
}

export interface AuditSources {
  youtube?: SourceOutcome<YoutubeFacts>;
  instagram?: SourceOutcome<InstagramFacts>;
  tiktok?: SourceOutcome<TiktokFacts>;
  website?: SourceOutcome<WebsiteFacts>;
}

export type AxisKey = "profil" | "regularite" | "engagement" | "contenu" | "coherence";

/** Une règle du score, affichée dans « Pourquoi ce score ». */
export interface AuditCheck {
  /** « YouTube · Description de la chaîne ». */
  label: string;
  /** 0 à 1 ; null = sans objet (non compté). */
  value: number | null;
  weight: number;
  /** Constat chiffré (« 42 caractères »). */
  detail: string;
  /** Repère affiché (« 150 caractères ou plus »). */
  rule: string;
}

export interface AuditAxis {
  key: AxisKey;
  label: string;
  weight: number;
  /** 0 à 100 ; null = pas assez de données (axe exclu du score global). */
  score: number | null;
  /** Pourquoi l'axe n'est pas calculé. */
  missing?: string;
  checks: AuditCheck[];
}

export interface AuditRecommendation {
  key: string;
  axis: AxisKey;
  /** 3 = à faire d'abord. */
  priority: 1 | 2 | 3;
  text: string;
}

export interface AuditScore {
  global: number | null;
  label: string | null;
  /** Nombre d'axes calculés (sur 5). */
  basedOn: number;
  axes: AuditAxis[];
}

export interface AuditResult {
  version: 1;
  analyzedAt: string;
  input: AuditInput;
  sources: AuditSources;
  score: AuditScore;
  recommendations: AuditRecommendation[];
  /** Constats par plateforme non notés (jour et heure les plus fréquents…). */
  notes: { source: AuditSourceKey; text: string }[];
}

/** Conseils écrits par l'IA (Gemini), ajoutés après coup au rapport. */
export interface AuditAdvice {
  paragraphs: string[];
  generatedAt: string;
}

export const AUDIT_DAILY_LIMIT = 3;
export const AUDIT_RETENTION_DAYS = 30;
export const AUDIT_CACHE_HOURS = 24;

/** Libellé du score global. */
export function scoreLabel(score: number): string {
  if (score >= 80) return "Présence remarquable";
  if (score >= 60) return "Présence solide";
  if (score >= 40) return "Présence en construction";
  return "Fondations à poser";
}

/** Nom d'un compte YouTube tel qu'on le montre (« @nebula », « UC… »). */
export function youtubeRefLabel(ref: YoutubeRef): string {
  return ref.kind === "handle" ? `@${ref.value}` : ref.value;
}

/** Nom de ce qui a été analysé (titre de la chaîne, @pseudo ou domaine). */
export function subjectOf(result: AuditResult): string {
  const s = result.sources;
  return (
    s.youtube?.facts?.title ??
    (s.instagram?.facts ? `@${s.instagram.facts.username}` : null) ??
    (s.tiktok?.facts ? `@${s.tiktok.facts.username}` : null) ??
    s.website?.facts?.host ??
    (result.input.youtube ? youtubeRefLabel(result.input.youtube) : null) ??
    (result.input.instagram ? `@${result.input.instagram}` : null) ??
    "ce compte"
  );
}
