// Types partagés de l'application. SQLite ne supportant pas les enums natifs,
// les colonnes correspondantes sont des String contraintes par ces unions.

export const NETWORKS = [
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE",
  // Ajouté le 25/09/2026 : réseau ouvert (protocole AT), API gratuite et
  // sans validation — connexion par mot de passe d'application, voir
  // src/lib/social/bluesky.ts.
  "BLUESKY",
  // Lot 2 (25/09/2026) : API gratuites, mais chaque plateforme doit valider
  // l'application Nebula. Masqués dans l'application tant que leurs clés ne
  // sont pas configurées (voir src/lib/network-availability.ts), et absents
  // des pages publiques tant qu'ils ne sont pas dans LAUNCHED_NETWORKS.
  "THREADS",
  "PINTEREST",
  "LINKEDIN"
] as const;
export type Network = (typeof NETWORKS)[number];

/**
 * Réseaux annoncés sur les pages publiques (accueil, /reseaux, comparatifs,
 * llms.txt). Ajouter un réseau ici le jour où son application est validée
 * par la plateforme et ses clés configurées en production — pas avant, pour
 * ne rien promettre qui ne marche pas encore.
 */
export const LAUNCHED_NETWORKS: readonly Network[] = ["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "BLUESKY"];

export const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const CONNECTION_STATUSES = [
  "CONNECTED",
  "EXPIRED",
  "ERROR",
  "DISCONNECTED"
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const POST_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "PARTIAL"
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const TARGET_STATUSES = [
  "PENDING",
  "SCHEDULED",
  "PUBLISHING",
  // Vidéo en cours de traitement chez le réseau : terminée par le cron (lot 2).
  "PROCESSING",
  // Nouvel essai automatique prévu (panne passagère, limite de débit, réseau
  // suspendu) : relancé par le cron à nextCheckAt (lot 5).
  "RETRY_WAIT",
  "PUBLISHED",
  "FAILED"
] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const MEDIA_TYPES = ["VIDEO", "IMAGE"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface NetworkMeta {
  id: Network;
  label: string;
  color: string;
  /** Même teinte, assombrie pour rester lisible en texte sur fond clair (mode clair, ≥ 4,5:1). */
  ink: string;
  glow: string;
  supportsVideo: boolean;
  supportsImage: boolean;
  maxCaption: number;
  requiresAudit?: string;
  /**
   * false : l'API ne donne pas les statistiques du compte (abonnés, portée)
   * — la synchro Analytics ignore alors ce réseau au lieu d'afficher une
   * erreur. Absent = statistiques disponibles.
   */
  statsAvailable?: boolean;
}

// Métadonnées utilisées partout dans l'UI (badges, limites de caption, etc.)
// et pour savoir ce que chaque module d'intégration est réellement capable
// de faire une fois les clés API renseignées.
export const NETWORK_META: Record<Network, NetworkMeta> = {
  INSTAGRAM: {
    id: "INSTAGRAM",
    label: "Instagram",
    color: "#E1306C",
    ink: "#B81F56",
    glow: "rgba(225,48,108,0.45)",
    supportsVideo: true,
    supportsImage: true,
    maxCaption: 2200,
    requiresAudit:
      "Compte Business/Creator + App Meta en mode Live avec permission instagram_content_publish validée en App Review."
  },
  FACEBOOK: {
    id: "FACEBOOK",
    label: "Facebook",
    color: "#1877F2",
    ink: "#0F5CC0",
    glow: "rgba(24,119,242,0.45)",
    supportsVideo: true,
    supportsImage: true,
    maxCaption: 63206,
    requiresAudit: "Page Facebook + permission pages_manage_posts validée en App Review."
  },
  TIKTOK: {
    id: "TIKTOK",
    label: "TikTok",
    color: "#69C9D0",
    ink: "#0E737B",
    glow: "rgba(105,201,208,0.45)",
    supportsVideo: true,
    supportsImage: true,
    maxCaption: 2200,
    requiresAudit:
      "Scope video.publish audité par TikTok (sinon publication limitée à vos comptes de test)."
  },
  YOUTUBE: {
    id: "YOUTUBE",
    label: "YouTube",
    color: "#FF0000",
    ink: "#C00000",
    glow: "rgba(255,0,0,0.45)",
    supportsVideo: true,
    supportsImage: false,
    maxCaption: 5000,
    requiresAudit: "Projet Google Cloud + quota API (10 000 unités/jour par défaut, ~1 600/upload)."
  },
  BLUESKY: {
    id: "BLUESKY",
    label: "Bluesky",
    color: "#1185FE",
    ink: "#0A66C8",
    glow: "rgba(17,133,254,0.45)",
    // Vidéo possible côté Bluesky, mais via un service d'encodage séparé :
    // pas encore branché ici (images uniquement, jusqu'à 4).
    supportsVideo: false,
    supportsImage: true,
    maxCaption: 300
  },
  THREADS: {
    id: "THREADS",
    label: "Threads",
    color: "#E7E7E7",
    ink: "#1F1F1F",
    glow: "rgba(231,231,231,0.35)",
    supportsVideo: true,
    supportsImage: true,
    maxCaption: 500,
    requiresAudit: "Cas d'usage « Threads API » dans l'app Meta + permissions threads_content_publish et threads_manage_insights validées en App Review."
  },
  PINTEREST: {
    id: "PINTEREST",
    label: "Pinterest",
    color: "#E60023",
    ink: "#B8001C",
    glow: "rgba(230,0,35,0.45)",
    supportsVideo: true,
    supportsImage: true,
    maxCaption: 500,
    requiresAudit: "App Pinterest avec accès « Standard » (l'accès d'essai limite la publication aux épingles visibles par vous seul)."
  },
  LINKEDIN: {
    id: "LINKEDIN",
    label: "LinkedIn",
    color: "#0A66C2",
    ink: "#084E96",
    glow: "rgba(10,102,194,0.45)",
    supportsVideo: true,
    supportsImage: true,
    maxCaption: 3000,
    requiresAudit: "Produits « Sign In with LinkedIn (OpenID Connect) » et « Share on LinkedIn » (gratuits, sans validation) — profils personnels. Les Pages entreprise demandent la Community Management API.",
    // L'API gratuite ne donne ni les abonnés ni les statistiques d'un profil personnel.
    statsAvailable: false
  }
};

// Point de données consommé par GrowthChart (dashboard + analytics) : une
// date et une valeur numérique par série (réseau).
export interface ChartPoint {
  date: string;
  [seriesKey: string]: number | string;
}

export interface PublishResult {
  externalPostId: string;
  externalUrl?: string;
  /** Miniature choisie dans Publier, envoyée au réseau (YouTube). Absent : aucune miniature. */
  thumbnail?: ThumbnailStatus;
}

/**
 * Sort de la miniature envoyée avec une vidéo (PostTarget.thumbnailStatus) :
 * appliquée, refusée par le réseau (chaîne YouTube non vérifiée…), format ou
 * poids non acceptés (JPEG ou PNG de 2 Mo au plus), ou échec passager.
 */
export type ThumbnailStatus = "APPLIED" | "REFUSED" | "UNSUPPORTED" | "FAILED";

export interface AnalyticsResult {
  followers: number;
  followersDelta: number;
  engagementRate: number;
  impressions: number;
  reach: number;
  postsCount: number;
  raw?: Record<string, unknown>;
}
