// Types partagés de l'application. SQLite ne supportant pas les enums natifs,
// les colonnes correspondantes sont des String contraintes par ces unions.

export const NETWORKS = [
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE"
] as const;
export type Network = (typeof NETWORKS)[number];

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
  glow: string;
  supportsVideo: boolean;
  supportsImage: boolean;
  maxCaption: number;
  requiresAudit?: string;
}

// Métadonnées utilisées partout dans l'UI (badges, limites de caption, etc.)
// et pour savoir ce que chaque module d'intégration est réellement capable
// de faire une fois les clés API renseignées.
export const NETWORK_META: Record<Network, NetworkMeta> = {
  INSTAGRAM: {
    id: "INSTAGRAM",
    label: "Instagram",
    color: "#E1306C",
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
    glow: "rgba(255,0,0,0.45)",
    supportsVideo: true,
    supportsImage: false,
    maxCaption: 5000,
    requiresAudit: "Projet Google Cloud + quota API (10 000 unités/jour par défaut, ~1 600/upload)."
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
}

export interface AnalyticsResult {
  followers: number;
  followersDelta: number;
  engagementRate: number;
  impressions: number;
  reach: number;
  postsCount: number;
  raw?: Record<string, unknown>;
}
