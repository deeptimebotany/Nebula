import type { AnalyticsResult, PublishResult } from "@/lib/types";
import {
  fetchJson,
  type ConnectionLike,
  type EngagementItemInput,
  type OAuthTokenResult,
  type PublishInput,
  type SocialClient,
  type PostMetricInput
} from "./base";

// Doc officielle : https://developers.google.com/youtube/v3/guides/uploading_a_video
// Quota par défaut : 10 000 unités/jour, un upload en coûte ~1 600.
const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3/videos";
const ANALYTICS_BASE = "https://youtubeanalytics.googleapis.com/v2";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant. Voir console.cloud.google.com et .env.example.`);
  return value;
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

    const token = await fetchJson<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>("YOUTUBE", TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    const channel = await fetchJson<{
      items: { id: string; snippet: { title: string; thumbnails: { default: { url: string } } } }[];
    }>("YOUTUBE", `${API_BASE}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    const me = channel.items[0];

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      externalAccountId: me.id,
      displayName: me.snippet.title,
      avatarUrl: me.snippet.thumbnails.default.url,
      scopes: "youtube.upload,youtube.readonly"
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishResult> {
    if (input.mediaType !== "VIDEO") {
      throw new Error("YouTube ne publie que des vidéos.");
    }

    // On récupère le fichier depuis son URL publique (ex : /public/uploads/xxx.mp4
    // servi par Next.js, ou une URL S3 en production) puis on l'upload en
    // "resumable" (recommandé par Google pour les fichiers volumineux).
    const sourceRes = await fetch(input.mediaUrls[0]);
    if (!sourceRes.ok || !sourceRes.body) {
      throw new Error("Impossible de lire le fichier vidéo source pour l'upload YouTube.");
    }
    const videoBuffer = Buffer.from(await sourceRes.arrayBuffer());

    const title = (input.title || input.caption).slice(0, 100) || "Nouvelle vidéo";
    // Réglages "Préréglages YouTube" du composer (voir composer-types.ts →
    // YoutubeOptions) — tous optionnels, valeurs par défaut sûres sinon :
    // public, pas destiné aux enfants, abonnés notifiés.
    const yt = input.youtube ?? {};
    const notifySubscribers = yt.notifySubscribers ?? true;
    const initRes = await fetch(
      `${UPLOAD_BASE}?uploadType=resumable&part=snippet,status&notifySubscribers=${notifySubscribers}`,
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
            selfDeclaredMadeForKids: yt.madeForKids ?? false
          }
        })
      }
    );
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube n'a pas renvoyé d'URL d'upload resumable.");

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/*", "Content-Length": String(videoBuffer.byteLength) },
      body: videoBuffer
    });
    const video = (await uploadRes.json()) as { id: string };
    if (!uploadRes.ok) throw new Error("Échec de l'upload vidéo vers YouTube.");

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

    return { externalPostId: video.id, externalUrl: `https://youtube.com/watch?v=${video.id}` };
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
    const videos = await fetchRecentVideos(connection, 15);

    const perVideo = await Promise.all(
      videos.map(async (video) => {
        try {
          const threads = await fetchJson<{
            items: {
              id: string;
              snippet: {
                videoId: string;
                topLevelComment: {
                  id: string;
                  snippet: {
                    textDisplay: string;
                    authorDisplayName: string;
                    authorProfileImageUrl: string;
                    publishedAt: string;
                  };
                };
              };
            }[];
          }>(
            "YOUTUBE",
            `${API_BASE}/commentThreads?part=snippet&videoId=${video.videoId}&maxResults=25&order=time`,
            { headers: { Authorization: `Bearer ${connection.accessToken}` } }
          );
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
      const videoId = item.snippet.videoId;
      return {
        type: "COMMENT" as const,
        externalId: item.snippet.topLevelComment.id,
        postExternalId: videoId,
        postPermalink: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
        authorName: c.authorDisplayName,
        authorAvatarUrl: c.authorProfileImageUrl,
        text: c.textDisplay,
        permalink: videoId ? `https://www.youtube.com/watch?v=${videoId}&lc=${item.snippet.topLevelComment.id}` : undefined,
        publishedAt: c.publishedAt ? new Date(c.publishedAt) : undefined
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
  async fetchPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
    const videos = await fetchRecentVideos(connection, 15);
    if (videos.length === 0) return [];
    const ids = videos.map((v) => v.videoId).join(",");
    const data = await fetchJson<{
      items: { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
    }>("YOUTUBE", `${API_BASE}/videos?part=statistics&id=${ids}&maxResults=50`, {
      headers: { Authorization: `Bearer ${connection.accessToken}` }
    });
    const statsById = new Map((data.items ?? []).map((item) => [item.id, item.statistics ?? {}]));
    const num = (value: string | undefined) => (value === undefined ? null : Number(value));
    return videos.map((v) => {
      const st = statsById.get(v.videoId) ?? {};
      return {
        postExternalId: v.videoId,
        title: v.title,
        permalink: `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnailUrl: v.thumbnailUrl,
        publishedAt: v.publishedAt ? new Date(v.publishedAt) : undefined,
        views: num(st.viewCount),
        likes: num(st.likeCount),
        comments: num(st.commentCount),
        shares: null,
        saves: null
      };
    });
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    const channel = await fetchJson<{
      items: { statistics: { subscriberCount: string; viewCount: string; videoCount: string } }[];
    }>("YOUTUBE", `${API_BASE}/channels?part=statistics&mine=true`, {
      headers: { Authorization: `Bearer ${connection.accessToken}` }
    });
    const stats = channel.items[0]?.statistics;

    return {
      followers: Number(stats?.subscriberCount ?? 0),
      followersDelta: 0,
      engagementRate: 0,
      impressions: Number(stats?.viewCount ?? 0),
      reach: 0,
      postsCount: Number(stats?.videoCount ?? 0)
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

  const data = await fetchJson<{ rows?: [number, number][] }>(
    "YOUTUBE",
    `${ANALYTICS_BASE}/reports?${params.toString()}`,
    { headers: { Authorization: `Bearer ${connection.accessToken}` } }
  );

  if (!data.rows?.length) {
    throw new Error(
      "Aucune donnée de rétention disponible pour cette vidéo (trop récente, ou vues insuffisantes pour YouTube Analytics)."
    );
  }

  return data.rows.map(([timeRatio, watchRatio]) => ({ timeRatio, watchRatio }));
}

export interface YoutubeVideoSummary {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
}

/**
 * Liste les vidéos les plus récentes de la chaîne connectée (scope
 * youtube.readonly, déjà demandé — voir getAuthUrl ci-dessus), pour le
 * sélecteur de l'outil autonome de rétention (/retention) : n'importe quelle
 * vidéo de la chaîne, publiée ou non via Nebula, pas seulement celles créées
 * depuis le Composer.
 */
