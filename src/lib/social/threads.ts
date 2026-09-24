// Intégration Threads (lot 2, 25/09/2026) — API officielle de Meta,
// gratuite. Doc : https://developers.facebook.com/docs/threads
//
// Prérequis (côté Lucas) : dans l'app Meta, ajouter le cas d'usage
// « Accéder à l'API Threads », noter l'identifiant et la clé secrète de
// l'application Threads (THREADS_APP_ID / THREADS_APP_SECRET, différents de
// META_APP_ID), déclarer l'URL de retour
// <site>/api/connections/threads/callback, puis faire valider en App Review
// les permissions threads_content_publish, threads_manage_insights,
// threads_manage_replies et threads_read_replies. Avant validation, seuls
// les comptes testeurs de l'app peuvent se connecter.
//
// Jetons : l'échange du code donne un jeton court (1 h), aussitôt échangé
// contre un jeton long (60 jours), rafraîchi automatiquement quand il
// approche de l'expiration (voir freshToken).
import { prisma } from "@/lib/prisma";
import type { AnalyticsResult, PublishResult } from "@/lib/types";
import { oauthRedirectUri } from "@/lib/network-availability";
import {
  SocialApiError,
  fetchJson,
  type ConnectionLike,
  type EngagementItemInput,
  type OAuthTokenResult,
  type PostMetricInput,
  type PublishInput,
  type SocialClient
} from "./base";

const AUTH_URL = "https://threads.net/oauth/authorize";
const GRAPH = "https://graph.threads.net";
const API = `${GRAPH}/v1.0`;
const SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights", "threads_manage_replies", "threads_read_replies"];
const MAX_CAROUSEL = 20;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant. Voir .env.example (section Threads).`);
  return value;
}

const redirectUri = () => oauthRedirectUri("threads", "THREADS_REDIRECT_URI");

async function graph<T>(path: string, token: string, init: { method?: "GET" | "POST"; params?: Record<string, string | undefined> } = {}): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${API}${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  return fetchJson<T>("THREADS", url.toString(), { method: init.method ?? "GET", cache: "no-store" });
}

/** Jeton valide : rafraîchi (et enregistré) s'il expire dans moins de 7 jours. */
async function freshToken(connection: ConnectionLike): Promise<string> {
  const expires = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  if (expires !== null && expires < Date.now()) {
    throw new SocialApiError("THREADS", "Connexion Threads expirée : reconnectez le compte.", 401);
  }
  if (expires === null || expires - Date.now() > 7 * 86_400_000) return connection.accessToken;
  try {
    const refreshed = await fetchJson<{ access_token: string; expires_in: number }>(
      "THREADS",
      `${GRAPH}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(connection.accessToken)}`,
      { cache: "no-store" }
    );
    const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await prisma.socialConnection.update({ where: { id: connection.id }, data: { accessToken: refreshed.access_token, tokenExpiresAt } });
    connection.accessToken = refreshed.access_token;
    connection.tokenExpiresAt = tokenExpiresAt;
    return refreshed.access_token;
  } catch {
    // Rafraîchissement refusé (jeton de moins de 24 h, par exemple) : l'actuel reste valable.
    return connection.accessToken;
  }
}

/** Attend qu'un conteneur média soit prêt (vidéos surtout), max ~5 min. */
async function waitForContainer(id: string, token: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const s = await graph<{ status: string; error_message?: string }>(`/${id}`, token, { params: { fields: "status,error_message" } });
    if (s.status === "FINISHED" || s.status === "PUBLISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED") {
      throw new SocialApiError("THREADS", `Threads n'a pas pu traiter le média${s.error_message ? ` : ${s.error_message}` : "."}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new SocialApiError("THREADS", "Threads met trop de temps à traiter le média : réessayez dans quelques minutes.");
}

function isVideoUrl(url: string, fallback: "VIDEO" | "IMAGE"): boolean {
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)) return true;
  if (/\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(url)) return false;
  return fallback === "VIDEO";
}

