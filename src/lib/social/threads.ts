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
import type { ZodType, ZodTypeDef } from "zod";
import { prisma } from "@/lib/prisma";
import type { AnalyticsResult } from "@/lib/types";
import { oauthRedirectUri } from "@/lib/network-availability";
import {
  SocialApiError,
  fetchJson,
  pollUntil,
  waitBudgetMs,
  type PublishCheckpoint,
  type PublishOutcome,
  type ConnectionLike,
  type EngagementItemInput,
  type OAuthTokenResult,
  type PostMetricInput,
  type RecentPost,
  type PublishInput,
  type SocialClient
} from "./base";
import { countSchema, graphList, idSchema, opt, soft, textSchema, toDate, z } from "./contract";
import { API_VERSIONS } from "./versions";

const AUTH_URL = "https://threads.net/oauth/authorize";
const GRAPH = "https://graph.threads.net";
// Version centralisée dans versions.ts (règle 4 : aucune version en dur).
const API = `${GRAPH}/${API_VERSIONS.THREADS.version}`;

// --- Contrats des réponses (lot 7, voir contract.ts) -------------------------
// Doc : https://developers.facebook.com/docs/threads/posts
//       https://developers.facebook.com/docs/threads/insights
// Réponses types : tests/contracts/fixtures/threads.
const createdSchema = z.object({ id: idSchema });
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: soft(z.number()) });
const containerSchema = z.object({ status: z.string(), error_message: textSchema });
const insightsSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      values: soft(z.array(z.object({ value: countSchema }))),
      total_value: soft(z.object({ value: countSchema }))
    })
  )
});
type Insights = z.output<typeof insightsSchema>;
const threadSchema = z.object({
  id: idSchema,
  text: textSchema,
  permalink: textSchema,
  timestamp: textSchema,
  media_type: textSchema,
  media_url: textSchema,
  thumbnail_url: textSchema
});
const replySchema = z.object({ id: idSchema, text: textSchema, username: textSchema, timestamp: textSchema, permalink: textSchema });
const SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights", "threads_manage_replies", "threads_read_replies"];
const MAX_CAROUSEL = 20;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant. Voir .env.example (section Threads).`);
  return value;
}

const redirectUri = () => oauthRedirectUri("threads", "THREADS_REDIRECT_URI");

async function graph<T = unknown>(
  path: string,
  token: string,
  init: { method?: "GET" | "POST"; params?: Record<string, string | undefined>; schema?: ZodType<T, ZodTypeDef, unknown> } = {}
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${API}${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  return fetchJson("THREADS", url.toString(), { method: init.method ?? "GET", cache: "no-store", schema: init.schema });
}

/** Jeton valide : rafraîchi (et enregistré) s'il expire dans moins de 7 jours. */
async function freshToken(connection: ConnectionLike): Promise<string> {
  const expires = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  if (expires !== null && expires < Date.now()) {
    throw new SocialApiError("THREADS", "Connexion Threads expirée : reconnectez le compte.", 401);
  }
  if (expires === null || expires - Date.now() > 7 * 86_400_000) return connection.accessToken;
  try {
    const refreshed = await fetchJson(
      "THREADS",
      `${GRAPH}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(connection.accessToken)}`,
      { cache: "no-store", schema: tokenSchema }
    );
    const tokenExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 60 * 86_400) * 1000);
    await prisma.socialConnection.update({ where: { id: connection.id }, data: { accessToken: refreshed.access_token, tokenExpiresAt } });
    connection.accessToken = refreshed.access_token;
    connection.tokenExpiresAt = tokenExpiresAt;
    return refreshed.access_token;
  } catch {
    // Rafraîchissement refusé (jeton de moins de 24 h, par exemple) : l'actuel reste valable.
    return connection.accessToken;
  }
}

/**
 * Vrai quand le conteneur est prêt, faux si le budget d'attente est épuisé
 * (lot 2 : plus d'attente de 5 minutes dans une requête que Vercel coupe).
 */
async function containerReady(id: string, token: string, budgetMs: number): Promise<boolean> {
  const ready = await pollUntil(
    async () => {
      const s = await graph(`/${id}`, token, { params: { fields: "status,error_message" }, schema: containerSchema });
      if (s.status === "FINISHED" || s.status === "PUBLISHED") return true;
      if (s.status === "ERROR" || s.status === "EXPIRED") {
        throw new SocialApiError("THREADS", `Threads n'a pas pu traiter le média${s.error_message ? ` : ${s.error_message}` : "."}`, 400);
      }
      return undefined;
    },
    budgetMs,
    3000
  );
  return ready === true;
}