export async function fetchRecentVideos(connection: ConnectionLike, maxResults = 12): Promise<YoutubeVideoSummary[]> {
  const data = await fetchJson<{
    items: { id: { videoId: string }; snippet: { title: string; publishedAt: string; thumbnails: { medium?: { url: string }; default: { url: string } } } }[];
  }>(
    "YOUTUBE",
    `${API_BASE}/search?part=snippet&forMine=true&type=video&order=date&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${connection.accessToken}` } }
  );

  return (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default.url,
      publishedAt: item.snippet.publishedAt
    }));
}

export interface YoutubeVideoMetadata {
  title: string;
  description: string;
  thumbnailUrl: string;
}

/** Métadonnées publiques d'une vidéo précise (titre, description, miniature). */
export async function fetchVideoMetadata(connection: ConnectionLike, videoId: string): Promise<YoutubeVideoMetadata> {
  const data = await fetchJson<{
    items: { snippet: { title: string; description: string; thumbnails: { medium?: { url: string }; default: { url: string } } } }[];
  }>("YOUTUBE", `${API_BASE}/videos?part=snippet&id=${videoId}`, {
    headers: { Authorization: `Bearer ${connection.accessToken}` }
  });

  const item = data.items?.[0];
  if (!item) throw new Error("Vidéo introuvable sur cette chaîne YouTube.");

  return {
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnailUrl: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default.url
  };
}
