import { prisma } from "@/lib/prisma";
import type { AnalyticsResult, PublishResult } from "@/lib/types";
import { SocialApiError, fetchJson, type ConnectionLike, type OAuthTokenResult, type PostMetricInput, type PublishInput, type SocialClient } from "./base";

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
  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken
    }),
    cache: "no-store"
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_grant") {
      await prisma.socialConnection
        .update({ where: { id: connection.id }, data: { refreshToken: null, tokenExpiresAt: new Date() } })
        .catch(() => undefined);
      connection.refreshToken = null;
      throw new SocialApiError("TIKTOK", EXPIRED_MESSAGE, 401, json);
    }
    throw new SocialApiError(
      "TIKTOK",
      `TikTok n'a pas pu renouveler la connexion (${json.error_description || json.error || res.status}). Réessayez dans quelques minutes.`,
      res.status,
      json
    );
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

    const token = await fetchJson<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      open_id: string;
    }>("TIKTOK", `${API_BASE}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });

    const profile = await fetchJson<{
      data: { user: { display_name: string; avatar_url: string; follower_count: number } };
    }>(
      "TIKTOK",
      `${API_BASE}/user/info/?fields=display_name,avatar_url,follower_count`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      externalAccountId: token.open_id,
      displayName: profile.data.user.display_name,
      avatarUrl: profile.data.user.avatar_url,
      scopes: "user.info.basic,video.publish,video.list"
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishResult> {
    if (input.mediaType !== "VIDEO") {
      throw new Error("Ce client ne gère que la publication vidéo (Direct Post). Pour les photos, utilisez /v2/post/publish/content/init/ (photo post).");
    }
    await freshTiktokToken(connection);

    // "PULL_FROM_URL" : TikTok télécharge lui-même la vidéo depuis l'URL fournie
    // (doit être publiquement accessible en HTTPS et le domaine doit être
    // vérifié dans le portail développeur TikTok).
    const init = await fetchJson<{ data: { publish_id: string } }>(
      "TIKTOK",
      `${API_BASE}/post/publish/video/init/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
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
        })
      }
    );

    // La publication est asynchrone côté TikTok : on interroge le statut.
    let status = "PROCESSING_DOWNLOAD";
    let publicaeId = "";
    for (let i = 0; i < 30 && status !== "PUBLISH_COMPLETE"; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const check = await fetchJson<{ data: { status: string; publicaly_available_post_id?: string[] } }>(
        "TIKTOK",
        `${API_BASE}/post/publish/status/fetch/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ publish_id: init.data.publish_id })
        }
      );
      status = check.data.status;
      publicaeId = check.data.publicaly_available_post_id?.[0] ?? "";
      if (status === "FAILED") throw new Error("La publication TikTok a échoué côté plateforme.");
    }

    return { externalPostId: init.data.publish_id, externalUrl: publicaeId ? `https://www.tiktok.com/video/${publicaeId}` : undefined };
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    await freshTiktokToken(connection);
    const profile = await fetchJson<{
      data: { user: { follower_count: number; likes_count: number; video_count: number } };
    }>(
      "TIKTOK",
      `${API_BASE}/user/info/?fields=follower_count,likes_count,video_count`,
      { headers: { Authorization: `Bearer ${connection.accessToken}` } }
    );

    return {
      followers: profile.data.user.follower_count,
      followersDelta: 0,
      engagementRate: 0,
      impressions: 0,
      reach: 0,
      postsCount: profile.data.user.video_count
    };
  },

  /**
   * Vues, likes, commentaires et partages des 15 dernières vidéos — endpoint
   * video/list (scope video.list, déjà demandé dans getAuthUrl). TikTok
   * n'expose pas les enregistrements (favoris) : laissés à null.
   * Doc : https://developers.tiktok.com/doc/display-api-get-user-videos
   */
  async fetchPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
    await freshTiktokToken(connection);
    const data = await fetchJson<{
      data: {
        videos: {
          id: string;
          title?: string;
          video_description?: string;
          cover_image_url?: string;
          share_url?: string;
          create_time?: number;
          like_count?: number;
          comment_count?: number;
          share_count?: number;
          view_count?: number;
        }[];
      };
    }>(
      "TIKTOK",
      `${API_BASE}/video/list/?fields=id,title,video_description,cover_image_url,share_url,create_time,like_count,comment_count,share_count,view_count`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: 15 })
      }
    );
    const num = (value: number | undefined): number | null => (typeof value === "number" ? value : null);
    return (data.data?.videos ?? []).map((v) => ({
      postExternalId: v.id,
      title: (v.title || v.video_description || "").slice(0, 120) || undefined,
      permalink: v.share_url,
      thumbnailUrl: v.cover_image_url,
      publishedAt: v.create_time ? new Date(v.create_time * 1000) : undefined,
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
