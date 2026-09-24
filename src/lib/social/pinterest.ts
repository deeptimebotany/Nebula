// Intégration Pinterest (lot 2, 25/09/2026) — API v5 officielle, gratuite.
// Doc : https://developers.pinterest.com/docs/api/v5/
//
// Prérequis (côté Lucas) : créer une app sur developers.pinterest.com
// (compte Pinterest professionnel), déclarer l'URL de retour
// <site>/api/connections/pinterest/callback, renseigner PINTEREST_APP_ID et
// PINTEREST_APP_SECRET, puis demander l'accès « Standard ». Avec l'accès
// d'essai, les épingles créées ne sont visibles que par leur auteur.
//
// Jetons : accès 30 jours + jeton de rafraîchissement ~1 an, renouvelés
// automatiquement quand l'accès approche de l'expiration (freshToken).
// Publication : image, carrousel (2 à 5 images) ou vidéo, dans le tableau
// choisi dans Publier (premier tableau du compte sinon), avec un lien de
// destination facultatif.
import { prisma } from "@/lib/prisma";
import type { AnalyticsResult, PublishResult } from "@/lib/types";
import { oauthRedirectUri } from "@/lib/network-availability";
import {
  SocialApiError,
  fetchJson,
  type ConnectionLike,
  type OAuthTokenResult,
  type PostMetricInput,
  type PublishInput,
  type SocialClient
} from "./base";

const AUTH_URL = "https://www.pinterest.com/oauth/";
const API = "https://api.pinterest.com/v5";
const SCOPES = ["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant. Voir .env.example (section Pinterest).`);
  return value;
}

const redirectUri = () => oauthRedirectUri("pinterest", "PINTEREST_REDIRECT_URI");

function basicAuth(): string {
  return `Basic ${Buffer.from(`${requireEnv("PINTEREST_APP_ID")}:${requireEnv("PINTEREST_APP_SECRET")}`).toString("base64")}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function api<T>(path: string, token: string, init: { method?: "GET" | "POST" | "PATCH"; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  return fetchJson<T>("PINTEREST", url.toString(), {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store"
  });
}

/** Jeton valide : rafraîchi (et enregistré) s'il expire dans moins de 3 jours. */
async function freshToken(connection: ConnectionLike): Promise<string> {
  const expires = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  if (expires === null || expires - Date.now() > 3 * 86_400_000) return connection.accessToken;
  if (!connection.refreshToken) throw new SocialApiError("PINTEREST", "Connexion Pinterest expirée : reconnectez le compte.", 401);
  const token = await fetchJson<TokenResponse>("PINTEREST", `${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refreshToken })
  }).catch(() => {
    throw new SocialApiError("PINTEREST", "Connexion Pinterest expirée : reconnectez le compte.", 401);
  });
  const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000);
  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: { accessToken: token.access_token, ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}), tokenExpiresAt }
  });
  connection.accessToken = token.access_token;
  connection.tokenExpiresAt = tokenExpiresAt;
  if (token.refresh_token) connection.refreshToken = token.refresh_token;
  return token.access_token;
}

export interface PinterestBoard {
  id: string;
  name: string;
  privacy?: string;
}

/** Tableaux du compte (pour le sélecteur de Publier). */
export async function listPinterestBoards(connection: ConnectionLike): Promise<PinterestBoard[]> {
  const token = await freshToken(connection);
  const boards: PinterestBoard[] = [];
  let bookmark: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await api<{ items: PinterestBoard[]; bookmark?: string | null }>("/boards", token, {
      query: { page_size: "100", ...(bookmark ? { bookmark } : {}) }
    });
    boards.push(...res.items.map((b) => ({ id: b.id, name: b.name, privacy: b.privacy })));
    if (!res.bookmark) break;
    bookmark = res.bookmark;
  }
  return boards;
}

