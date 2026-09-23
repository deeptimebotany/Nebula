import type { AnalyticsResult, Network, PublishResult } from "@/lib/types";

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  externalAccountId: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  scopes: string;
}

export interface ConnectionLike {
  id: string;
  externalAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

// Réglages propres à YouTube pour une publication donnée — voir
// composer-types.ts (même forme côté client) et src/lib/social/youtube.ts
// qui les applique. Tous optionnels : absents, youtube.ts retombe sur des
// valeurs par défaut sûres (public, pas destiné aux enfants).
export interface YoutubeOptions {
  privacyStatus?: "public" | "unlisted" | "private";
  madeForKids?: boolean;
  categoryId?: string;
  tags?: string[];
  notifySubscribers?: boolean;
  playlistId?: string;
}

export interface PublishInput {
  title?: string; // utilisé notamment par YouTube comme titre de la vidéo
  caption: string;
  mediaUrls: string[]; // URLs publiquement accessibles (http/https) des médias à publier
  mediaType: "VIDEO" | "IMAGE";
  youtube?: YoutubeOptions;
}

/**
 * Un commentaire (ou, plus tard, un message privé) reçu sur une publication
 * déjà en ligne — voir SocialClient.fetchEngagement ci-dessous et la page
 * /interactions qui les affiche.
 */
export interface EngagementItemInput {
  type: "COMMENT" | "MESSAGE";
  externalId: string;
  postExternalId?: string;
  postPermalink?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  text?: string;
  permalink?: string;
  publishedAt?: Date;
}

/**
 * Métriques d'engagement d'UNE publication déjà en ligne — voir
 * SocialClient.fetchPostMetrics ci-dessous et la page /engagements. Un champ
 * absent (undefined/null) signifie « non exposé par l'API de ce réseau »,
 * pas zéro : YouTube ne donne pas les partages, Instagram pas les vues des
 * photos, etc. La page l'affiche « — » plutôt que 0.
 */
export interface PostMetricInput {
  postExternalId: string;
  title?: string;
  permalink?: string;
  thumbnailUrl?: string;
  publishedAt?: Date;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
}

/**
 * Contrat commun implémenté par chaque intégration réseau.
 *
 * Toutes les méthodes appellent réellement l'API officielle du réseau —
 * aucune n'est simulée. Elles échoueront tant que les identifiants
 * développeur (client id/secret) et l'approbation de l'app par la
 * plateforme concernée n'auront pas été obtenus (voir README.md et
 * src/lib/types.ts → NETWORK_META[...].requiresAudit).
 */
export interface SocialClient {
  network: Network;
  getAuthUrl(state: string): string;
  exchangeCodeForToken(code: string): Promise<OAuthTokenResult>;
  publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishResult>;
  fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult>;
  /**
   * Ajoute le "premier commentaire" (voir bulle dédiée dans le Composer) sur
   * une publication déjà publiée. Optionnel : tous les réseaux ne le
   * supportent pas encore (voir src/lib/social/*.ts) — l'appelant
   * (src/lib/publish.ts) vérifie sa présence avant d'appeler, et traite tout
   * échec comme non-bloquant (la publication elle-même reste un succès).
   */
  postComment?(connection: ConnectionLike, externalPostId: string, comment: string): Promise<void>;
  /**
   * Récupère les commentaires reçus sur les publications récentes de ce
   * compte — alimente la boîte de réception /interactions (voir la page
   * Comptes → menu déroulant d'un compte → "Interactions"). Optionnel :
   * certains réseaux ne l'exposent pas via leur API publique (voir
   * tiktok.ts, qui ne l'implémente pas) — l'appelant (/api/engagement/sync)
   * vérifie sa présence avant d'appeler et affiche un message clair sinon.
   */
  fetchEngagement?(connection: ConnectionLike): Promise<EngagementItemInput[]>;
  /**
   * Récupère les métriques (vues, likes, commentaires, partages,
   * enregistrements) des publications récentes de ce compte — alimente la
   * page /engagements. Optionnel, comme fetchEngagement : l'appelant
   * (/api/engagements/sync) vérifie sa présence. Chaque réseau remplit ce
   * qu'il expose et laisse le reste à null.
   */
  fetchPostMetrics?(connection: ConnectionLike): Promise<PostMetricInput[]>;
}

export class SocialApiError extends Error {
  constructor(
    public network: Network,
    message: string,
    public status?: number,
    public raw?: unknown
  ) {
    super(`[${network}] ${message}`);
  }
}

export async function fetchJson<T>(
  network: Network,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // réponse non-JSON (rare, souvent une erreur HTML de la plateforme)
  }
  if (!res.ok) {
    const message =
      (json as { error?: { message?: string } })?.error?.message ||
      (json as { message?: string })?.message ||
      text ||
      res.statusText;
    throw new SocialApiError(network, message, res.status, json);
  }
  return json as T;
}
