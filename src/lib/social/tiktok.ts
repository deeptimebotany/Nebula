import type { ZodType, ZodTypeDef } from "zod";
import { prisma } from "@/lib/prisma";
import type { AnalyticsResult } from "@/lib/types";
import {
  SocialApiError,
  checkShape,
  fetchJson,
  throwUnexpected,
  pollUntil,
  waitBudgetMs,
  type ConnectionLike,
  type OAuthTokenResult,
  type PostMetricInput,
  type RecentPost,
  type PublishCheckpoint,
  type PublishInput,
  type PublishOutcome,
  type SocialClient
} from "./base";
import { countSchema, endpointLabel, idSchema, opt, soft, textSchema, toDate, z } from "./contract";
import { adoptConcurrentRefresh } from "./tokens";

// Doc officielle : https://developers.tiktok.com/doc/content-posting-api-get-started
// Le scope video.publish est en accès audité : sans audit TikTok, la
// publication ne fonctionne que vers vos propres comptes de test ajoutés
// dans le portail développeur.
const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const API_BASE = "https://open.tiktokapis.com/v2";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant. Voir developers.tiktok.com et .env.example.`);
  return value;
}

const EXPIRED_MESSAGE = "Connexion TikTok expirée : reconnectez le compte depuis la page Comptes.";

// --- Contrats des réponses (lot 7, voir contract.ts) -------------------------
// Doc : https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
//       https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
//       https://developers.tiktok.com/doc/tiktok-api-v2-video-list
//       https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info
// Réponses types : tests/contracts/fixtures/tiktok.
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: soft(z.number()),
  refresh_token: opt(z.string().min(1)),
  open_id: opt(z.string().min(1)),
  scope: textSchema
});
const videoSchema = z.object({
  id: idSchema,
  title: textSchema,
  video_description: textSchema,
  cover_image_url: textSchema,
  share_url: textSchema,
  create_time: soft(z.number()),
  like_count: countSchema,
  comment_count: countSchema,
  share_count: countSchema,
  view_count: countSchema
});
// Liste de vidéos : « videos » peut manquer pour un compte sans vidéo, mais
// alors TikTok l'annonce (has_more: false). Sinon, la liste est illisible :
// jamais « aucune vidéo » par erreur (une relance ferait un doublon).
const videoListSchema = z
  .object({ videos: opt(z.array(videoSchema)), has_more: soft(z.boolean()), cursor: soft(z.number()) })
  .superRefine((d, ctx) => {
    if (!d.videos && d.has_more !== false) ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: "array", received: "undefined", path: ["videos"] });
  });
const statusSchema = z.object({
  status: z.string(),
  fail_reason: textSchema,
  // Liste d'entiers 64 bits : lus en texte par parseProviderJson, jamais arrondis.
  publicaly_available_post_id: soft(z.array(idSchema))
});

/**
 * Appel à l'API v2 de TikTok. Chaque réponse porte `error.code` : « ok »
 * en cas de succès ; tout autre code est une erreur, même avec un statut
 * HTTP 200. Le contenu utile (`data`) est vérifié par son contrat.
 */
async function tiktokApi<T>(
  url: string,
  token: string,
  data: ZodType<T, ZodTypeDef, unknown>,
  init: { method?: "GET" | "POST"; body?: unknown; readOnly?: boolean } = {}
): Promise<T> {
  const method = init.method ?? "GET";
  const body = await fetchJson("TIKTOK", url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    readOnly: init.readOnly
  });
  const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  if (error && typeof error.code === "string" && error.code !== "ok") {
    throw new SocialApiError("TIKTOK", typeof error.message === "string" && error.message ? error.message : error.code, 400, body, error.code);
  }
  // `data` est vérifié dans son enveloppe pour que le champ fautif soit
  // nommé en entier (« data.videos »…).
  return checkShape("TIKTOK", z.object({ data }), body, endpointLabel(method, url), 200).data as T;
}

/**
 * Point d'accès des jetons (/v2/oauth/token/). Un refus arrive sous la forme
 * { error: "invalid_grant", error_description } — parfois avec un statut 200.
 */
async function tiktokToken(params: Record<string, string>): Promise<z.output<typeof tokenSchema>> {
  const url = `${API_BASE}/oauth/token/`;
  const body = await fetchJson("TIKTOK", url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
    timeoutMs: 20_000
  });
  const refused = (body as { error?: unknown; error_description?: unknown } | undefined) ?? {};
  if (typeof refused.error === "string" && refused.error) {
    const description = typeof refused.error_description === "string" && refused.error_description ? refused.error_description : refused.error;
    throw new SocialApiError("TIKTOK", description, 400, body, refused.error);
  }
  return checkShape("TIKTOK", tokenSchema, body, endpointLabel("POST", url), 200);
}

/**
 * Jeton d'accès valide pour les appels à TikTok (24/09/2026). TikTok ne
 * délivre des jetons d'accès que pour 24 h (jeton de rafraîchissement : 1 an)
 * : sans renouvellement, un compte cessait de fonctionner le lendemain de sa
 * connexion. Renouvelé 10 minutes avant l'échéance et enregistré ; mute
 * `connection`. Refus définitif (invalid_grant) : jeton de rafraîchissement
 * effacé pour que la page Comptes et les notifications demandent de
 * reconnecter.
 */
export async function freshTiktokToken(connection: ConnectionLike): Promise<string> {
  const expires = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  if (expires !== null && expires - Date.now() > 10 * 60_000) return connection.accessToken;
  if (!connection.refreshToken) {
    if (expires === null) return connection.accessToken;
    throw new SocialApiError("TIKTOK", EXPIRED_MESSAGE, 401);
  }
  const usedRefreshToken = connection.refreshToken;
  let json: z.output<typeof tokenSchema>;
  try {
    json = await tiktokToken({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: usedRefreshToken
    });
  } catch (err) {
    if (!(err instanceof SocialApiError)) throw err;
    const code = err.code ?? (err.raw as { error?: unknown } | undefined)?.error;
    if (code === "invalid_grant") {
      // Déjà renouvelé par un autre traitement ? On prend le nouveau jeton.
      if (await adoptConcurrentRefresh(connection, usedRefreshToken)) return connection.accessToken;
      await prisma.socialConnection
        .update({ where: { id: connection.id }, data: { refreshToken: null, tokenExpiresAt: new Date() } })
        .catch(() => undefined);
      connection.refreshToken = null;
      throw new SocialApiError("TIKTOK", EXPIRED_MESSAGE, 401, err.raw, "invalid_grant");
    }
    // Panne, délai dépassé ou réponse illisible : la connexion n'est PAS
    // perdue ; l'erreur garde sa catégorie (voir errors.ts).
    const failure = new SocialApiError("TIKTOK", `TikTok n'a pas pu renouveler la connexion (${err.message.replace(/^\[TIKTOK\] /, "")}). Réessayez dans quelques minutes.`, err.status, err.raw, err.code);
    failure.retryAfterMs = err.retryAfterMs;
    throw failure;
  }
  const tokenExpiresAt = new Date(Date.now() + (json.expires_in ?? 86_400) * 1000);
  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: { accessToken: json.access_token, tokenExpiresAt, ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}) }
  });
  connection.accessToken = json.access_token;
  connection.tokenExpiresAt = tokenExpiresAt;
  if (json.refresh_token) connection.refreshToken = json.refresh_token;
  return json.access_token;
}