/** Envoie une vidéo sur Pinterest (URL publique → upload) et attend son traitement. */
async function uploadVideo(token: string, videoUrl: string): Promise<string> {
  const registered = await api<{ media_id: string; upload_url: string; upload_parameters: Record<string, string> }>("/media", token, {
    method: "POST",
    body: { media_type: "video" }
  });
  const res = await fetch(videoUrl, { cache: "no-store" });
  if (!res.ok) throw new SocialApiError("PINTEREST", `Vidéo inaccessible (${res.status}).`);
  const bytes = await res.arrayBuffer();
  const form = new FormData();
  for (const [k, v] of Object.entries(registered.upload_parameters)) form.append(k, v);
  form.append("file", new Blob([bytes], { type: res.headers.get("content-type") || "video/mp4" }));
  const upload = await fetch(registered.upload_url, { method: "POST", body: form });
  if (!upload.ok) throw new SocialApiError("PINTEREST", `Envoi de la vidéo refusé (${upload.status}).`);
  for (let i = 0; i < 60; i++) {
    const status = await api<{ status: string }>(`/media/${registered.media_id}`, token);
    if (status.status === "succeeded") return registered.media_id;
    if (status.status === "failed") throw new SocialApiError("PINTEREST", "Pinterest n'a pas pu traiter la vidéo.");
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new SocialApiError("PINTEREST", "Pinterest met trop de temps à traiter la vidéo : réessayez dans quelques minutes.");
}

function isVideoUrl(url: string, fallback: "VIDEO" | "IMAGE"): boolean {
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)) return true;
  if (/\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(url)) return false;
  return fallback === "VIDEO";
}

interface PinResponse {
  id: string;
  link?: string | null;
}

