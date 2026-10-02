// Veille des API (02/10/2026) : calendrier des échéances connues de chaque
// API utilisée par Nebula. Sans dépendance (serveur, page d'administration,
// tests).
//
// Trois façons d'être prévenu AVANT qu'un changement ne casse le site :
//  1. ce calendrier : fin de vie annoncée et date de revue de chaque
//     version ou modèle, rappels à 90, 30 et 7 jours (deadlines.ts) ;
//  2. les signaux lus dans les vraies réponses des API (signals.ts) :
//     en-têtes Deprecation et Sunset, version Meta servie différente de la
//     version demandée… ;
//  3. les changelogs officiels relus chaque jour (sources.ts, watcher.ts).
//
// À TENIR À JOUR : à chaque changement de version (versions.ts, modèle
// Gemini…), mettre à jour l'entrée ici, avec la date de vérification
// (`checkedAt`) et la source de la date de fin de vie.
import { API_VERSIONS } from "@/lib/social/versions";

export type ApiGroup = "Réseaux sociaux" | "Publicité" | "IA" | "Services du site";

export interface WatchedApi {
  id: string;
  label: string;
  group: ApiGroup;
  /** Version ou modèle utilisé par défaut. */
  inUse: string;
  /** Variable d'environnement qui permet de changer sans redéployer, s'il y en a une. */
  envVar?: string;
  /** Fin de vie officielle (AAAA-MM-JJ), null si rien n'est annoncé. */
  sunset: string | null;
  /** Précision sur la date de fin de vie (estimation, règle…). */
  sunsetNote?: string;
  /** Date à laquelle agir : vérifier le changelog, tester, monter de version. */
  reviewBy: string;
  /** Changelog officiel. */
  changelog: string;
  /** Ce qu'il faut faire le moment venu. */
  howTo: string;
  /** Date à laquelle ces informations ont été vérifiées sur les sources officielles. */
  checkedAt: string;
}

/** Annonce officielle déjà lue et évaluée (avec son impact sur Nebula). */
export interface KnownAnnouncement {
  apiId: string;
  /** Date d'effet (AAAA-MM-JJ). */
  date: string;
  title: string;
  impact: "aucun" | "à surveiller" | "action";
  detail: string;
  source: string;
}

const CHECKED = "2026-10-02";

