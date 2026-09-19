import type { AnalyticsResult, PublishResult } from "@/lib/types";
import { fetchJson, type ConnectionLike, type OAuthTokenResult, type PublishInput, type SocialClient } from "./base";

// Instagram (Business/Creator) publie via le Graph API de Meta, sous le même
// compte développeur que Facebook. Doc officielle :
// https://developers.facebook.com/docs/instagram-platform/content-publishing
const GRAPH_VERSION = "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} manquant. Créez une app sur developers.facebook.com et renseignez .env (voir .env.example).`
    );
  }
  return value;
}

function getMetaAuthUrl(state: string): string {
  const appId = requireEnv("META_APP_ID");
  const redirectUri = requireEnv("META_REDIRECT_URI");
  const scopes = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management"
  ].join(",");
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Une seule autorisation Meta peut donner accès à PLUSIEURS Pages Facebook
 * (une agence/marque en gère souvent plusieurs), chacune pouvant avoir son
 * propre compte Instagram Business/Creator lié. On boucle donc sur TOUTES
 * les pages retournées par /me/accounts (et non plus seulement la première)
 * pour permettre de connecter plusieurs comptes Facebook/Instagram en une
 * seule autorisation — c'est cette fonction que la route
 * /api/connections/meta/callback appelle pour créer autant de
 * SocialConnection que de comptes trouvés.
 */
export async function exchangeMetaCode(code: string): Promise<{
  instagramAccounts: OAuthTokenResult[];
  facebookPages: OAuthTokenResult[];
}> {
  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");
  const redirectUri = requireEnv("META_REDIRECT_URI");

  // 1. Code -> token courte durée
  const shortLived = await fetchJson<{ access_token: string }>(
    "INSTAGRAM",
    `${GRAPH_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&code=${code}`
  );

  // 2. Échange contre un token longue durée (~60 jours)
  const longLived = await fetchJson<{ access_token: string; expires_in: number }>(
    "INSTAGRAM",
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLived.access_token}`
  );
  const expiresAt = new Date(Date.now() + longLived.expires_in * 1000);

  // 3. TOUTES les pages administrées par l'utilisateur (pagination Graph API incluse)
  const pages: { id: string; name: string; picture?: { data: { url: string } }; instagram_business_account?: { id: string } }[] = [];
  let nextUrl: string | undefined =
    `${GRAPH_BASE}/me/accounts?fields=name,picture,instagram_business_account&limit=100&access_token=${longLived.access_token}`;
  while (nextUrl) {
    const page: { data: typeof pages; paging?: { next?: string } } = await fetchJson("INSTAGRAM", nextUrl);
    pages.push(...page.data);
    nextUrl = page.paging?.next;
  }

  const facebookPages: OAuthTokenResult[] = pages.map((p) => ({
    accessToken: longLived.access_token,
    expiresAt,
    externalAccountId: p.id,
    displayName: p.name,
    avatarUrl: p.picture?.data.url,
    scopes: "pages_show_list,pages_read_engagement,pages_manage_posts"
  }));

  const instagramAccounts: OAuthTokenResult[] = [];
  for (const p of pages) {
    if (!p.instagram_business_account) continue;
    const igAccount = await fetchJson<{ id: string; username: string; profile_picture_url?: string }>(
      "INSTAGRAM",
      `${GRAPH_BASE}/${p.instagram_business_account.id}?fields=username,profile_picture_url&access_token=${longLived.access_token}`
    );
    instagramAccounts.push({
      accessToken: longLived.access_token,
      expiresAt,
      externalAccountId: igAccount.id,
      displayName: igAccount.username,
      handle: `@${igAccount.username}`,
      avatarUrl: igAccount.profile_picture_url,
      scopes: "instagram_basic,instagram_content_publish,pages_show_list"
    });
  }

  return { instagramAccounts, facebookPages };
}

export const instagramClient: SocialClient = {
  network: "INSTAGRAM",
  getAuthUrl: getMetaAuthUrl,

  async exchangeCodeForToken(code) {
    const { instagramAccounts } = await exchangeMetaCode(code);
    const instagram = instagramAccounts[0];
    if (!instagram) {
      throw new Error(
        "Aucun compte Instagram Business/Creator lié à une Page Facebook n'a été trouvé pour cet utilisateur."
      );
    }
    return instagram;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishResult> {
    if (input.mediaUrls.length === 0) {
      throw new Error("Instagram exige au moins un média (image ou vidéo).");
    }

    // Étape 1 : créer un "media container"
    const isVideo = input.mediaType === "VIDEO";
    const params = new URLSearchParams({
      access_token: connection.accessToken,
      caption: input.caption
    });
    if (isVideo) {
      params.set("media_type", "REELS");
      params.set("video_url", input.mediaUrls[0]);
    } else if (input.mediaUrls.length > 1) {
      // Carrousel : on crée un container "enfant" par image puis un container
      // parent de type CAROUSEL qui les référence.
      const children: string[] = [];
      for (const url of input.mediaUrls) {
        const child = await fetchJson<{ id: string }>(
          "INSTAGRAM",
          `${GRAPH_BASE}/${connection.externalAccountId}/media?access_token=${connection.accessToken}&image_url=${encodeURIComponent(
            url
          )}&is_carousel_item=true`,
          { method: "POST" }
        );
        children.push(child.id);
      }
      params.set("media_type", "CAROUSEL");
      params.set("children", children.join(","));
    } else {
      params.set("image_url", input.mediaUrls[0]);
    }

    const container = await fetchJson<{ id: string }>(
      "INSTAGRAM",
      `${GRAPH_BASE}/${connection.externalAccountId}/media?${params.toString()}`,
      { method: "POST" }
    );

    // Pour une vidéo/Reel, Instagram encode le fichier de façon asynchrone :
    // on interroge status_code jusqu'à FINISHED avant de publier.
    if (isVideo) {
      let statusCode = "IN_PROGRESS";
      for (let i = 0; i < 30 && statusCode !== "FINISHED"; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const status = await fetchJson<{ status_code: string }>(
          "INSTAGRAM",
          `${GRAPH_BASE}/${container.id}?fields=status_code&access_token=${connection.accessToken}`
        );
        statusCode = status.status_code;
        if (statusCode === "ERROR") throw new Error("Le traitement de la vidéo par Instagram a échoué.");
      }
    }

    // Étape 2 : publier le container
    const published = await fetchJson<{ id: string }>(
      "INSTAGRAM",
      `${GRAPH_BASE}/${connection.externalAccountId}/media_publish?creation_id=${container.id}&access_token=${connection.accessToken}`,
      { method: "POST" }
    );

    return {
      externalPostId: published.id,
      externalUrl: `https://www.instagram.com/p/${published.id}/`
    };
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    const profile = await fetchJson<{ followers_count: number; media_count: number }>(
      "INSTAGRAM",
      `${GRAPH_BASE}/${connection.externalAccountId}?fields=followers_count,media_count&access_token=${connection.accessToken}`
    );

    const insights = await fetchJson<{
      data: { name: string; values: { value: number }[] }[];
    }>(
      "INSTAGRAM",
      `${GRAPH_BASE}/${connection.externalAccountId}/insights?metric=reach,impressions&period=day&access_token=${connection.accessToken}`
    ).catch(() => ({ data: [] }));

    const metric = (name: string) =>
      insights.data.find((m) => m.name === name)?.values?.at(-1)?.value ?? 0;

    return {
      followers: profile.followers_count,
      followersDelta: 0,
      engagementRate: 0,
      impressions: metric("impressions"),
      reach: metric("reach"),
      postsCount: profile.media_count
    };
  }
};

