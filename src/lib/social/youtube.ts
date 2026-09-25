import { prisma } from "@/lib/prisma";
import type { AnalyticsResult, PublishResult, ThumbnailStatus } from "@/lib/types";
import {
  SocialApiError,
  checkShape,
  downloadMedia,
  earliest,
  errorFromResponse,
  fetchJson,
  parseRetryAfter,
  readBody,
  sendRequest,
  throwUnexpected,
  type ConnectionLike,
  type EngagementItemInput,
  type OAuthTokenResult,
  type PublishInput,
  type SocialClient,
  type PostMetricInput, type RecentPost
} from "./base";
import { countSchema, endpointLabel, idSchema, opt, soft, textSchema, toDate, z } from "./contract";
import { adoptConcurrentRefresh } from "./tokens";

// Doc officielle : https://developers.google.com/youtube/v3/guides/uploading_a_video
// Quota par défaut : 10 000 unités/jour, un upload en coûte ~1 600.
const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3/videos";
const THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set";
/** Limite de YouTube pour une miniature personnalisée : 2 Mo, JPEG ou PNG. */
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const ANALYTICS_BASE = "https://youtubeanalytics.googleapis.com/v2";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant. Voir console.cloud.google.com et .env.example.`);
  return value;
}

const EXPIRED_MESSAGE = "Connexion YouTube expirée : reconnectez la chaîne depuis la page Comptes.";
const NO_CHANNEL_MESSAGE = "Ce compte Google n'a pas de chaîne YouTube : créez-la sur youtube.com, puis reconnectez.";

// --- Contrats des réponses (lot 7, voir contract.ts) -------------------------
// Doc : https://developers.google.com/youtube/v3/docs (channels, playlistItems,
//       videos, commentThreads) et https://developers.google.com/youtube/analytics/reference/reports
// Réponses types : tests/contracts/fixtures/youtube.
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: soft(z.number()), refresh_token: opt(z.string().min(1)) });
const thumbnailsSchema = soft(
  z.object({ default: soft(z.object({ url: z.string() })), medium: soft(z.object({ url: z.string() })), high: soft(z.object({ url: z.string() })) })
);
// Liste : `items` est absent quand il n'y a rien (compte Google sans chaîne…).
function ytList<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: opt(z.array(item)), nextPageToken: textSchema });
}
const playlistItemSchema = z.object({
  snippet: z.object({
    title: textSchema,
    publishedAt: textSchema,
    thumbnails: thumbnailsSchema,
    resourceId: z.object({ videoId: opt(z.string().min(1)) })
  }),
  contentDetails: soft(z.object({ videoId: textSchema, videoPublishedAt: textSchema }))
});
const uploadedVideoSchema = z.object({ id: idSchema });
// thumbnails.set : on ne lit rien d'indispensable dans la réponse (succès = 200).
const thumbnailSetSchema = z.object({ items: soft(z.array(z.object({ default: soft(z.object({ url: textSchema })) }))) });

/** Type d'image d'après ses premiers octets (le stockage ne donne pas toujours le bon en-tête). */
function imageMime(bytes: ArrayBuffer): "image/jpeg" | "image/png" | null {
  const b = new Uint8Array(bytes.slice(0, 8));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

/**
 * Applique la miniature choisie dans Publier à une vidéo déjà en ligne
 * (thumbnails.set, 50 unités de quota, autorisée par youtube.upload).
 * Best-effort, comme la playlist : ne lève jamais, la vidéo est déjà
 * publiée. YouTube refuse (403) les miniatures personnalisées des chaînes
 * non vérifiées par téléphone. Jamais relancée automatiquement.
 */
export async function applyYoutubeThumbnail(connection: ConnectionLike, videoId: string, url: string): Promise<ThumbnailStatus> {
  try {
    const image = await downloadMedia("YOUTUBE", url, 15_000);
    const mime = imageMime(image.bytes);
    if (!mime || image.bytes.byteLength > THUMBNAIL_MAX_BYTES) return "UNSUPPORTED";
    await fetchJson("YOUTUBE", `${THUMBNAIL_URL}?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": mime },
      body: Buffer.from(image.bytes),
      timeoutMs: 20_000,
      schema: thumbnailSetSchema
    });
    return "APPLIED";
  } catch (err) {
    if (err instanceof SocialApiError && err.status === 403) return "REFUSED";
    console.error(`[youtube] miniature non appliquée à la vidéo ${videoId} :`, (err as Error).message);
    return "FAILED";
  }
}