export const WATCHED_APIS: WatchedApi[] = [
  {
    id: "meta-graph",
    label: "Meta Graph API (Facebook, Instagram)",
    group: "Réseaux sociaux",
    inUse: API_VERSIONS.META_GRAPH.version,
    envVar: "META_GRAPH_VERSION",
    sunset: "2028-07-29",
    sunsetNote: "v26.0 disponible depuis le 29/07/2026.",
    reviewBy: API_VERSIONS.META_GRAPH.reviewBy,
    changelog: "https://developers.facebook.com/docs/graph-api/changelog/versions",
    howTo: "Lire le changelog de la nouvelle version, régler META_GRAPH_VERSION sur Vercel (ou versions.ts), lancer npm test (contrats), publier un essai sur chaque réseau Meta.",
    checkedAt: CHECKED
  },
  {
    id: "meta-marketing",
    label: "Meta Marketing API (Publicité Meta)",
    group: "Publicité",
    inUse: API_VERSIONS.META_GRAPH.version,
    envVar: "META_GRAPH_VERSION",
    sunset: null,
    sunsetNote:
      "Date officielle « TBD ». Règle de Meta : l'ancienne version reste au moins 90 jours après la sortie d'une nouvelle ; v26.0 est sortie le 29/07/2026, donc la v25.0 peut être retirée dès le 27/10/2026 (les appels sont alors montés d'office, en-tête X-Ad-Api-Version-Warning).",
    reviewBy: "2026-10-27",
    changelog: "https://developers.facebook.com/docs/marketing-api/overview/versioning",
    howTo: "Même variable que la Graph API (META_GRAPH_VERSION) : passer à v26.0, puis vérifier la synchro Publicité (Analytics → Publicité). Les changements de la v26.0 lus le 02/10/2026 ne touchent pas les champs utilisés par Nebula.",
    checkedAt: CHECKED
  },
  {
    id: "threads",
    label: "Threads API",
    group: "Réseaux sociaux",
    inUse: API_VERSIONS.THREADS.version,
    sunset: null,
    reviewBy: API_VERSIONS.THREADS.reviewBy,
    changelog: "https://developers.facebook.com/docs/threads/changelog",
    howTo: "Pas de calendrier de versions publié : relire le changelog, mettre à jour versions.ts si Meta annonce une v2.",
    checkedAt: CHECKED
  },
  {
    id: "tiktok",
    label: "TikTok (Content Posting et Display API)",
    group: "Réseaux sociaux",
    inUse: API_VERSIONS.TIKTOK.version,
    sunset: null,
    reviewBy: API_VERSIONS.TIKTOK.reviewBy,
    changelog: "https://developers.tiktok.com/doc/changelog",
    howTo: "Relire le changelog ; les contrats (tests/contracts) signalent tout champ changé.",
    checkedAt: CHECKED
  },
  {
    id: "youtube",
    label: "YouTube Data API et YouTube Analytics API",
    group: "Réseaux sociaux",
    inUse: `${API_VERSIONS.YOUTUBE_DATA.version} / Analytics v2`,
    sunset: null,
    reviewBy: API_VERSIONS.YOUTUBE_DATA.reviewBy,
    changelog: "https://developers.google.com/youtube/v3/revision_history",
    howTo: "Relire l'historique des révisions (Data et Analytics) ; surveiller les quotas.",
    checkedAt: CHECKED
  },
  {
    id: "pinterest",
    label: "Pinterest API",
    group: "Réseaux sociaux",
    inUse: API_VERSIONS.PINTEREST.version,
    sunset: null,
    reviewBy: API_VERSIONS.PINTEREST.reviewBy,
    changelog: "https://developers.pinterest.com/docs/changelog/changelog/",
    howTo: "Relire le changelog ; aucune v6 annoncée.",
    checkedAt: CHECKED
  },
  {
    id: "linkedin",
    label: "LinkedIn API (versions mensuelles)",
    group: "Réseaux sociaux",
    inUse: API_VERSIONS.LINKEDIN.version,
    envVar: "LINKEDIN_API_VERSION",
    sunset: "2027-07-15",
    sunsetNote: "Chaque version est gardée un an environ ; à la fin, LinkedIn répond 426 NONEXISTENT_VERSION.",
    reviewBy: API_VERSIONS.LINKEDIN.reviewBy,
    changelog: "https://learn.microsoft.com/linkedin/marketing/integrations/migrations",
    howTo: "Régler LINKEDIN_API_VERSION sur une version récente (ex. 202609), lancer npm test.",
    checkedAt: CHECKED
  },
  {
    id: "bluesky",
    label: "Bluesky (AT Protocol)",
    group: "Réseaux sociaux",
    inUse: "app.bsky.*",
    sunset: null,
    reviewBy: "2027-03-01",
    changelog: "https://atproto.com/blog",
    howTo: "Pas de versions : relire le blog du protocole ; les contrats signalent tout champ changé.",
    checkedAt: CHECKED
  },
  {
    id: "google-ads",
    label: "Google Ads API",
    group: "Publicité",
    inUse: API_VERSIONS.GOOGLE_ADS.version,
    envVar: "GOOGLE_ADS_API_VERSION",
    sunset: "2027-08-01",
    sunsetNote: "Estimation de Google (« août 2027 ») : la date exacte est publiée sur la page des dates de fin.",
    reviewBy: API_VERSIONS.GOOGLE_ADS.reviewBy,
    changelog: "https://developers.google.com/google-ads/api/docs/sunset-dates",
    howTo: "Régler GOOGLE_ADS_API_VERSION sur la dernière version, vérifier la synchro Publicité.",
    checkedAt: CHECKED
  },
  {
    id: "tiktok-ads",
    label: "TikTok Business API (publicité)",
    group: "Publicité",
    inUse: API_VERSIONS.TIKTOK_ADS.version,
    sunset: null,
    reviewBy: API_VERSIONS.TIKTOK_ADS.reviewBy,
    changelog: "https://business-api.tiktok.com/portal/docs",
    howTo: "Relire les annonces du portail TikTok Business.",
    checkedAt: CHECKED
  },
  {
    id: "gemini-text",
    label: "Gemini (textes, assistant, Studio, Rétention)",
    group: "IA",
    inUse: "gemini-3.8-flash",
    envVar: "GEMINI_MODEL",
    sunset: null,
    sunsetNote: "Aucune date d'arrêt annoncée pour gemini-3.8-flash (sorti le 02/09/2026).",
    reviewBy: "2027-03-01",
    changelog: "https://ai.google.dev/gemini-api/docs/deprecations",
    howTo: "Quand Google annonce un arrêt : régler GEMINI_MODEL (et GEMINI_RETENTION_MODEL) sur Vercel avec le modèle conseillé, vérifier /admin/ia (prix).",
    checkedAt: CHECKED
  },
  {
    id: "gemini-image",
    label: "Gemini (miniatures et stickers)",
    group: "IA",
    inUse: "gemini-3.1-flash-image",
    envVar: "GEMINI_IMAGE_MODEL",
    sunset: null,
    sunsetNote: "Aucune date d'arrêt annoncée (stable depuis le 28/05/2026).",
    reviewBy: "2027-03-01",
    changelog: "https://ai.google.dev/gemini-api/docs/deprecations",
    howTo: "Régler GEMINI_IMAGE_MODEL sur Vercel avec le modèle conseillé par Google.",
    checkedAt: CHECKED
  },
  {
    id: "stripe",
    label: "Stripe (abonnements)",
    group: "Services du site",
    inUse: API_VERSIONS.STRIPE.version,
    sunset: null,
    sunsetNote: "Stripe garde ses anciennes versions ; version actuelle : 2026-09-30.endive.",
    reviewBy: API_VERSIONS.STRIPE.reviewBy,
    changelog: "https://docs.stripe.com/upgrades",
    howTo: "Monter de version est un choix : lire le guide de mise à niveau, changer versions.ts, tester un paiement en mode test.",
    checkedAt: CHECKED
  },
  {
    id: "resend",
    label: "Resend (e-mails)",
    group: "Services du site",
    inUse: "API REST",
    sunset: null,
    reviewBy: "2027-03-01",
    changelog: "https://resend.com/changelog",
    howTo: "Relire le changelog ; une clé ou un domaine refusé est déjà signalé dans la cloche.",
    checkedAt: CHECKED
  },
  {
    id: "turnstile",
    label: "Cloudflare Turnstile (anti-robots)",
    group: "Services du site",
    inUse: "siteverify v0",
    sunset: null,
    reviewBy: "2027-03-01",
    changelog: "https://developers.cloudflare.com/turnstile/changelog/",
    howTo: "Relire le changelog ; une clé refusée est déjà signalée dans la cloche.",
    checkedAt: CHECKED
  }
];