/** Publie un conteneur prêt, ou renvoie un point de reprise pour le cron. */
async function finishThreadsContainer(connection: ConnectionLike, token: string, containerId: string, input: PublishInput): Promise<PublishOutcome> {
  if (!(await containerReady(containerId, token, waitBudgetMs(input)))) {
    return { pending: true, checkpoint: { step: "threads_container", containerId }, retryInMs: 30_000 };
  }
  const published = await graph(`/${connection.externalAccountId}/threads_publish`, token, {
    method: "POST",
    params: { creation_id: containerId },
    schema: createdSchema
  });
  const details = await graph(`/${published.id}`, token, { params: { fields: "permalink" }, schema: z.object({ permalink: textSchema }) }).catch(() => ({
    permalink: undefined
  }));
  return { externalPostId: published.id, externalUrl: details.permalink };
}

/** Carrousel : attend que chaque élément (vidéos surtout) soit prêt, puis crée le conteneur parent. */
async function finishThreadsCarousel(connection: ConnectionLike, token: string, children: string[], input: PublishInput): Promise<PublishOutcome> {
  for (const child of children) {
    if (!(await containerReady(child, token, waitBudgetMs(input)))) {
      return { pending: true, checkpoint: { step: "threads_carousel", children: children.join(",") }, retryInMs: 30_000 };
    }
  }
  const text = input.caption.trim();
  const { id: containerId } = await graph(`/${connection.externalAccountId}/threads`, token, {
    method: "POST",
    params: { media_type: "CAROUSEL", children: children.join(","), text: text || undefined },
    schema: createdSchema
  });
  return finishThreadsContainer(connection, token, containerId, input);
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
    const short = await fetchJson("THREADS", `${GRAPH}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri(), code }),
      schema: z.object({ access_token: z.string().min(1), user_id: opt(idSchema) })
    });
    const long = await fetchJson(
      "THREADS",
      `${GRAPH}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(secret)}&access_token=${encodeURIComponent(short.access_token)}`,
      { schema: tokenSchema }
    );
    const me = await graph("/me", long.access_token, {
      params: { fields: "id,username,name,threads_profile_picture_url" },
      schema: z.object({ id: idSchema, username: z.string().min(1), name: textSchema, threads_profile_picture_url: textSchema })
    });
    return {
      accessToken: long.access_token,
      expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000),
      externalAccountId: me.id,
      displayName: me.name || me.username,
      handle: `@${me.username}`,
      avatarUrl: me.threads_profile_picture_url,
      scopes: SCOPES.join(","),
      // Identifiant utilisé par les rappels « application retirée » de Threads.
      authUserId: me.id
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishOutcome> {
    const token = await freshToken(connection);
    const userId = connection.externalAccountId;
    const text = input.caption.trim();
    if (Array.from(text).length > 500) {
      throw new SocialApiError("THREADS", `Texte trop long pour Threads (${Array.from(text).length} caractères, 500 maximum) : utilisez « Personnaliser pour Threads » dans Publier.`);
    }
    const media = input.mediaUrls.slice(0, MAX_CAROUSEL);

    if (media.length > 1) {
      const children: string[] = [];
      for (const url of media) {
        const video = isVideoUrl(url, input.mediaType);
        const child = await graph(`/${userId}/threads`, token, {
          method: "POST",
          params: { media_type: video ? "VIDEO" : "IMAGE", [video ? "video_url" : "image_url"]: url, is_carousel_item: "true" },
          schema: createdSchema
        });
        children.push(child.id);
      }
      return finishThreadsCarousel(connection, token, children, input);
    }

    let containerId: string;
    if (media.length === 0) {
      ({ id: containerId } = await graph(`/${userId}/threads`, token, { method: "POST", params: { media_type: "TEXT", text }, schema: createdSchema }));
    } else {
      const video = isVideoUrl(media[0], input.mediaType);
      ({ id: containerId } = await graph(`/${userId}/threads`, token, {
        method: "POST",
        params: { media_type: video ? "VIDEO" : "IMAGE", [video ? "video_url" : "image_url"]: media[0], text: text || undefined },
        schema: createdSchema
      }));
    }
    return finishThreadsContainer(connection, token, containerId, input);
  },

  async resumePublish(connection: ConnectionLike, input: PublishInput, checkpoint: PublishCheckpoint): Promise<PublishOutcome> {
    const token = await freshToken(connection);
    if (checkpoint.step === "threads_container" && typeof checkpoint.containerId === "string") {
      return finishThreadsContainer(connection, token, checkpoint.containerId, input);
    }
    if (checkpoint.step === "threads_carousel" && typeof checkpoint.children === "string") {
      return finishThreadsCarousel(connection, token, checkpoint.children.split(","), input);
    }
    throw new SocialApiError("THREADS", "Reprise de publication inconnue.");
  },

  // Premier commentaire = réponse publiée sous le post.
  async postComment(connection: ConnectionLike, externalPostId: string, comment: string) {
    const token = await freshToken(connection);
    const userId = connection.externalAccountId;
    const container = await graph(`/${userId}/threads`, token, {
      method: "POST",
      params: { media_type: "TEXT", text: comment.trim(), reply_to_id: externalPostId },
      schema: createdSchema
    });
    if (!(await containerReady(container.id, token, 20_000))) {
      throw new SocialApiError("THREADS", "Threads met trop de temps à préparer la réponse.");
    }
    await graph(`/${userId}/threads_publish`, token, { method: "POST", params: { creation_id: container.id } });
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    const token = await freshToken(connection);
    const userId = connection.externalAccountId;
    const since = Math.floor((Date.now() - 28 * 86_400_000) / 1000);
    const until = Math.floor(Date.now() / 1000);
    // Abonnés : valeur totale, demandée à part (pas de fenêtre de dates).
    const followersRes = await graph(`/${userId}/threads_insights`, token, { params: { metric: "followers_count" }, schema: insightsSchema });
    const activity = await graph(`/${userId}/threads_insights`, token, {
      params: { metric: "views,likes,replies,reposts,quotes", since: String(since), until: String(until) },
      schema: insightsSchema
    }).catch(() => ({ data: [] }) as Insights);
    const insights = { data: [...followersRes.data, ...activity.data] };
    const metric = (name: string) => {
      const m = insights.data.find((d) => d.name === name);
      if (!m) return 0;
      if (m.total_value) return m.total_value.value ?? 0;
      return (m.values ?? []).reduce((sum, v) => sum + (v.value ?? 0), 0);
    };
    const threads = await graph(`/${userId}/threads`, token, {
      params: { fields: "id", limit: "50", since: String(since) },
      schema: graphList(z.object({ id: idSchema }))
    }).catch(() => ({ data: [] }));
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

  // Dernières publications, sans statistiques (vérification « déjà en ligne ? », lot 6).
  async listRecentPosts(connection: ConnectionLike): Promise<RecentPost[]> {
    const token = await freshToken(connection);
    // Liste stricte : illisible, elle ne doit jamais passer pour « aucune publication ».
    const list = await graph(`/${connection.externalAccountId}/threads`, token, {
      params: { fields: "id,text,permalink,timestamp", limit: "10" },
      schema: graphList(threadSchema)
    });
    return list.data.map((t) => ({
      externalPostId: t.id,
      text: t.text,
      permalink: t.permalink,
      publishedAt: toDate(t.timestamp)
    }));
  },

  async fetchPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
    const token = await freshToken(connection);
    const list = await graph(`/${connection.externalAccountId}/threads`, token, {
      params: { fields: "id,text,permalink,timestamp,media_type,media_url,thumbnail_url", limit: "25" },
      schema: graphList(threadSchema)
    });
    const out: PostMetricInput[] = [];
    for (const t of list.data) {
      const ins = await graph(`/${t.id}/insights`, token, {
        params: { metric: "views,likes,replies,reposts,quotes" },
        schema: insightsSchema
      }).catch(() => ({ data: [] }) as Insights);
      const v = (name: string) => ins.data.find((d) => d.name === name)?.values?.[0]?.value ?? null;
      const reposts = v("reposts");
      const quotes = v("quotes");
      out.push({
        postExternalId: t.id,
        title: (t.text ?? "").split("\n")[0].slice(0, 120),
        permalink: t.permalink,
        thumbnailUrl: t.media_type === "VIDEO" ? t.thumbnail_url : t.media_url,
        publishedAt: toDate(t.timestamp),
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
    const list = await graph(`/${connection.externalAccountId}/threads`, token, {
      params: { fields: "id,permalink", limit: "10" },
      schema: graphList(z.object({ id: idSchema, permalink: textSchema }))
    });
    const items: EngagementItemInput[] = [];
    for (const t of list.data) {
      const replies = await graph(`/${t.id}/replies`, token, {
        params: { fields: "id,text,username,timestamp,permalink" },
        schema: graphList(replySchema)
      }).catch(() => ({ data: [] as z.output<typeof replySchema>[] }));
      for (const r of replies.data) {
        items.push({
          type: "COMMENT",
          externalId: r.id,
          postExternalId: t.id,
          postPermalink: t.permalink,
          authorName: r.username ? `@${r.username}` : undefined,
          text: r.text,
          permalink: r.permalink,
          publishedAt: toDate(r.timestamp)
        });
      }
    }
    return items;
  }
};
