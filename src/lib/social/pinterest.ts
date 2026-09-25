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
import type { ZodType, ZodTypeDef } from "zod";
import { prisma } from "@/lib/prisma";
import type { AnalyticsResult } from "@/lib/types";
import { oauthRedirectUri } from "@/lib/network-availability";
import {
  SocialApiError,
  downloadMedia,
  errorFromResponse,
  fetchJson,
  readBody,
  sendRequest,
  pollUntil,
  waitBudgetMs,
  type PublishCheckpoint,
  type PublishOutcome,
  type ConnectionLike,
  type OAuthTokenResult,
  type PostMetricInput,
  type PublishInput,
  type RecentPost,
  type SocialClient
} from "./base";
import { countSchema, idSchema, opt, soft, textSchema, toDate, z } from "./contract";
import { adoptConcurrentRefresh } from "./tokens";

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

// --- Contrats des réponses (lot 7, voir contract.ts) -------------------------
// Doc : https://developers.pinterest.com/docs/api/v5/ (oauth-token, boards-list,
//       media-create, media-get, pins-create, pins-list, user_account-get)
// Réponses types : tests/contracts/fixtures/pinterest.
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: opt(z.string().min(1)), expires_in: z.number(), scope: textSchema });
type TokenResponse = z.output<typeof tokenSchema>;
const boardsSchema = z.object({ items: z.array(z.object({ id: idSchema, name: z.string(), privacy: textSchema })), bookmark: soft(z.string()) });
const pinSchema = z.object({
  id: idSchema,
  title: textSchema,
  description: textSchema,
  link: textSchema,
  created_at: textSchema,
  media: soft(z.object({ images: soft(z.record(z.object({ url: z.string() }).passthrough())) }).passthrough())
});
const metricsSchema = soft(z.record(countSchema));
const userAccountSchema = z.object({
  username: z.string().min(1),
  id: opt(idSchema),
  profile_image: textSchema,
  business_name: textSchema,
  follower_count: countSchema,
  pin_count: countSchema,
  monthly_views: countSchema
});

async function api<T = unknown>(
  path: string,
  token: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown; query?: Record<string, string>; schema?: ZodType<T, ZodTypeDef, unknown> } = {}
): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  return fetchJson("PINTEREST", url.toString(), {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    schema: init.schema
  });
}

/** Jeton valide : rafraîchi (et enregistré) s'il expire dans moins de 3 jours. */
async function freshToken(connection: ConnectionLike): Promise<string> {
  const expires = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  if (expires === null || expires - Date.now() > 3 * 86_400_000) return connection.accessToken;
  if (!connection.refreshToken) throw new SocialApiError("PINTEREST", "Connexion Pinterest expirée : reconnectez le compte.", 401);
  const usedRefreshToken = connection.refreshToken;
  let token: TokenResponse;
  try {
    token = await fetchJson("PINTEREST", `${API}/oauth/token`, {
      method: "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: usedRefreshToken }),
      schema: tokenSchema
    });
  } catch (err) {
    // Lot 2 : seul un REFUS de Pinterest (400/401) signifie une connexion à
    // refaire ; une panne passagère (5xx, délai dépassé) ne doit plus faire
    // croire à l'utilisateur que son compte est déconnecté.
    const status = err instanceof SocialApiError ? err.status : undefined;
    if (status === 400 || status === 401) {
      if (await adoptConcurrentRefresh(connection, usedRefreshToken)) return connection.accessToken;
      throw new SocialApiError("PINTEREST", "Connexion Pinterest expirée : reconnectez le compte.", 401);
    }
    // Garde la catégorie d'origine (délai dépassé, réponse inattendue…).
    throw new SocialApiError(
      "PINTEREST",
      "Pinterest n'a pas pu renouveler la connexion pour le moment : réessayez dans quelques minutes.",
      status ?? 503,
      err instanceof SocialApiError ? err.raw : undefined,
      err instanceof SocialApiError ? err.code : undefined
    );
  }
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
    const res = await api("/boards", token, {
      query: { page_size: "100", ...(bookmark ? { bookmark } : {}) },
      schema: boardsSchema
    });
    boards.push(...res.items.map((b) => ({ id: b.id, name: b.name, privacy: b.privacy })));
    if (!res.bookmark) break;
    bookmark = res.bookmark;
  }
  return boards;
}

