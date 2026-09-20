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

export interface PublishInput {
  title?: string; // utilisé notamment par YouTube comme titre de la vidéo
  caption: string;
  mediaUrls: string[]; // URLs publiquement accessibles (http/https) des médias à publier
  mediaType: "VIDEO" | "IMAGE";
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
