import type { AnalyticsResult, PublishResult } from "@/lib/types";
import {
  fetchJson,
  type ConnectionLike,
  type EngagementItemInput,
  type OAuthTokenResult,
  type PostMetricInput,
  type PublishInput,
  type SocialClient
} from "./base";

// Nombre de publications récentes interrogées pour remonter leurs
// commentaires (voir fetchInstagramEngagement / fetchFacebookEngagement
// ci-dessous) — au-delà, on rallongerait surtout le temps de synchronisation
// sans ajouter grand-chose : la boîte de réception /interactions cible les
// échanges récents, pas un historique complet.
const ENGAGEMENT_RECENT_POSTS = 10;
const ENGAGEMENT_COMMENTS_PER_POST = 25;

// Instagram (Business/Creator) publie via le Graph API de Meta, sous le même
// compte développeur que Facebook. Doc officielle :
// https://developers.facebook.com/docs/instagram-platform/content-publishing
const GRAPH_VERSION = "v19.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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
    "business_management",
    // Nécessaires pour la fonction "premier commentaire" (bulle du Composer/
    // Importation) — voir postComment ci-dessous. Les comptes déjà connectés
    // avant l'ajout de ces scopes devront se reconnecter pour en bénéficier.
    "instagram_manage_comments",
    "pages_manage_engagement"
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

/**
 * Poste un commentaire sur un média Instagram ou une publication Facebook
 * déjà publiée — utilisé pour la fonction "premier commentaire" (voir la
 * bulle dédiée dans le Composer/Importation et src/lib/publish.ts).
 * Nécessite instagram_manage_comments (IG) ou pages_manage_engagement (FB) —
 * voir les scopes demandés dans getMetaAuthUrl ci-dessus.
 */