/** Envoie une vidéo sur Pinterest (URL publique → upload) ; renvoie l'identifiant du média. */
async function uploadVideo(token: string, videoUrl: string): Promise<string> {
  const registered = await api("/media", token, {
    method: "POST",
    body: { media_type: "video" },
    schema: z.object({ media_id: idSchema, upload_url: z.string().url(), upload_parameters: z.record(z.string()) })
  });
  const video = await downloadMedia("PINTEREST", videoUrl);
  const form = new FormData();
  for (const [k, v] of Object.entries(registered.upload_parameters)) form.append(k, v);
  form.append("file", new Blob([video.bytes], { type: video.type.startsWith("video/") ? video.type : "video/mp4" }));
  // Envoi vers le stockage de Pinterest (rien n'est encore publié) : délai garanti.
  const upload = await sendRequest("PINTEREST", registered.upload_url, { method: "POST", body: form, timeoutMs: 50_000 });
  if (!upload.ok) {
    const { text, json } = await readBody("PINTEREST", upload, "POST");
    throw errorFromResponse("PINTEREST", upload, text, json);
  }
  return registered.media_id;
}

/**
 * Attend (dans la limite du temps disponible) que Pinterest ait traité la
 * vidéo, puis crée l'épingle. Sinon : point de reprise pour le cron (lot 2 —
 * avant, l'attente pouvait durer 5 minutes, bien plus que ce que Vercel
 * laisse à une requête).
 */
async function finishPinterestVideo(token: string, mediaId: string, boardId: string, input: PublishInput): Promise<PublishOutcome> {
  const ready = await pollUntil(
    async () => {
      const status = await api(`/media/${mediaId}`, token, { schema: z.object({ status: z.string() }) });
      if (status.status === "succeeded") return true;
      if (status.status === "failed") throw new SocialApiError("PINTEREST", "Pinterest n'a pas pu traiter la vidéo.", 400);
      return undefined;
    },
    waitBudgetMs(input),
    4000
  );
  if (!ready) return { pending: true, checkpoint: { step: "pinterest_video", mediaId, boardId }, retryInMs: 30_000 };
  // Image de couverture : la première image jointe s'il y en a une.
  const cover = input.mediaUrls.find((u) => !isVideoUrl(u, "IMAGE"));
  return createPin(token, boardId, input, { source_type: "video_id", media_id: mediaId, ...(cover ? { cover_image_url: cover } : { cover_image_key_frame_time: 1 }) });
}

function pinText(input: PublishInput): { title: string; description: string; link?: string } {
  const description = input.caption.trim();
  if (Array.from(description).length > 500) {
    throw new SocialApiError("PINTEREST", "Description trop longue pour Pinterest (500 caractères maximum) : utilisez « Personnaliser pour Pinterest » dans Publier.");
  }
  const title = (input.title || description.split("\n")[0] || "").trim().slice(0, 100);
  return { title, description, link: input.pinterest?.link?.trim() || undefined };
}

async function createPin(token: string, boardId: string, input: PublishInput, mediaSource: Record<string, unknown>) {
  const { title, description, link } = pinText(input);
  const pin = await api("/pins", token, {
    method: "POST",
    schema: z.object({ id: idSchema }),
    body: {
      board_id: boardId,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(link ? { link } : {}),
      media_source: mediaSource
    }
  });
  return { externalPostId: pin.id, externalUrl: `https://www.pinterest.com/pin/${pin.id}/` };
}