export const pinterestClient: SocialClient = {
  network: "PINTEREST",

  getAuthUrl(state) {
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", requireEnv("PINTEREST_APP_ID"));
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(","));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCodeForToken(code) {
    const token = await fetchJson<TokenResponse>("PINTEREST", `${API}/oauth/token`, {
      method: "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() })
    });
    const me = await api<{ username: string; profile_image?: string; business_name?: string | null; id?: string }>("/user_account", token.access_token);
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      externalAccountId: me.id || me.username,
      displayName: me.business_name || me.username,
      handle: `@${me.username}`,
      avatarUrl: me.profile_image,
      scopes: token.scope || SCOPES.join(",")
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishResult> {
    const token = await freshToken(connection);
    if (input.mediaUrls.length === 0) {
      throw new SocialApiError("PINTEREST", "Une épingle a besoin d'une image ou d'une vidéo : ajoutez un média dans Publier.");
    }
    let boardId = input.pinterest?.boardId;
    if (!boardId) {
      const boards = await listPinterestBoards(connection);
      if (boards.length === 0) {
        throw new SocialApiError("PINTEREST", "Aucun tableau sur ce compte Pinterest : créez-en un sur Pinterest, puis réessayez.");
      }
      boardId = boards[0].id;
    }
    const description = input.caption.trim();
    if (Array.from(description).length > 500) {
      throw new SocialApiError("PINTEREST", "Description trop longue pour Pinterest (500 caractères maximum) : utilisez « Personnaliser pour Pinterest » dans Publier.");
    }
    const title = (input.title || description.split("\n")[0] || "").trim().slice(0, 100);
    const link = input.pinterest?.link?.trim() || undefined;

    const first = input.mediaUrls[0];
    let mediaSource: Record<string, unknown>;
    if (isVideoUrl(first, input.mediaType)) {
      const mediaId = await uploadVideo(token, first);
      // Image de couverture : la première image jointe s'il y en a une.
      const cover = input.mediaUrls.find((u) => !isVideoUrl(u, "IMAGE"));
      mediaSource = { source_type: "video_id", media_id: mediaId, ...(cover ? { cover_image_url: cover } : { cover_image_key_frame_time: 1 }) };
    } else if (input.mediaUrls.length > 1) {
      const images = input.mediaUrls.filter((u) => !isVideoUrl(u, "IMAGE")).slice(0, 5);
      mediaSource =
        images.length > 1
          ? { source_type: "multiple_image_urls", items: images.map((url) => ({ url, ...(title ? { title } : {}), ...(description ? { description: description.slice(0, 500) } : {}) })) }
          : { source_type: "image_url", url: images[0] ?? first };
    } else {
      mediaSource = { source_type: "image_url", url: first };
    }

    const pin = await api<PinResponse>("/pins", token, {
      method: "POST",
      body: {
        board_id: boardId,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(link ? { link } : {}),
        media_source: mediaSource
      }
    });
    return { externalPostId: pin.id, externalUrl: `https://www.pinterest.com/pin/${pin.id}/` };
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    const token = await freshToken(connection);
    const me = await api<{ follower_count?: number; pin_count?: number; monthly_views?: number }>("/user_account", token);
    const end = new Date();
    const start = new Date(Date.now() - 29 * 86_400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    let impressions = me.monthly_views ?? 0;
    let engagement = 0;
    try {
      // Statistiques du compte (comptes professionnels) sur 30 jours.
      const stats = await api<{ all?: { summary_metrics?: Record<string, number> } }>("/user_account/analytics", token, {
        query: { start_date: day(start), end_date: day(end), metric_types: "IMPRESSION,ENGAGEMENT,SAVE,PIN_CLICK,OUTBOUND_CLICK" }
      });
      const summary = stats.all?.summary_metrics ?? {};
      impressions = summary.IMPRESSION ?? impressions;
      engagement = summary.ENGAGEMENT ?? (summary.SAVE ?? 0) + (summary.PIN_CLICK ?? 0) + (summary.OUTBOUND_CLICK ?? 0);
    } catch {
      // Compte personnel : pas de statistiques détaillées, on garde les vues mensuelles.
    }
    return {
      followers: me.follower_count ?? 0,
      followersDelta: 0,
      engagementRate: impressions > 0 ? Math.round((engagement / impressions) * 10000) / 100 : 0,
      impressions,
      reach: impressions,
      postsCount: me.pin_count ?? 0,
      raw: { source: "pinterest", window: "30j" }
    };
  },

  async fetchPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
    const token = await freshToken(connection);
    const pins = await api<{ items: { id: string; title?: string | null; description?: string | null; created_at?: string; media?: { images?: Record<string, { url: string }> } }[] }>(
      "/pins",
      token,
      { query: { page_size: "25" } }
    );
    const end = new Date();
    const start = new Date(Date.now() - 89 * 86_400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const out: PostMetricInput[] = [];
    for (const p of pins.items) {
      let impressions: number | null = null;
      let saves: number | null = null;
      let comments: number | null = null;
      try {
        const a = await api<{ all?: { lifetime_metrics?: Record<string, number>; summary_metrics?: Record<string, number> } }>(`/pins/${p.id}/analytics`, token, {
          query: { start_date: day(start), end_date: day(end), metric_types: "IMPRESSION,SAVE,TOTAL_COMMENTS" }
        });
        const m = a.all?.lifetime_metrics ?? a.all?.summary_metrics ?? {};
        impressions = m.IMPRESSION ?? null;
        saves = m.SAVE ?? null;
        comments = m.TOTAL_COMMENTS ?? null;
      } catch {
        // Statistiques indisponibles (compte personnel, épingle trop récente).
      }
      const images = p.media?.images ?? {};
      out.push({
        postExternalId: p.id,
        title: (p.title || p.description || "").split("\n")[0].slice(0, 120),
        permalink: `https://www.pinterest.com/pin/${p.id}/`,
        thumbnailUrl: images["400x300"]?.url ?? images["150x150"]?.url ?? Object.values(images)[0]?.url,
        publishedAt: p.created_at ? new Date(p.created_at) : undefined,
        views: impressions,
        likes: null,
        comments,
        shares: null,
        saves
      });
    }
    return out;
  }
};
