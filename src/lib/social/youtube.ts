import type { AnalyticsResult, PublishResult } from "@/lib/types";
import { fetchJson, type ConnectionLike, type OAuthTokenResult, type PublishInput, type SocialClient } from "./base";

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
    const initRes = await fetch(
      `${UPLOAD_BASE}?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/*"
        },
        body: JSON.stringify({
          snippet: { title, description: input.caption },
          status: { privacyStatus: "public" }
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

    return { externalPostId: video.id, externalUrl: `https://youtube.com/watch?v=${video.id}` };
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
  const startDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