/**
 * Jeton d'accès valide pour les appels à YouTube (24/09/2026).
 *
 * Google ne délivre des jetons d'accès que pour 1 heure : sans
 * renouvellement, une chaîne connectée cessait de fonctionner une heure
 * après sa connexion (« Request had invalid authentication credentials »).
 * On le renouvelle ici avec le jeton de rafraîchissement enregistré à la
 * connexion, 5 minutes avant l'échéance, et on enregistre le nouveau.
 * Mute `connection` pour que les appels suivants l'utilisent.
 *
 * Si Google refuse (invalid_grant : accès retiré par l'utilisateur, mot de
 * passe changé, ou application Google encore en mode « Test », dont les
 * autorisations ne durent que 7 jours), la connexion est vraiment à refaire :
 * on efface le jeton de rafraîchissement pour que la page Comptes et les
 * notifications le signalent.
 */
export async function freshYoutubeToken(connection: ConnectionLike): Promise<string> {
  const expires = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  if (expires !== null && expires - Date.now() > 5 * 60_000) return connection.accessToken;
  if (!connection.refreshToken) {
    if (expires === null) return connection.accessToken;
    throw new SocialApiError("YOUTUBE", EXPIRED_MESSAGE, 401);
  }
  const usedRefreshToken = connection.refreshToken;
  // Porte commune (lot 7) : délai garanti et panne classée (sans réponse :
  // TIMEOUT/UNREACHABLE, jamais « connexion expirée »).
  const res = await sendRequest("YOUTUBE", TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("YOUTUBE_CLIENT_ID"),
      client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
      refresh_token: usedRefreshToken,
      grant_type: "refresh_token"
    }),
    cache: "no-store",
    timeoutMs: 20_000,
    readOnly: true
  });
  const body = (await readBody("YOUTUBE", res, "POST", true)).json as { error?: string; error_description?: string } | undefined;
  const refused = res.ok ? null : (body ?? {});
  if (refused) {
    const json = refused;
    if (json.error === "invalid_grant") {
      // Déjà renouvelé par un autre traitement ? On prend le nouveau jeton (lot 2).
      if (await adoptConcurrentRefresh(connection, usedRefreshToken)) return connection.accessToken;
      await prisma.socialConnection
        .update({ where: { id: connection.id }, data: { refreshToken: null, tokenExpiresAt: new Date() } })
        .catch(() => undefined);
      connection.refreshToken = null;
      throw new SocialApiError("YOUTUBE", EXPIRED_MESSAGE, 401, json);
    }
    const failure = new SocialApiError(
      "YOUTUBE",
      `Google n'a pas pu renouveler la connexion YouTube (${json.error_description || json.error || res.status}). Réessayez dans quelques minutes.`,
      res.status,
      json
    );
    failure.retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
    throw failure;
  }
  const json = checkShape("YOUTUBE", tokenSchema, body, endpointLabel("POST", TOKEN_URL), res.status);
  const tokenExpiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: { accessToken: json.access_token, tokenExpiresAt, ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}) }
  });
  connection.accessToken = json.access_token;
  connection.tokenExpiresAt = tokenExpiresAt;
  if (json.refresh_token) connection.refreshToken = json.refresh_token;
  return json.access_token;
}