/** Annonces officielles lues lors de la mise en place de la veille (02/10/2026). */
export const KNOWN_ANNOUNCEMENTS: KnownAnnouncement[] = [
  {
    apiId: "meta-marketing",
    date: "2026-10-27",
    title: "Meta v26.0 : fonctions de la Marketing API retirées sur toutes les versions",
    impact: "aucun",
    detail: "Champs de Delivery Estimate, sondages publicitaires, placement Messenger Stories, campagnes Web+App : rien de cela n'est utilisé par Nebula (seulement les statistiques des comptes et des campagnes).",
    source: "https://developers.facebook.com/docs/graph-api/changelog/version26.0"
  },
  {
    apiId: "meta-graph",
    date: "2026-07-29",
    title: "Meta v26.0 : paramètres pretty, debug et date_format",
    impact: "aucun",
    detail: "pretty et debug sont ignorés, date_format renvoie une erreur : Nebula n'en utilise aucun. Champs de Page dépréciés (current_location, genre, network, parking, start_info) : non utilisés.",
    source: "https://developers.facebook.com/docs/graph-api/changelog/version26.0"
  },
  {
    apiId: "meta-marketing",
    date: "2026-10-06",
    title: "Fin de la v24.0 de la Marketing API",
    impact: "aucun",
    detail: "Nebula est en v25.0.",
    source: "https://developers.facebook.com/docs/graph-api/changelog/versions"
  },
  {
    apiId: "gemini-image",
    date: "2026-10-02",
    title: "Arrêt de gemini-2.5-flash-image",
    impact: "aucun",
    detail: "Nebula utilise gemini-3.1-flash-image depuis le 30/09/2026.",
    source: "https://ai.google.dev/gemini-api/docs/deprecations"
  },
  {
    apiId: "gemini-text",
    date: "2026-07-21",
    title: "Gemini 3 : temperature, top_p et top_k dépréciés, thinking_level à la place de thinking_budget",
    impact: "aucun",
    detail: "Pour les modèles Gemini 3, Nebula n'envoie déjà que thinkingLevel (src/lib/ai/gemini.ts).",
    source: "https://ai.google.dev/gemini-api/docs/generate-content/latest-model"
  },
  {
    apiId: "google-ads",
    date: "2026-10-07",
    title: "Fin de Google Ads API v22",
    impact: "aucun",
    detail: "Nebula est en v25.",
    source: "https://developers.google.com/google-ads/api/docs/sunset-dates"
  },
  {
    apiId: "pinterest",
    date: "2027-02-01",
    title: "Pinterest : objectifs de campagne simplifiés (SALES, LEADS)",
    impact: "aucun",
    detail: "Concerne les campagnes publicitaires Pinterest, que Nebula ne gère pas.",
    source: "https://developers.pinterest.com/docs/changelog/changelog/"
  },
  {
    apiId: "youtube",
    date: "2026-06-25",
    title: "YouTube Analytics : rapport « activité par ville » retiré",
    impact: "aucun",
    detail: "Non utilisé par Nebula (rétention, vues et part regardée seulement).",
    source: "https://developers.google.com/youtube/analytics/revision_history"
  },
  {
    apiId: "threads",
    date: "2026-03-31",
    title: "Threads : fin des GIF Tenor (remplacés par GIPHY)",
    impact: "aucun",
    detail: "Nebula ne publie pas de GIF sur Threads.",
    source: "https://developers.facebook.com/docs/threads/changelog"
  }
];

export function findWatchedApi(id: string): WatchedApi | undefined {
  return WATCHED_APIS.find((a) => a.id === id);
}