async function postGraphComment(network: "INSTAGRAM" | "FACEBOOK", targetId: string, accessToken: string, message: string) {
  await fetchJson<{ id: string }>(network, `${GRAPH_BASE}/${targetId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message, access_token: accessToken }).toString()
  });
}

/**
 * Commentaires reçus sur les médias Instagram les plus récents du compte
 * (scope instagram_manage_comments, déjà demandé — voir getMetaAuthUrl).
 * Deux appels en cascade car le Graph API n'expose pas d'endpoint global
 * "tous les commentaires de ce compte" : on liste d'abord les publications,
 * puis leurs commentaires un par un.
 */
async function fetchInstagramEngagement(connection: ConnectionLike): Promise<EngagementItemInput[]> {
  const media = await fetchJson<{
    data: { id: string; permalink?: string }[];
  }>(
    "INSTAGRAM",
    `${GRAPH_BASE}/${connection.externalAccountId}/media?fields=id,permalink&limit=${ENGAGEMENT_RECENT_POSTS}&access_token=${connection.accessToken}`
  );

  const items: EngagementItemInput[] = [];
  for (const m of media.data ?? []) {
    const comments = await fetchJson<{
      data: { id: string; text: string; username?: string; timestamp: string }[];
    }>(
      "INSTAGRAM",
      `${GRAPH_BASE}/${m.id}/comments?fields=id,text,username,timestamp&limit=${ENGAGEMENT_COMMENTS_PER_POST}&access_token=${connection.accessToken}`
    ).catch(() => ({ data: [] }));

    for (const c of comments.data ?? []) {
      items.push({
        type: "COMMENT",
        externalId: c.id,
        postExternalId: m.id,
        postPermalink: m.permalink,
        authorName: c.username,
        text: c.text,
        permalink: m.permalink,
        publishedAt: c.timestamp ? new Date(c.timestamp) : undefined
      });
    }
  }
  return items;
}

/**
 * Métriques des publications Instagram récentes : like_count et
 * comments_count viennent directement des champs du média ; partages et
 * enregistrements passent par /insights (metric=shares,saved), qui n'existe
 * que pour les comptes Business/Creator et certains types de médias — en
 * cas d'échec on garde null, jamais 0.
 */
async function fetchInstagramPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
  const media = await fetchJson<{
    data: {
      id: string;
      caption?: string;
      permalink?: string;
      media_type?: string;
      thumbnail_url?: string;
      media_url?: string;
      timestamp?: string;
      like_count?: number;
      comments_count?: number;
    }[];
  }>(
    "INSTAGRAM",
    `${GRAPH_BASE}/${connection.externalAccountId}/media?fields=id,caption,permalink,media_type,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=15&access_token=${connection.accessToken}`
  );

  return Promise.all(
    (media.data ?? []).map(async (m) => {
      const insights = await fetchJson<{ data: { name: string; values: { value: number }[] }[] }>(
        "INSTAGRAM",
        `${GRAPH_BASE}/${m.id}/insights?metric=shares,saved,views&access_token=${connection.accessToken}`
      ).catch(() => ({ data: [] as { name: string; values: { value: number }[] }[] }));
      const metric = (name: string): number | null => {
        const value = insights.data.find((x) => x.name === name)?.values?.[0]?.value;
        return typeof value === "number" ? value : null;
      };
      return {
        postExternalId: m.id,
        title: m.caption?.slice(0, 120),
        permalink: m.permalink,
        thumbnailUrl: m.thumbnail_url ?? (m.media_type === "VIDEO" ? undefined : m.media_url),
        publishedAt: m.timestamp ? new Date(m.timestamp) : undefined,
        views: metric("views"),
        likes: typeof m.like_count === "number" ? m.like_count : null,
        comments: typeof m.comments_count === "number" ? m.comments_count : null,
        shares: metric("shares"),
        saves: metric("saved")
      };
    })
  );
}

/**
 * Métriques des publications Facebook récentes de la Page : réactions
 * (likes.summary), commentaires (comments.summary) et partages (shares.count)
 * en un seul appel. Facebook n'expose ni vues ni enregistrements ici.
 */
async function fetchFacebookPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
  const posts = await fetchJson<{
    data: {
      id: string;
      message?: string;
      permalink_url?: string;
      created_time?: string;
      full_picture?: string;
      shares?: { count?: number };
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    }[];
  }>(
    "FACEBOOK",
    `${GRAPH_BASE}/${connection.externalAccountId}/posts?fields=id,message,permalink_url,created_time,full_picture,shares,likes.summary(true).limit(0),comments.summary(true).limit(0)&limit=15&access_token=${connection.accessToken}`
  );

  return (posts.data ?? []).map((p) => ({
    postExternalId: p.id,
    title: p.message?.slice(0, 120),
    permalink: p.permalink_url,
    thumbnailUrl: p.full_picture,
    publishedAt: p.created_time ? new Date(p.created_time) : undefined,
    views: null,
    likes: typeof p.likes?.summary?.total_count === "number" ? p.likes.summary.total_count : null,
    comments: typeof p.comments?.summary?.total_count === "number" ? p.comments.summary.total_count : null,
    shares: typeof p.shares?.count === "number" ? p.shares.count : null,
    saves: null
  }));
}

/**
 * Commentaires reçus sur les publications Facebook les plus récentes de la
 * Page (scope pages_read_engagement, déjà demandé — voir getMetaAuthUrl).
 */
async function fetchFacebookEngagement(connection: ConnectionLike): Promise<EngagementItemInput[]> {
  const posts = await fetchJson<{
    data: { id: string; permalink_url?: string }[];
  }>(
    "FACEBOOK",
    `${GRAPH_BASE}/${connection.externalAccountId}/posts?fields=id,permalink_url&limit=${ENGAGEMENT_RECENT_POSTS}&access_token=${connection.accessToken}`
  );

  const items: EngagementItemInput[] = [];
  for (const p of posts.data ?? []) {
    const comments = await fetchJson<{
      data: { id: string; message?: string; from?: { name?: string }; created_time: string; permalink_url?: string }[];
    }>(
      "FACEBOOK",
      `${GRAPH_BASE}/${p.id}/comments?fields=id,message,from,created_time,permalink_url&limit=${ENGAGEMENT_COMMENTS_PER_POST}&access_token=${connection.accessToken}`
    ).catch(() => ({ data: [] }));

    for (const c of comments.data ?? []) {
      items.push({
        type: "COMMENT",
        externalId: c.id,
        postExternalId: p.id,
        postPermalink: p.permalink_url,
        authorName: c.from?.name,
        text: c.message,
        permalink: c.permalink_url ?? p.permalink_url,
        publishedAt: c.created_time ? new Date(c.created_time) : undefined
      });
    }
  }
  return items;
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

    // Lieu (location_id = Page Facebook du lieu). S'il est refusé (page
    // sans adresse, identifiant invalide…), on republie sans le lieu plutôt
    // que de faire échouer toute la publication.
    if (input.location?.id) params.set("location_id", input.location.id);
    let container: { id: string };
    try {
      container = await fetchJson<{ id: string }>(
        "INSTAGRAM",
        `${GRAPH_BASE}/${connection.externalAccountId}/media?${params.toString()}`,
        { method: "POST" }
      );
    } catch (err) {
      if (!params.has("location_id")) throw err;
      console.error(`[instagram] lieu ${input.location?.id} refusé, publication sans lieu :`, err);
      params.delete("location_id");
      container = await fetchJson<{ id: string }>(
        "INSTAGRAM",
        `${GRAPH_BASE}/${connection.externalAccountId}/media?${params.toString()}`,
        { method: "POST" }
      );
    }

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
  },

  async postComment(connection, externalPostId, comment) {
    await postGraphComment("INSTAGRAM", externalPostId, connection.accessToken, comment);
  },

  fetchEngagement: fetchInstagramEngagement,
  fetchPostMetrics: fetchInstagramPostMetrics
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
    // Lieu : paramètre « place » (Page Facebook du lieu), photos uniquement.
    // Refusé → on republie sans le lieu.
    if (input.location?.id && endpoint === "photos") params.set("place", input.location.id);
    let result: { id: string; post_id?: string };
    try {
      result = await fetchJson<{ id: string; post_id?: string }>(
        "FACEBOOK",
        `${GRAPH_BASE}/${connection.externalAccountId}/${endpoint}?${params.toString()}`,
        { method: "POST" }
      );
    } catch (err) {
      if (!params.has("place")) throw err;
      console.error(`[facebook] lieu ${input.location?.id} refusé, publication sans lieu :`, err);
      params.delete("place");
      result = await fetchJson<{ id: string; post_id?: string }>(
        "FACEBOOK",
        `${GRAPH_BASE}/${connection.externalAccountId}/${endpoint}?${params.toString()}`,
        { method: "POST" }
      );
    }
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
  },

  async postComment(connection, externalPostId, comment) {
    await postGraphComment("FACEBOOK", externalPostId, connection.accessToken, comment);
  },

  fetchEngagement: fetchFacebookEngagement,
  fetchPostMetrics: fetchFacebookPostMetrics
};