export const youtubeClient: SocialClient = {
  network: "YOUTUBE",

  getAuthUrl(state) {
    const clientId = requireEnv("YOUTUBE_CLIENT_ID");
    const redirectUri = requireEnv("YOUTUBE_REDIRECT_URI");
    const url = new URL(AUTH_BASE);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    // Langue des écrans Google (compte, consentement, « appli non validée ») :
    // GOOGLE_OAUTH_LANG=en les force en anglais, comme l'exige la vidéo de
    // l'audit de vérification Google. Sans variable : langue du navigateur.
    if (process.env.GOOGLE_OAUTH_LANG) url.searchParams.set("hl", process.env.GOOGLE_OAUTH_LANG);
    url.searchParams.set(
      "scope",
      [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/yt-analytics.readonly"
      ].join(" ")
    );
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCodeForToken(code) {
    const clientId = requireEnv("YOUTUBE_CLIENT_ID");
    const clientSecret = requireEnv("YOUTUBE_CLIENT_SECRET");
    const redirectUri = requireEnv("YOUTUBE_REDIRECT_URI");

    const token = await fetchJson("YOUTUBE", TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      }),
      schema: tokenSchema
    });

    const channel = await fetchJson("YOUTUBE", `${API_BASE}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      schema: ytList(z.object({ id: idSchema, snippet: z.object({ title: z.string(), thumbnails: thumbnailsSchema }) }))
    });
    // Compte Google sans chaîne : YouTube renvoie une liste vide (avant : plantage).
    const me = channel.items?.[0];
    if (!me) throw new SocialApiError("YOUTUBE", NO_CHANNEL_MESSAGE, 403);

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
      externalAccountId: me.id,
      displayName: me.snippet.title,
      avatarUrl: me.snippet.thumbnails?.default?.url,
      scopes: "youtube.upload,youtube.readonly"
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishResult> {
    if (input.mediaType !== "VIDEO") {
      throw new Error("YouTube ne publie que des vidéos.");
    }
    await freshYoutubeToken(connection);

    // On récupère le fichier depuis son URL publique (ex : /public/uploads/xxx.mp4
    // servi par Next.js, ou une URL S3 en production) puis on l'upload en
    // "resumable" (recommandé par Google pour les fichiers volumineux).
    const source = await downloadMedia("YOUTUBE", input.mediaUrls[0], 45_000);
    const videoBuffer = Buffer.from(source.bytes);

    const title = (input.title || input.caption).slice(0, 100) || "Nouvelle vidéo";
    // Réglages "Préréglages YouTube" du composer (voir composer-types.ts →
    // YoutubeOptions) — tous optionnels, valeurs par défaut sûres sinon :
    // public, pas destiné aux enfants, abonnés notifiés.
    const yt = input.youtube ?? {};
    const notifySubscribers = yt.notifySubscribers ?? true;
    // Lieu : coordonnées du lieu choisi (recordingDetails.location), quand
    // la recherche de lieux les a fournies.
    const loc = input.location;
    const hasCoords = typeof loc?.latitude === "number" && typeof loc?.longitude === "number";
    // Ouverture de la session d'envoi : rien n'est encore publié.
    const initUrl = `${UPLOAD_BASE}?uploadType=resumable&part=snippet,status${hasCoords ? ",recordingDetails" : ""}&notifySubscribers=${notifySubscribers}`;
    const initRes = await sendRequest(
      "YOUTUBE",
      initUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/*"
        },
        body: JSON.stringify({
          snippet: {
            title,
            description: input.caption,
            ...(yt.categoryId ? { categoryId: yt.categoryId } : {}),
            ...(yt.tags && yt.tags.length ? { tags: yt.tags } : {})
          },
          // selfDeclaredMadeForKids : déclaration légale (COPPA) obligatoire
          // sur chaque vidéo. Sans elle, YouTube laisse parfois la vidéo en
          // "Brouillon" en attendant que la chaîne la renseigne manuellement
          // dans Studio, même avec privacyStatus "public" — constaté en
          // production. "false" par défaut : contenu créateur/pro standard,
          // pas destiné aux enfants.
          status: {
            privacyStatus: yt.privacyStatus ?? "public",
            selfDeclaredMadeForKids: yt.madeForKids ?? false,
            // Déclaration « contenu modifié ou synthétique » (IA réaliste).
            ...(input.aiGenerated ? { containsSyntheticMedia: true } : {})
          },
          ...(hasCoords ? { recordingDetails: { location: { latitude: loc!.latitude, longitude: loc!.longitude } } } : {})
        })
      }
    );
    if (!initRes.ok) {
      const { text, json } = await readBody("YOUTUBE", initRes, "POST");
      throw errorFromResponse("YOUTUBE", initRes, text, json);
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throwUnexpected("YOUTUBE", `réponse dans un format inattendu (${endpointLabel("POST", initUrl)} : en-tête « Location » absent).`, initRes.status);

    // Envoi du fichier : c'est lui qui crée la vidéo. Sans réponse (délai
    // dépassé), elle est peut-être en ligne : vérification, jamais renvoyée.
    const uploadRes = await sendRequest("YOUTUBE", uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/*", "Content-Length": String(videoBuffer.byteLength) },
      body: videoBuffer,
      timeoutMs: 50_000
    });
    const uploaded = await readBody("YOUTUBE", uploadRes, "PUT");
    if (!uploadRes.ok) throw errorFromResponse("YOUTUBE", uploadRes, uploaded.text, uploaded.json);
    const video = checkShape("YOUTUBE", uploadedVideoSchema, uploaded.json, endpointLabel("PUT", UPLOAD_BASE), uploadRes.status);

    // Playlist : appel séparé (playlistItems.insert), best-effort — un échec
    // ici (playlist supprimée entre-temps, id invalide, etc.) ne doit pas
    // faire échouer la publication elle-même, la vidéo est déjà en ligne.
    if (yt.playlistId) {
      try {
        await fetchJson("YOUTUBE", `${API_BASE}/playlistItems?part=snippet`, {
          method: "POST",
          headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            snippet: { playlistId: yt.playlistId, resourceId: { kind: "youtube#video", videoId: video.id } }
          })
        });
      } catch (err) {
        console.error(`[youtube] ajout à la playlist ${yt.playlistId} échoué pour la vidéo ${video.id} :`, err);
      }
    }

    // Miniature choisie dans Publier (Réussites, lot B) : best-effort aussi.
    const thumbnail = input.thumbnailUrl ? await applyYoutubeThumbnail(connection, video.id, input.thumbnailUrl) : undefined;

    return { externalPostId: video.id, externalUrl: `https://youtube.com/watch?v=${video.id}`, ...(thumbnail ? { thumbnail } : {}) };
  },

  /**
   * Commentaires reçus sur les vidéos de la chaîne.
   *
   * Avant : un seul appel via allThreadsRelatedToChannelId (balaie toute la
   * chaîne d'un coup). Ce paramètre est en réalité réservé par YouTube à un
   * usage "content owner/partner" — un compte YouTube classique (comme celui
   * de Lucas) se fait systématiquement rejeter avec "Request had
   * insufficient authentication scopes", même avec youtube.readonly déjà
   * accordé (constaté en prod, capture d'écran à l'appui). Ajouter le scope
   * youtube.force-ssl aurait réglé le symptôme mais aurait obligé à relancer
   * toute la procédure de vérification Google (nouveau scope = nouvel écran
   * de consentement à re-filmer).
   *
   * Maintenant : on liste les vidéos récentes de la chaîne (fetchRecentVideos,
   * scope youtube.readonly déjà demandé) puis on interroge les commentaires
   * vidéo par vidéo (part=snippet&videoId=...), ce qui ne nécessite aucun
   * scope supplémentaire. Une vidéo dont les commentaires sont désactivés
   * renvoie une erreur : on l'ignore et on continue avec les autres plutôt
   * que de faire échouer tout le rafraîchissement.
   */
  async fetchEngagement(connection: ConnectionLike): Promise<EngagementItemInput[]> {
    await freshYoutubeToken(connection);
    const videos = await fetchRecentVideos(connection, 15);

    const perVideo = await Promise.all(
      videos.map(async (video) => {
        try {
          // part=replies (même coût de quota) : les réponses du fil, pour
          // repérer celles de la chaîne elle-même (Réussites, lot B).
          const threads = await fetchJson("YOUTUBE", `${API_BASE}/commentThreads?part=snippet,replies&videoId=${video.videoId}&maxResults=25&order=time`, {
            headers: { Authorization: `Bearer ${connection.accessToken}` },
            schema: ytList(
              z.object({
                id: idSchema,
                snippet: z.object({
                  videoId: textSchema,
                  topLevelComment: z.object({
                    id: idSchema,
                    snippet: z.object({ textDisplay: textSchema, authorDisplayName: textSchema, authorProfileImageUrl: textSchema, publishedAt: textSchema })
                  })
                }),
                replies: soft(
                  z.object({
                    comments: soft(
                      z.array(z.object({ snippet: soft(z.object({ authorChannelId: soft(z.object({ value: textSchema })), publishedAt: textSchema })) }))
                    )
                  })
                )
              })
            )
          });
          return threads.items ?? [];
        } catch (err) {
          // Commentaires désactivés sur cette vidéo, ou vidéo trop récente :
          // non bloquant, on passe simplement à la suivante.
          console.error(`[youtube] commentaires indisponibles pour la vidéo ${video.videoId} :`, err);
          return [];
        }
      })
    );

    const items = perVideo.flat().map((item) => {
      const c = item.snippet.topLevelComment.snippet;
      const videoId = item.snippet.videoId ?? "";
      const own = (item.replies?.comments ?? []).filter((r) => r.snippet?.authorChannelId?.value === connection.externalAccountId);
      return {
        type: "COMMENT" as const,
        ownerRepliedAt: earliest(own.map((r) => toDate(r.snippet?.publishedAt) ?? new Date())),
        externalId: item.snippet.topLevelComment.id,
        postExternalId: videoId,
        postPermalink: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
        authorName: c.authorDisplayName,
        authorAvatarUrl: c.authorProfileImageUrl,
        text: c.textDisplay,
        permalink: videoId ? `https://www.youtube.com/watch?v=${videoId}&lc=${item.snippet.topLevelComment.id}` : undefined,
        publishedAt: toDate(c.publishedAt)
      };
    });

    // Les plus récents en premier, toutes vidéos confondues.
    return items.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)).slice(0, 25);
  },

  /**
   * Vues / likes / commentaires des 15 dernières vidéos (videos.list
   * part=statistics, scope youtube.readonly déjà demandé). YouTube n'expose
   * ni les partages ni les enregistrements via l'API Data : laissés à null.
   */
  // Dernières vidéos mises en ligne (vérification « déjà en ligne ? », lot 6) :
  // liste « uploads » de la chaîne — 2 unités de quota, contre 100 pour une
  // recherche — y compris les vidéos privées ou programmées.
  async listRecentPosts(connection: ConnectionLike): Promise<RecentPost[]> {
    // Liste stricte (lot 7) : une chaîne ou une liste illisible est une
    // erreur, jamais « aucune vidéo » (une relance ferait un doublon).
    const videos = await fetchRecentVideos(connection, 10);
    return videos.map((v) => ({
      externalPostId: v.videoId,
      text: v.title,
      permalink: `https://www.youtube.com/watch?v=${v.videoId}`,
      publishedAt: toDate(v.publishedAt)
    }));
  },

  async fetchPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
    await freshYoutubeToken(connection);
    const videos = await fetchRecentVideos(connection, 15);
    if (videos.length === 0) return [];
    const ids = videos.map((v) => v.videoId).join(",");
    const data = await fetchJson("YOUTUBE", `${API_BASE}/videos?part=statistics&id=${ids}&maxResults=50`, {
      headers: { Authorization: `Bearer ${connection.accessToken}` },
      // Compteurs en texte chez YouTube (« "1234" »), absents quand la chaîne
      // les masque (mentions J'aime désactivées…) : affichés « — ».
      schema: ytList(z.object({ id: idSchema, statistics: soft(z.object({ viewCount: countSchema, likeCount: countSchema, commentCount: countSchema })) }))
    });
    const statsById = new Map((data.items ?? []).map((item) => [item.id, item.statistics ?? {}]));
    return videos.map((v) => {
      const st: { viewCount?: number; likeCount?: number; commentCount?: number } = statsById.get(v.videoId) ?? {};
      return {
        postExternalId: v.videoId,
        title: v.title,
        permalink: `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnailUrl: v.thumbnailUrl,
        publishedAt: toDate(v.publishedAt),
        views: st.viewCount ?? null,
        likes: st.likeCount ?? null,
        comments: st.commentCount ?? null,
        shares: null,
        saves: null
      };
    });
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    await freshYoutubeToken(connection);
    const channel = await fetchJson("YOUTUBE", `${API_BASE}/channels?part=statistics&mine=true`, {
      headers: { Authorization: `Bearer ${connection.accessToken}` },
      schema: ytList(
        z.object({
          statistics: z.object({ subscriberCount: countSchema, hiddenSubscriberCount: soft(z.boolean()), viewCount: countSchema, videoCount: countSchema })
        })
      )
    });
    const stats = channel.items?.[0]?.statistics;
    if (!stats) throw new SocialApiError("YOUTUBE", NO_CHANNEL_MESSAGE, 403);

    return {
      followers: stats.subscriberCount ?? 0,
      followersDelta: 0,
      engagementRate: 0,
      impressions: stats.viewCount ?? 0,
      reach: 0,
      postsCount: stats.videoCount ?? 0
    };
  }
};

/**
 * Récupère la VRAIE courbe de rétention d'audience d'une vidéo via YouTube
 * Analytics API (dimension elapsedVideoTimeRatio, métrique audienceWatchRatio)
 * — c'est la même donnée que celle affichée dans YouTube Studio. Nécessite
 * le scope yt-analytics.readonly (ajouté ci-dessus) et que la vidéo ait été
 * publiée depuis assez longtemps pour avoir des données (généralement
 * quelques heures).
 * Doc : https://developers.google.com/youtube/analytics/reference/reports
 */
export async function fetchRetention(
  connection: ConnectionLike,
  videoId: string
): Promise<{ timeRatio: number; watchRatio: number }[]> {
  await freshYoutubeToken(connection);
  const endDate = new Date().toISOString().slice(0, 10);
  // Fenêtre volontairement très large plutôt que "les N derniers jours" :
  // pour une vidéo qui a quelques années, l'essentiel de ses vues (donc de
  // ses données de rétention) date souvent de sa sortie, pas des derniers
  // mois. Une fenêtre trop courte (ex. 400 jours) renvoyait alors "aucune
  // donnée" alors que YouTube Analytics EN A, juste hors de la période
  // demandée — constaté en production sur une vidéo de 2 ans. 2005-02-14 :
  // date de création de YouTube, donc couvre TOUJOURS toute la vie de la
  // chaîne, quelle que soit l'ancienneté de la vidéo.
  const startDate = "2005-02-14";

  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "audienceWatchRatio",
    dimensions: "elapsedVideoTimeRatio",
    filters: `video==${videoId}`
  });

  const data = await fetchJson("YOUTUBE", `${ANALYTICS_BASE}/reports?${params.toString()}`, {
    headers: { Authorization: `Bearer ${connection.accessToken}` },
    // rows absent : pas encore de données pour cette vidéo.
    schema: z.object({ rows: opt(z.array(z.tuple([z.number(), z.number()]).rest(z.unknown()))) })
  });

  if (!data.rows?.length) {
    throw new Error(
      "Aucune donnée de rétention disponible pour cette vidéo (trop récente, ou vues insuffisantes pour YouTube Analytics)."
    );
  }

  return data.rows.map((row) => ({ timeRatio: row[0], watchRatio: row[1] }));
}

export interface YoutubeVideoSummary {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
}

/**
 * Liste les vidéos les plus récentes de la chaîne connectée (scope
 * youtube.readonly, déjà demandé — voir getAuthUrl ci-dessus) : sélecteur
 * de l'outil de rétention (/retention), commentaires, statistiques par
 * vidéo et vérification « déjà en ligne ? ». N'importe quelle vidéo de la
 * chaîne, publiée ou non via Nebula (y compris privée ou programmée).
 *
 * Lot 7 : liste « uploads » de la chaîne (channels + playlistItems, 2 unités
 * de quota) au lieu d'une recherche (search.list : 100 unités, et limitée à
 * 100 appels par jour depuis juin 2026). La synchro des commentaires et des
 * statistiques en faisait une à chaque passage.
 */
export async function fetchRecentVideos(connection: ConnectionLike, maxResults = 12): Promise<YoutubeVideoSummary[]> {
  await freshYoutubeToken(connection);
  const headers = { Authorization: `Bearer ${connection.accessToken}` };
  const channel = await fetchJson("YOUTUBE", `${API_BASE}/channels?part=contentDetails&mine=true`, {
    headers,
    schema: ytList(z.object({ contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().min(1) }) }) }))
  });
  const uploads = channel.items?.[0]?.contentDetails.relatedPlaylists.uploads;
  if (!uploads) throw new SocialApiError("YOUTUBE", NO_CHANNEL_MESSAGE, 403);
  const data = await fetchJson(
    "YOUTUBE",
    `${API_BASE}/playlistItems?part=snippet,contentDetails&maxResults=${Math.min(Math.max(maxResults, 1), 50)}&playlistId=${encodeURIComponent(uploads)}`,
    { headers, schema: z.object({ items: z.array(playlistItemSchema) }) }
  );

  return data.items
    .map((item) => {
      const videoId = item.snippet.resourceId.videoId ?? item.contentDetails?.videoId;
      if (!videoId) return null;
      const thumbs = item.snippet.thumbnails;
      return {
        videoId,
        title: item.snippet.title ?? "",
        thumbnailUrl: thumbs?.medium?.url ?? thumbs?.default?.url ?? thumbs?.high?.url ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        // Date de mise en ligne de la vidéo (celle de l'ajout à la liste sinon).
        publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet.publishedAt ?? ""
      };
    })
    .filter((v): v is YoutubeVideoSummary => v !== null);
}

export interface YoutubeVideoMetadata {
  title: string;
  description: string;
  thumbnailUrl: string;
}

/** Métadonnées publiques d'une vidéo précise (titre, description, miniature). */
export async function fetchVideoMetadata(connection: ConnectionLike, videoId: string): Promise<YoutubeVideoMetadata> {
  await freshYoutubeToken(connection);
  const data = await fetchJson("YOUTUBE", `${API_BASE}/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${connection.accessToken}` },
    schema: ytList(z.object({ snippet: z.object({ title: z.string(), description: z.string().default(""), thumbnails: thumbnailsSchema }) }))
  });

  const item = data.items?.[0];
  if (!item) throw new Error("Vidéo introuvable sur cette chaîne YouTube.");

  const thumbs = item.snippet.thumbnails;
  return {
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnailUrl: thumbs?.medium?.url ?? thumbs?.default?.url ?? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`
  };
}
