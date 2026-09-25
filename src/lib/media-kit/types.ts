// Media kit public (produit n°10) — types partagés serveur et navigateur.
import type { Network } from "@/lib/types";

export const MAX_FEATURED_POSTS = 6;
export const MAX_OFFERS = 6;
export const HEADLINE_MAX = 90;
export const ABOUT_MAX = 700;
export const OFFER_LABEL_MAX = 70;
export const OFFER_PRICE_MAX = 30;

export interface KitOffer {
  label: string;
  price: string;
}

/** Ce que le créateur règle. Les chiffres, eux, ne se règlent pas. */
export interface KitSettings {
  published: boolean;
  headline: string;
  about: string;
  contactEmail: string | null;
  hiddenConnectionIds: string[];
  featuredPostIds: string[];
  offers: KitOffer[];
}

export interface KitAccount {
  id: string;
  network: Network;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  /** Dernier relevé ; null si le réseau ne l'a pas encore donné. */
  followers: number | null;
  /** Évolution des abonnés sur ~30 jours (ou depuis le premier relevé, 14 jours au moins). */
  growth: { delta: number; pct: number | null; days: number } | null;
  /** Vues par publication, médiane des 90 derniers jours (3 publications au moins). */
  medianViews: number | null;
  /** Interactions moyennes par publication ÷ abonnés, en %. */
  engagementRate: number | null;
  postsPerMonth: number | null;
  /** Publications mesurées sur 90 jours. */
  measuredPosts: number;
  /** Date du dernier relevé des abonnés. */
  capturedAt: string | null;
}

export interface KitPost {
  id: string;
  network: Network;
  title: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  views: number | null;
  interactions: number;
}

export interface KitTotals {
  /** Somme des abonnés des comptes affichés (ceux dont on a un relevé). */
  audience: number | null;
  /** Vues cumulées des publications des 90 derniers jours. */
  views90: number | null;
  /** Taux d'engagement moyen, pondéré par les abonnés. */
  engagementRate: number | null;
  postsPerMonth: number | null;
  accounts: number;
}

export interface KitStats {
  accounts: KitAccount[];
  totals: KitTotals;
  posts: KitPost[];
  /** true si les publications mises en avant ont été choisies par le créateur. */
  postsChosen: boolean;
  /** Date du relevé le plus récent (abonnés ou publications). */
  updatedAt: string | null;
}

/** Données de la page publique /kit/[slug] (et de l'aperçu de l'éditeur). */
export interface PublicKitData {
  slug: string;
  brandName: string;
  logoUrl: string | null;
  headline: string;
  about: string;
  contactEmail: string | null;
  offers: KitOffer[];
  stats: KitStats;
}

/** Une publication proposée dans l'éditeur (choix des mises en avant). */
export interface KitPostChoice extends KitPost {
  connectionId: string;
}

export interface KitEditorDTO {
  /** Le palier permet-il de publier ? (sinon : aperçu seulement) */
  allowed: boolean;
  slug: string;
  settings: KitSettings;
  /** Tous les comptes de la marque (masqués compris), pour les cases à cocher. */
  connections: { id: string; network: Network; name: string; handle: string | null; status: string }[];
  /** Publications des 12 derniers mois, les meilleures d'abord. */
  postChoices: KitPostChoice[];
  preview: PublicKitData;
  views: number;
  lastViewedAt: string | null;
  publishedAt: string | null;
}