/**
 * La publication est asynchrone côté TikTok (téléchargement puis traitement
 * de la vidéo). On attend dans la limite du temps disponible ; au-delà, la
 * cible passe « en traitement » et le cron revient vérifier (lot 2 — avant,
 * au bout de 2 minutes, la publication était déclarée réussie même si
 * TikTok n'avait rien confirmé).
 */
async function finishTiktokPublish(connection: ConnectionLike, publishId: string, input: PublishInput): Promise<PublishOutcome> {
  const done = await pollUntil(
    async () => {
      // Lecture du statut (POST, mais sans effet) : relancée comme une lecture.
      const check = await tiktokApi(`${API_BASE}/post/publish/status/fetch/`, connection.accessToken, statusSchema, {
        method: "POST",
        body: { publish_id: publishId },
        readOnly: true
      });
      if (check.status === "PUBLISH_COMPLETE") return check;
      if (check.status === "FAILED") {
        // fail_reason est un code TikTok (file_format_check_failed…) : il sert au classement.
        throw new SocialApiError("TIKTOK", `TikTok a refusé la vidéo${check.fail_reason ? ` (${check.fail_reason})` : ""}.`, 400, undefined, check.fail_reason);
      }
      return undefined;
    },
    waitBudgetMs(input),
    4000
  );
  if (!done) return { pending: true, checkpoint: { step: "tiktok_status", publishId }, retryInMs: 30_000 };
  // Identifiant de la VIDÉO (celui des statistiques et de l'adresse), et non
  // plus le publish_id. Absent pour une vidéo privée (compte non audité).
  const videoId = done.publicaly_available_post_id?.[0] ?? "";
  return { externalPostId: videoId || publishId, externalUrl: videoId ? `https://www.tiktok.com/video/${videoId}` : undefined };
}