function isVideoUrl(url: string, fallback: "VIDEO" | "IMAGE"): boolean {
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)) return true;
  if (/\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(url)) return false;
  return fallback === "VIDEO";
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
    const token = await fetchJson("PINTEREST", `${API}/oauth/token`, {
      method: "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),
      schema: tokenSchema
    });
    const me = await api("/user_account", token.access_token, { schema: userAccountSchema });
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

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishOutcome> {
    const token = await freshToken(connection);
    if (input.mediaUrls.length === 0) {
      throw new SocialApiError("PINTEREST", "Une épingle a besoin d'une image ou d'une vidéo : ajoutez un média dans Publier.");
    }
    const { title, description } = pinText(input);
    let boardId = input.pinterest?.boardId;
    if (!boardId) {
      const boards = await listPinterestBoards(connection);
      if (boards.length === 0) {
        throw new SocialApiError("PINTEREST", "Aucun tableau sur ce compte Pinterest : créez-en un sur Pinterest, puis réessayez.");
      }
      boardId = boards[0].id;
    }

    const first = input.mediaUrls[0];
    if (isVideoUrl(first, input.mediaType)) {
      const mediaId = await uploadVideo(token, first);
      return finishPinterestVideo(token, mediaId, boardId, input);
    }
    let mediaSource: Record<string, unknown>;
    if (input.mediaUrls.length > 1) {
      const images = input.mediaUrls.filter((u) => !isVideoUrl(u, "IMAGE")).slice(0, 5);
      mediaSource =
        images.length > 1
          ? { source_type: "multiple_image_urls", items: images.map((url) => ({ url, ...(title ? { title } : {}), ...(description ? { description: description.slice(0, 500) } : {}) })) }
          : { source_type: "image_url", url: images[0] ?? first };
    } else {
      mediaSource = { source_type: "image_url", url: first };
    }
    return createPin(token, boardId, input, mediaSource);
  },

  async resumePublish(connection: ConnectionLike, input: PublishInput, checkpoint: PublishCheckpoint): Promise<PublishOutcome> {
    if (checkpoint.step === "pinterest_video" && typeof checkpoint.mediaId === "string" && typeof checkpoint.boardId === "string") {
      const token = await freshToken(connection);
      return finishPinterestVideo(token, checkpoint.mediaId, checkpoint.boardId, input);
    }
    throw new SocialApiError("PINTEREST", "Reprise de publication inconnue.");
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    const token = await freshToken(connection);
    const me = await api("/user_account", token, { schema: userAccountSchema });
    const end = new Date();
    const start = new Date(Date.now() - 29 * 86_400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    let impressions = me.monthly_views ?? 0;
    let engagement = 0;
    try {
      // Statistiques du compte (comptes professionnels) sur 30 jours.
      const stats = await api("/user_account/analytics", token, {
        query: { start_date: day(start), end_date: day(end), metric_types: "IMPRESSION,ENGAGEMENT,SAVE,PIN_CLICK,OUTBOUND_CLICK" },
        schema: z.object({ all: soft(z.object({ summary_metrics: metricsSchema })) })
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

  /**
   * Dernières épingles, sans statistiques (vérification « déjà en ligne ? »,
   * lot 7 — règle 20 : tout client réseau l'implémente). Autorisation
   * pins:read, déjà demandée. Le texte comparé est la description, qui
   * reprend la légende publiée par Nebula.
   */
  async listRecentPosts(connection: ConnectionLike): Promise<RecentPost[]> {
    const token = await freshToken(connection);
    const pins = await api("/pins", token, { query: { page_size: "10" }, schema: z.object({ items: z.array(pinSchema), bookmark: soft(z.string()) }) });
    return pins.items.map((p) => ({
      externalPostId: p.id,
      text: p.description || p.title,
      permalink: `https://www.pinterest.com/pin/${p.id}/`,
      publishedAt: toDate(p.created_at)
    }));
  },

  async fetchPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
    const token = await freshToken(connection);
    const pins = await api("/pins", token, { query: { page_size: "25" }, schema: z.object({ items: z.array(pinSchema), bookmark: soft(z.string()) }) });
    const end = new Date();
    const start = new Date(Date.now() - 89 * 86_400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const out: PostMetricInput[] = [];
    for (const p of pins.items) {
      let impressions: number | null = null;
      let saves: number | null = null;
      let comments: number | null = null;
      try {
        const a = await api(`/pins/${p.id}/analytics`, token, {
          query: { start_date: day(start), end_date: day(end), metric_types: "IMPRESSION,SAVE,TOTAL_COMMENTS" },
          schema: z.object({ all: soft(z.object({ lifetime_metrics: metricsSchema, summary_metrics: metricsSchema })) })
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
        // Date sans fuseau chez Pinterest : lue en UTC (voir toDate).
        publishedAt: toDate(p.created_at),
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