// Facebook Page (partage la même app Meta que instagramClient)
export const facebookClient: SocialClient = {
  network: "FACEBOOK",
  getAuthUrl: getMetaAuthUrl,

  async exchangeCodeForToken(code) {
    const { facebookPages } = await exchangeMetaCode(code);
    const facebook = facebookPages[0];
    if (!facebook) throw new Error("Aucune Page Facebook trouvée pour cet utilisateur.");
    return facebook;
  },

  async publishPost(connection, input) {
    const endpoint = input.mediaType === "VIDEO" ? "videos" : "photos";
    const params = new URLSearchParams({
      access_token: connection.accessToken,
      [input.mediaType === "VIDEO" ? "file_url" : "url"]: input.mediaUrls[0],
      caption: input.caption,
      description: input.caption
    });
    const result = await fetchJson<{ id: string; post_id?: string }>(
      "FACEBOOK",
      `${GRAPH_BASE}/${connection.externalAccountId}/${endpoint}?${params.toString()}`,
      { method: "POST" }
    );
    const id = result.post_id ?? result.id;
    return { externalPostId: id, externalUrl: `https://www.facebook.com/${id}` };
  },

  async fetchAnalytics(connection) {
    const page = await fetchJson<{ followers_count?: number; fan_count?: number }>(
      "FACEBOOK",
      `${GRAPH_BASE}/${connection.externalAccountId}?fields=followers_count,fan_count&access_token=${connection.accessToken}`
    );
    return {
      followers: page.followers_count ?? page.fan_count ?? 0,
      followersDelta: 0,
      engagementRate: 0,
      impressions: 0,
      reach: 0,
      postsCount: 0
    };
  }
};