export const tiktokClient: SocialClient = {
  network: "TIKTOK",

  getAuthUrl(state) {
    const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
    const redirectUri = requireEnv("TIKTOK_REDIRECT_URI");
    const url = new URL(AUTH_BASE);
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", "user.info.basic,video.publish,video.list");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCodeForToken(code) {
    const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
    const clientSecret = requireEnv("TIKTOK_CLIENT_SECRET");
    const redirectUri = requireEnv("TIKTOK_REDIRECT_URI");

    const token = await tiktokToken({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    });

    // Champs de l'autorisation user.info.basic seulement : follower_count
    // (demandé ici avant le lot 7, sans être utilisé) exige user.info.stats,
    // qui n'est pas demandée.
    const profile = await tiktokApi(
      `${API_BASE}/user/info/?fields=open_id,display_name,avatar_url`,
      token.access_token,
      z.object({ user: z.object({ open_id: opt(z.string().min(1)), display_name: z.string(), avatar_url: textSchema }) })
    );
    const openId = token.open_id ?? profile.user.open_id;
    if (!openId) throwUnexpected("TIKTOK", "réponse dans un format inattendu (identifiant du compte TikTok « open_id » absent).", 200);

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 86_400) * 1000),
      externalAccountId: openId,
      displayName: profile.user.display_name,
      avatarUrl: profile.user.avatar_url,
      scopes: "user.info.basic,video.publish,video.list"
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishOutcome> {
    if (input.mediaType !== "VIDEO") {
      throw new Error("Ce client ne gère que la publication vidéo (Direct Post). Pour les photos, utilisez /v2/post/publish/content/init/ (photo post).");
    }
    await freshTiktokToken(connection);

    // "PULL_FROM_URL" : TikTok télécharge lui-même la vidéo depuis l'URL fournie
    // (doit être publiquement accessible en HTTPS et le domaine doit être
    // vérifié dans le portail développeur TikTok).
    const init = await tiktokApi(`${API_BASE}/post/publish/video/init/`, connection.accessToken, z.object({ publish_id: z.string().min(1) }), {
      method: "POST",
      body: {
        post_info: {
          title: input.caption,
          privacy_level: "SELF_ONLY", // à ajuster : PUBLIC_TO_EVERYONE si l'app est auditée
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          // Étiquette « Creator labeled as AI-generated » de TikTok.
          ...(input.aiGenerated ? { is_aigc: true } : {})
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: input.mediaUrls[0]
        }
      }
    });

    return finishTiktokPublish(connection, init.publish_id, input);
  },

  async resumePublish(connection: ConnectionLike, input: PublishInput, checkpoint: PublishCheckpoint): Promise<PublishOutcome> {
    if (checkpoint.step === "tiktok_status" && typeof checkpoint.publishId === "string") {
      await freshTiktokToken(connection);
      return finishTiktokPublish(connection, checkpoint.publishId, input);
    }
    throw new SocialApiError("TIKTOK", "Reprise de publication inconnue.");
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    await freshTiktokToken(connection);
    // Statistiques du profil : autorisation user.info.stats (à ajouter à
    // l'application TikTok et à la demande d'autorisation pour en profiter).
    const profile = await tiktokApi(
      `${API_BASE}/user/info/?fields=follower_count,likes_count,video_count`,
      connection.accessToken,
      z.object({ user: z.object({ follower_count: z.number(), likes_count: countSchema, video_count: countSchema }) })
    );

    return {
      followers: profile.user.follower_count,
      followersDelta: 0,
      engagementRate: 0,
      impressions: 0,
      reach: 0,
      postsCount: profile.user.video_count ?? 0
    };
  },

  /**
   * Vues, likes, commentaires et partages des 15 dernières vidéos — endpoint
   * video/list (scope video.list, déjà demandé dans getAuthUrl). TikTok
   * n'expose pas les enregistrements (favoris) : laissés à null.
   * Doc : https://developers.tiktok.com/doc/display-api-get-user-videos
   */
  // Dernières vidéos, sans statistiques (vérification « déjà en ligne ? »,
  // lot 6). Demande l'autorisation video.list ; sans elle, l'appel échoue et
  // la vérification est simplement sautée.
  async listRecentPosts(connection: ConnectionLike): Promise<RecentPost[]> {
    await freshTiktokToken(connection);
    const data = await tiktokApi(`${API_BASE}/video/list/?fields=id,title,video_description,share_url,create_time`, connection.accessToken, videoListSchema, {
      method: "POST",
      body: { max_count: 10 },
      readOnly: true
    });
    return (data.videos ?? []).map((v) => ({
      externalPostId: v.id,
      text: v.video_description || v.title,
      permalink: v.share_url,
      publishedAt: toDate(v.create_time, "s")
    }));
  },

  async fetchPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
    await freshTiktokToken(connection);
    const data = await tiktokApi(
      `${API_BASE}/video/list/?fields=id,title,video_description,cover_image_url,share_url,create_time,like_count,comment_count,share_count,view_count`,
      connection.accessToken,
      videoListSchema,
      { method: "POST", body: { max_count: 15 }, readOnly: true }
    );
    const num = (value: number | undefined): number | null => (typeof value === "number" ? value : null);
    return (data.videos ?? []).map((v) => ({
      postExternalId: v.id,
      title: (v.title || v.video_description || "").slice(0, 120) || undefined,
      permalink: v.share_url,
      thumbnailUrl: v.cover_image_url,
      publishedAt: toDate(v.create_time, "s"),
      views: num(v.view_count),
      likes: num(v.like_count),
      comments: num(v.comment_count),
      shares: num(v.share_count),
      saves: null
    }));
  }

  // Pas de fetchEngagement ici : contrairement à Instagram/Facebook/YouTube,
  // TikTok n'expose pas la lecture des commentaires d'une vidéo via son API
  // publique (Content Posting API) sans un scope "comment" additionnel
  // soumis à audit séparé. La boîte de réception /interactions affiche donc
  // un message clair plutôt qu'une liste vide silencieuse pour ce réseau —
  // voir /api/engagement/sync qui vérifie la présence de cette méthode
  // avant d'appeler.
};