export const threadsClient: SocialClient = {
  network: "THREADS",

  getAuthUrl(state) {
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", requireEnv("THREADS_APP_ID"));
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("scope", SCOPES.join(","));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCodeForToken(code) {
    const appId = requireEnv("THREADS_APP_ID");
    const secret = requireEnv("THREADS_APP_SECRET");
    const short = await fetchJson<{ access_token: string; user_id: string | number }>("THREADS", `${GRAPH}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri(), code })
    });
    const long = await fetchJson<{ access_token: string; expires_in: number }>(
      "THREADS",
      `${GRAPH}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(secret)}&access_token=${encodeURIComponent(short.access_token)}`
    );
    const me = await graph<{ id: string; username: string; name?: string; threads_profile_picture_url?: string }>("/me", long.access_token, {
      params: { fields: "id,username,name,threads_profile_picture_url" }
    });
    return {
      accessToken: long.access_token,
      expiresAt: new Date(Date.now() + long.expires_in * 1000),
      externalAccountId: me.id,
      displayName: me.name || me.username,
      handle: `@${me.username}`,
      avatarUrl: me.threads_profile_picture_url,
      scopes: SCOPES.join(",")
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishResult> {
    const token = await freshToken(connection);
    const userId = connection.externalAccountId;
    const text = input.caption.trim();
    if (Array.from(text).length > 500) {
      throw new SocialApiError("THREADS", `Texte trop long pour Threads (${Array.from(text).length} caractères, 500 maximum) : utilisez « Personnaliser pour Threads » dans Publier.`);
    }
    const media = input.mediaUrls.slice(0, MAX_CAROUSEL);

    let containerId: string;
    if (media.length === 0) {
      ({ id: containerId } = await graph<{ id: string }>(`/${userId}/threads`, token, { method: "POST", params: { media_type: "TEXT", text } }));
    } else if (media.length === 1) {
      const video = isVideoUrl(media[0], input.mediaType);
      ({ id: containerId } = await graph<{ id: string }>(`/${userId}/threads`, token, {
        method: "POST",
        params: { media_type: video ? "VIDEO" : "IMAGE", [video ? "video_url" : "image_url"]: media[0], text: text || undefined }
      }));
    } else {
      const children: string[] = [];
      for (const url of media) {
        const video = isVideoUrl(url, input.mediaType);
        const child = await graph<{ id: string }>(`/${userId}/threads`, token, {
          method: "POST",
          params: { media_type: video ? "VIDEO" : "IMAGE", [video ? "video_url" : "image_url"]: url, is_carousel_item: "true" }
        });
        if (video) await waitForContainer(child.id, token);
        children.push(child.id);
      }
      ({ id: containerId } = await graph<{ id: string }>(`/${userId}/threads`, token, {
        method: "POST",
        params: { media_type: "CAROUSEL", children: children.join(","), text: text || undefined }
      }));
    }

    await waitForContainer(containerId, token);
    const published = await graph<{ id: string }>(`/${userId}/threads_publish`, token, { method: "POST", params: { creation_id: containerId } });
    const details = await graph<{ permalink?: string }>(`/${published.id}`, token, { params: { fields: "permalink" } }).catch(() => ({ permalink: undefined }));
    return { externalPostId: published.id, externalUrl: details.permalink };
  },

  // Premier commentaire = réponse publiée sous le post.
  async postComment(connection: ConnectionLike, externalPostId: string, comment: string) {
    const token = await freshToken(connection);
    const userId = connection.externalAccountId;
    const container = await graph<{ id: string }>(`/${userId}/threads`, token, {
      method: "POST",
      params: { media_type: "TEXT", text: comment.trim(), reply_to_id: externalPostId }
    });
    await waitForContainer(container.id, token);
    await graph(`/${userId}/threads_publish`, token, { method: "POST", params: { creation_id: container.id } });
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    const token = await freshToken(connection);
    const userId = connection.externalAccountId;
    const since = Math.floor((Date.now() - 28 * 86_400_000) / 1000);
    const until = Math.floor(Date.now() / 1000);
    type Insights = { data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
    // Abonnés : valeur totale, demandée à part (pas de fenêtre de dates).
    const followersRes = await graph<Insights>(`/${userId}/threads_insights`, token, { params: { metric: "followers_count" } });
    const activity = await graph<Insights>(`/${userId}/threads_insights`, token, {
      params: { metric: "views,likes,replies,reposts,quotes", since: String(since), until: String(until) }
    }).catch(() => ({ data: [] }) as Insights);
    const insights = { data: [...followersRes.data, ...activity.data] };
    const metric = (name: string) => {
      const m = insights.data.find((d) => d.name === name);
      if (!m) return 0;
      if (m.total_value) return m.total_value.value;
      return (m.values ?? []).reduce((sum, v) => sum + (v.value ?? 0), 0);
    };
    const threads = await graph<{ data: { id: string }[] }>(`/${userId}/threads`, token, { params: { fields: "id", limit: "50", since: String(since) } }).catch(() => ({ data: [] }));
    const followers = metric("followers_count");
    const interactions = metric("likes") + metric("replies") + metric("reposts") + metric("quotes");
    const posts = threads.data.length;
    return {
      followers,
      followersDelta: 0,
      engagementRate: followers > 0 && posts > 0 ? Math.round((interactions / posts / followers) * 10000) / 100 : 0,
      impressions: metric("views"),
      reach: metric("views"),
      postsCount: posts,
      raw: { source: "threads", window: "28j" }
    };
  },

  async fetchPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
    const token = await freshToken(connection);
    const list = await graph<{ data: { id: string; text?: string; permalink?: string; timestamp?: string; media_type?: string; media_url?: string; thumbnail_url?: string }[] }>(
      `/${connection.externalAccountId}/threads`,
      token,
      { params: { fields: "id,text,permalink,timestamp,media_type,media_url,thumbnail_url", limit: "25" } }
    );
    const out: PostMetricInput[] = [];
    for (const t of list.data) {
      const ins = await graph<{ data: { name: string; values?: { value: number }[] }[] }>(`/${t.id}/insights`, token, {
        params: { metric: "views,likes,replies,reposts,quotes" }
      }).catch(() => ({ data: [] as { name: string; values?: { value: number }[] }[] }));
      const v = (name: string) => ins.data.find((d) => d.name === name)?.values?.[0]?.value ?? null;
      const reposts = v("reposts");
      const quotes = v("quotes");
      out.push({
        postExternalId: t.id,
        title: (t.text ?? "").split("\n")[0].slice(0, 120),
        permalink: t.permalink,
        thumbnailUrl: t.media_type === "VIDEO" ? t.thumbnail_url : t.media_url,
        publishedAt: t.timestamp ? new Date(t.timestamp) : undefined,
        views: v("views"),
        likes: v("likes"),
        comments: v("replies"),
        shares: reposts === null && quotes === null ? null : (reposts ?? 0) + (quotes ?? 0),
        saves: null
      });
    }
    return out;
  },

  async fetchEngagement(connection: ConnectionLike): Promise<EngagementItemInput[]> {
    const token = await freshToken(connection);
    const list = await graph<{ data: { id: string; permalink?: string }[] }>(`/${connection.externalAccountId}/threads`, token, {
      params: { fields: "id,permalink", limit: "10" }
    });
    const items: EngagementItemInput[] = [];
    for (const t of list.data) {
      const replies = await graph<{ data: { id: string; text?: string; username?: string; timestamp?: string; permalink?: string }[] }>(`/${t.id}/replies`, token, {
        params: { fields: "id,text,username,timestamp,permalink" }
      }).catch(() => ({ data: [] as { id: string; text?: string; username?: string; timestamp?: string; permalink?: string }[] }));
      for (const r of replies.data) {
        items.push({
          type: "COMMENT",
          externalId: r.id,
          postExternalId: t.id,
          postPermalink: t.permalink,
          authorName: r.username ? `@${r.username}` : undefined,
          text: r.text,
          permalink: r.permalink,
          publishedAt: r.timestamp ? new Date(r.timestamp) : undefined
        });
      }
    }
    return items;
  }
};
