import { createHmac } from "crypto";
import type { ZodType, ZodTypeDef } from "zod";
import { prisma } from "@/lib/prisma";
import type { AnalyticsResult } from "@/lib/types";
import {
  SocialApiError,
  earliest,
  fetchJson,
  pollUntil,
  sameHandle,
  waitBudgetMs,
  type ConnectionLike,
  type EngagementItemInput,
  type OAuthTokenResult,
  type PostMetricInput,
  type RecentPost,
  type PublishCheckpoint,
  type PublishInput,
  type PublishOutcome,
  type SocialClient
} from "./base";
import { countSchema, graphList, idSchema, opt, soft, textSchema, toDate, z } from "./contract";
import { metaGraphVersion } from "./versions";

// --- Contrats des réponses (lot 7, voir contract.ts) -------------------------
// Doc : https://developers.facebook.com/docs/instagram-platform/content-publishing
//       https://developers.facebook.com/docs/graph-api/reference/page/
// Réponses types : tests/contracts/fixtures/meta.

/** Création d'un objet (conteneur, publication, photo…) : l'identifiant est indispensable. */
const createdSchema = z.object({ id: idSchema, post_id: opt(idSchema) });
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: soft(z.number()) });
const pageSchema = z.object({
  id: idSchema,
  name: z.string(),
  access_token: opt(z.string().min(1)),
  picture: soft(z.object({ data: z.object({ url: z.string() }) })),
  instagram_business_account: opt(z.object({ id: idSchema }))
});
const pageListSchema = graphList(pageSchema);
const igAccountSchema = z.object({ id: idSchema, username: z.string().min(1), profile_picture_url: textSchema });
const insightsSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      // Valeur numérique, ou objet pour les métriques ventilées : lue par insightValue.
      values: soft(z.array(z.object({ value: z.unknown() }))),
      total_value: soft(z.object({ value: z.unknown() }))
    })
  )
});
const igMediaSchema = z.object({
  id: idSchema,
  caption: textSchema,
  permalink: textSchema,
  media_type: textSchema,
  thumbnail_url: textSchema,
  media_url: textSchema,
  timestamp: textSchema,
  like_count: countSchema,
  comments_count: countSchema
});
const fbPostSchema = z.object({
  id: idSchema,
  message: textSchema,
  permalink_url: textSchema,
  created_time: textSchema,
  full_picture: textSchema,
  shares: soft(z.object({ count: countSchema })),
  likes: soft(z.object({ summary: soft(z.object({ total_count: countSchema })) })),
  comments: soft(z.object({ summary: soft(z.object({ total_count: countSchema })) }))
});
// Réponses renvoyées avec chaque commentaire (lot B des Réussites) : seules
// celles du compte lui-même nous intéressent (étoiles « Première réponse »,
// « Conversation »). Tolérantes : une forme inattendue = aucune réponse vue.
const replyAuthorSchema = soft(z.object({ id: textSchema, name: textSchema, username: textSchema }));
const igCommentSchema = z.object({
  id: idSchema,
  text: textSchema,
  username: textSchema,
  timestamp: textSchema,
  replies: soft(z.object({ data: soft(z.array(z.object({ from: replyAuthorSchema, username: textSchema, timestamp: textSchema }))) }))
});
const fbCommentSchema = z.object({
  id: idSchema,
  message: textSchema,
  from: soft(z.object({ id: textSchema, name: textSchema })),
  created_time: textSchema,
  permalink_url: textSchema,
  comments: soft(z.object({ data: soft(z.array(z.object({ from: replyAuthorSchema, created_time: textSchema }))) }))
});
const containerStatusSchema = z.object({ status_code: z.string(), status: textSchema });
const permalinkSchema = z.object({ permalink: textSchema });

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
//
// Lot 2 (fiabilité) : version centralisée dans versions.ts (v25.0 — la
// v19.0 codée ici avait expiré le 21/05/2026).
export function graphBase(): string {
  return `https://graph.facebook.com/${metaGraphVersion()}`;
}

/** Marqueur (dans SocialConnection.scopes) d'une Page Facebook qui a son propre jeton de Page. */
export const PAGE_TOKEN_MARKER = "page_token";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} manquant. Créez une app sur developers.facebook.com et renseignez .env (voir .env.example).`
    );
  }
  return value;
}

// Preuve que l'appel vient bien de NOTRE serveur (option « Exiger la clé
// secrète de l'application » de Meta) : un jeton volé seul ne suffit plus
// si l'option est activée dans le tableau de bord Meta.
function appSecretProof(token: string): string | null {
  const secret = process.env.META_APP_SECRET;
  return secret ? createHmac("sha256", secret).update(token).digest("hex") : null;
}

type MetaNetwork = "INSTAGRAM" | "FACEBOOK";

/**
 * Appel Graph API. Paramètres d'une requête POST (légende, jeton…) dans le
 * corps et non dans l'adresse ; appsecret_proof ajouté ; délai de 30 s par
 * défaut (voir fetchJson).
 */
export async function graph<T = unknown>(
  network: MetaNetwork,
  path: string,
  token: string,
  init: {
    method?: "GET" | "POST" | "DELETE";
    params?: Record<string, string | undefined>;
    timeoutMs?: number;
    /** Contrat de la réponse (lot 7). Sans : réponse non lue (`unknown`). */
    schema?: ZodType<T, ZodTypeDef, unknown>;
  } = {}
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${graphBase()}${path.startsWith("/") ? path : `/${path}`}`);
  const method = init.method ?? "GET";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(init.params ?? {})) if (v !== undefined) params.set(k, v);
  params.set("access_token", token);
  const proof = appSecretProof(token);
  if (proof) params.set("appsecret_proof", proof);
  if (method === "POST") {
    return fetchJson(network, url.toString(), {
      method,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
      timeoutMs: init.timeoutMs,
      schema: init.schema
    });
  }
  for (const [k, v] of params) url.searchParams.set(k, v);
  return fetchJson(network, url.toString(), { method, cache: "no-store", timeoutMs: init.timeoutMs, schema: init.schema });
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
  const url = new URL(`https://www.facebook.com/${metaGraphVersion()}/dialog/oauth`);
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
 *
 * Lot 2 : chaque Page Facebook garde désormais SON jeton de Page (et non
 * plus le jeton de l'utilisateur, qui donnait accès à toutes ses Pages et
 * que Meta n'accepte pas pour publier au nom d'une Page). Un jeton de Page
 * obtenu à partir d'un jeton longue durée n'expire pas.
 */
export async function exchangeMetaCode(code: string): Promise<{
  instagramAccounts: OAuthTokenResult[];
  facebookPages: OAuthTokenResult[];
}> {
  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");
  const redirectUri = requireEnv("META_REDIRECT_URI");

  // 1. Code -> token courte durée
  const shortLived = await fetchJson(
    "INSTAGRAM",
    `${graphBase()}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })}`,
    { cache: "no-store", schema: tokenSchema }
  );

  // 2. Échange contre un token longue durée (~60 jours)
  const longLived = await fetchJson(
    "INSTAGRAM",
    `${graphBase()}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token
    })}`,
    { cache: "no-store", schema: tokenSchema }
  );
  // Jeton longue durée : ~60 jours. Durée absente de la réponse → 60 jours
  // (avant : date invalide enregistrée).
  const expiresAt = new Date(Date.now() + (longLived.expires_in ?? 60 * 86_400) * 1000);

  // Personne qui autorise (sert aux rappels « application retirée » de Meta).
  const me = await graph("INSTAGRAM", "/me", longLived.access_token, { params: { fields: "id" }, schema: z.object({ id: idSchema }) }).catch(() => null);

  // 3. TOUTES les pages administrées par l'utilisateur (pagination Graph API incluse)
  const pages: z.output<typeof pageSchema>[] = [];
  let next: string | undefined = `${graphBase()}/me/accounts`;
  let params: Record<string, string> | undefined = { fields: "name,picture,instagram_business_account,access_token", limit: "100" };
  while (next) {
    const page: z.output<typeof pageListSchema> = await graph("INSTAGRAM", next, longLived.access_token, { params, schema: pageListSchema });
    pages.push(...page.data);
    next = page.paging?.next;
    params = undefined; // l'adresse « next » contient déjà les paramètres
  }

  const facebookPages: OAuthTokenResult[] = pages.map((p) => ({
    accessToken: p.access_token ?? longLived.access_token,
    // Jeton de Page : pas d'expiration. Faute de jeton de Page (cas rare), on
    // garde celui de l'utilisateur et sa date d'expiration.
    expiresAt: p.access_token ? undefined : expiresAt,
    externalAccountId: p.id,
    displayName: p.name,
    avatarUrl: p.picture?.data.url,
    scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", ...(p.access_token ? [PAGE_TOKEN_MARKER] : [])].join(","),
    authUserId: me?.id
  }));

  const instagramAccounts: OAuthTokenResult[] = [];
  for (const p of pages) {
    if (!p.instagram_business_account) continue;
    const igAccount = await graph("INSTAGRAM", `/${p.instagram_business_account.id}`, longLived.access_token, {
      params: { fields: "username,profile_picture_url" },
      schema: igAccountSchema
    });
    instagramAccounts.push({
      accessToken: longLived.access_token,
      expiresAt,
      externalAccountId: igAccount.id,
      displayName: igAccount.username,
      handle: `@${igAccount.username}`,
      avatarUrl: igAccount.profile_picture_url,
      scopes: "instagram_basic,instagram_content_publish,pages_show_list",
      authUserId: me?.id
    });
  }

  return { instagramAccounts, facebookPages };
}

/**
 * Jeton de la Page pour une connexion Facebook créée avant le lot 2 (qui
 * gardait le jeton de l'utilisateur) : demandé une fois à Meta avec l'ancien
 * jeton, puis enregistré. En cas d'échec, l'ancien jeton reste utilisé.
 */
export async function ensureFacebookPageToken(connection: ConnectionLike): Promise<string> {
  const scopes = connection.scopes ?? "";
  if (scopes.split(",").includes(PAGE_TOKEN_MARKER)) return connection.accessToken;
  try {
    const page = await graph("FACEBOOK", `/${connection.externalAccountId}`, connection.accessToken, {
      params: { fields: "access_token" },
      schema: z.object({ access_token: opt(z.string().min(1)) })
    });
    if (page.access_token) {
      const nextScopes = [scopes, PAGE_TOKEN_MARKER].filter(Boolean).join(",");
      await prisma.socialConnection.update({
        where: { id: connection.id },
        data: { accessToken: page.access_token, tokenExpiresAt: null, scopes: nextScopes }
      });
      connection.accessToken = page.access_token;
      connection.tokenExpiresAt = null;
      connection.scopes = nextScopes;
    }
  } catch (err) {
    console.warn(`[facebook] jeton de Page indisponible pour ${connection.externalAccountId} :`, (err as Error).message);
  }
  return connection.accessToken;
}

/** Cron : passe les anciennes connexions Facebook au jeton de Page, par petits lots. */
export async function upgradeFacebookPageTokens(limit = 10): Promise<{ upgraded: number }> {
  const rows = await prisma.socialConnection.findMany({
    where: { network: "FACEBOOK", status: "CONNECTED", NOT: { scopes: { contains: PAGE_TOKEN_MARKER } } },
    take: limit
  });
  let upgraded = 0;
  for (const row of rows) {
    const before = row.accessToken;
    await ensureFacebookPageToken(row);
    if (row.accessToken !== before) upgraded++;
  }
  return { upgraded };
}

function logInsightsError(network: MetaNetwork, what: string, err: unknown): null {
  console.warn(`[${network.toLowerCase()}] ${what} indisponible(s) :`, (err as Error).message);
  return null;
}

type InsightsResponse = z.output<typeof insightsSchema>;

/** Valeur d'une métrique, qu'elle soit renvoyée en série (values) ou en total (total_value). */
function insightValue(res: InsightsResponse | null, name: string): number | null {
  const m = res?.data.find((x) => x.name === name);
  const value = m?.total_value?.value ?? m?.values?.at(-1)?.value;
  return typeof value === "number" ? value : null;
}

/**
 * Commentaires reçus sur les médias Instagram les plus récents du compte
 * (scope instagram_manage_comments, déjà demandé — voir getMetaAuthUrl).
 * Deux appels en cascade car le Graph API n'expose pas d'endpoint global
 * "tous les commentaires de ce compte" : on liste d'abord les publications,
 * puis leurs commentaires un par un.
 */
async function fetchInstagramEngagement(connection: ConnectionLike): Promise<EngagementItemInput[]> {
  const media = await graph("INSTAGRAM", `/${connection.externalAccountId}/media`, connection.accessToken, {
    params: { fields: "id,permalink", limit: String(ENGAGEMENT_RECENT_POSTS) },
    schema: graphList(z.object({ id: idSchema, permalink: textSchema }))
  });

  const items: EngagementItemInput[] = [];
  for (const m of media.data) {
    const comments = await graph("INSTAGRAM", `/${m.id}/comments`, connection.accessToken, {
      params: { fields: "id,text,username,timestamp,replies{from,username,timestamp}", limit: String(ENGAGEMENT_COMMENTS_PER_POST) },
      schema: graphList(igCommentSchema)
    }).catch((err) => logInsightsError("INSTAGRAM", "commentaires", err) ?? { data: [] });

    for (const c of comments.data) {
      // Réponse du compte : même identifiant Instagram, ou même nom de compte.
      const own = (c.replies?.data ?? []).filter((r) => r.from?.id === connection.externalAccountId || sameHandle(r.from?.username ?? r.username, connection.handle));
      items.push({
        type: "COMMENT",
        externalId: c.id,
        postExternalId: m.id,
        postPermalink: m.permalink,
        authorName: c.username,
        text: c.text,
        permalink: m.permalink,
        publishedAt: toDate(c.timestamp),
        ownerRepliedAt: earliest(own.map((r) => toDate(r.timestamp) ?? new Date()))
      });
    }
  }
  return items;
}

/**
 * Métriques des publications Instagram récentes : like_count et
 * comments_count viennent directement des champs du média ; vues, partages
 * et enregistrements passent par /insights (metric=views,shares,saved —
 * « impressions » et « plays » ont été retirées par Meta en avril 2025), qui
 * n'existe que pour les comptes Business/Creator et certains types de
 * médias — en cas d'échec on garde null, jamais 0.
 */
/** Dernières publications Instagram, sans statistiques (vérification « déjà en ligne ? », lot 6). */
async function listInstagramRecentPosts(connection: ConnectionLike): Promise<RecentPost[]> {
  // Contrat strict sur la liste : une liste illisible ne doit jamais passer
  // pour « aucune publication » (sinon une relance ferait un doublon).
  const media = await graph("INSTAGRAM", `/${connection.externalAccountId}/media`, connection.accessToken, {
    params: { fields: "id,caption,permalink,timestamp", limit: "10" },
    schema: graphList(igMediaSchema)
  });
  return media.data.map((m) => ({
    externalPostId: m.id,
    text: m.caption,
    permalink: m.permalink,
    publishedAt: toDate(m.timestamp)
  }));
}

/** Dernières publications de la Page Facebook, sans statistiques (lot 6). */
async function listFacebookRecentPosts(connection: ConnectionLike): Promise<RecentPost[]> {
  const token = await ensureFacebookPageToken(connection);
  const posts = await graph("FACEBOOK", `/${connection.externalAccountId}/posts`, token, {
    params: { fields: "id,message,permalink_url,created_time", limit: "10" },
    schema: graphList(fbPostSchema)
  });
  return posts.data.map((p) => ({
    externalPostId: p.id,
    text: p.message,
    permalink: p.permalink_url,
    publishedAt: toDate(p.created_time)
  }));
}

async function fetchInstagramPostMetrics(connection: ConnectionLike): Promise<PostMetricInput[]> {
  const media = await graph("INSTAGRAM", `/${connection.externalAccountId}/media`, connection.accessToken, {
    params: { fields: "id,caption,permalink,media_type,thumbnail_url,media_url,timestamp,like_count,comments_count", limit: "15" },
    schema: graphList(igMediaSchema)
  });

  return Promise.all(
    media.data.map(async (m) => {
      const insights = await graph("INSTAGRAM", `/${m.id}/insights`, connection.accessToken, {
        params: { metric: "shares,saved,views" },
        schema: insightsSchema
      }).catch((err) => logInsightsError("INSTAGRAM", `statistiques du média ${m.id}`, err));
      return {
        postExternalId: m.id,
        title: m.caption?.slice(0, 120),
        permalink: m.permalink,
        thumbnailUrl: m.thumbnail_url ?? (m.media_type === "VIDEO" ? undefined : m.media_url),
        publishedAt: toDate(m.timestamp),
        views: insightValue(insights, "views"),
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        shares: insightValue(insights, "shares"),
        saves: insightValue(insights, "saved")
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
  const token = await ensureFacebookPageToken(connection);
  const posts = await graph("FACEBOOK", `/${connection.externalAccountId}/posts`, token, {
    params: {
      fields: "id,message,permalink_url,created_time,full_picture,shares,likes.summary(true).limit(0),comments.summary(true).limit(0)",
      limit: "15"
    },
    schema: graphList(fbPostSchema)
  });

  return posts.data.map((p) => ({
    postExternalId: p.id,
    title: p.message?.slice(0, 120),
    permalink: p.permalink_url,
    thumbnailUrl: p.full_picture,
    publishedAt: toDate(p.created_time),
    views: null,
    likes: p.likes?.summary?.total_count ?? null,
    comments: p.comments?.summary?.total_count ?? null,
    shares: p.shares?.count ?? null,
    saves: null
  }));
}

/**
 * Commentaires reçus sur les publications Facebook les plus récentes de la
 * Page (scope pages_read_engagement, déjà demandé — voir getMetaAuthUrl).
 */
async function fetchFacebookEngagement(connection: ConnectionLike): Promise<EngagementItemInput[]> {
  const token = await ensureFacebookPageToken(connection);
  const posts = await graph("FACEBOOK", `/${connection.externalAccountId}/posts`, token, {
    params: { fields: "id,permalink_url", limit: String(ENGAGEMENT_RECENT_POSTS) },
    schema: graphList(z.object({ id: idSchema, permalink_url: textSchema }))
  });

  const items: EngagementItemInput[] = [];
  for (const p of posts.data) {
    const comments = await graph("FACEBOOK", `/${p.id}/comments`, token, {
      params: { fields: "id,message,from,created_time,permalink_url,comments.limit(10){from,created_time}", limit: String(ENGAGEMENT_COMMENTS_PER_POST) },
      schema: graphList(fbCommentSchema)
    }).catch((err) => logInsightsError("FACEBOOK", "commentaires", err) ?? { data: [] });

    for (const c of comments.data) {
      const own = (c.comments?.data ?? []).filter((r) => r.from?.id === connection.externalAccountId);
      items.push({
        type: "COMMENT",
        externalId: c.id,
        postExternalId: p.id,
        postPermalink: p.permalink_url,
        authorName: c.from?.name,
        text: c.message,
        permalink: c.permalink_url ?? p.permalink_url,
        publishedAt: toDate(c.created_time),
        ownerRepliedAt: earliest(own.map((r) => toDate(r.created_time) ?? new Date()))
      });
    }
  }
  return items;
}

/**
 * Termine une publication Instagram à partir de son conteneur : attend
 * (dans la limite du temps disponible) que Meta ait traité le média, puis
 * publie. Sinon, renvoie un point de reprise : le cron réessaiera (lot 2 —
 * avant, une vidéo pas encore traitée après 2 minutes était publiée « à
 * l'aveugle » et échouait, ou la fonction était coupée par Vercel).
 */
async function finishInstagramContainer(connection: ConnectionLike, containerId: string, input: PublishInput): Promise<PublishOutcome> {
  const token = connection.accessToken;
  const state = await pollUntil(
    async () => {
      const s = await graph("INSTAGRAM", `/${containerId}`, token, {
        params: { fields: "status_code,status" },
        schema: containerStatusSchema
      });
      if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return s.status_code;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
        throw new SocialApiError("INSTAGRAM", `Instagram n'a pas pu traiter le média${s.status ? ` (${s.status})` : ""}.`, 400);
      }
      return undefined;
    },
    waitBudgetMs(input),
    3000
  );
  if (!state) return { pending: true, checkpoint: { step: "ig_container", containerId }, retryInMs: 30_000 };
  if (state === "PUBLISHED") {
    // Déjà publié par un essai précédent dont la réponse s'est perdue : on
    // ne republie surtout pas.
    return { externalPostId: containerId };
  }
  const published = await graph("INSTAGRAM", `/${connection.externalAccountId}/media_publish`, token, {
    method: "POST",
    params: { creation_id: containerId },
    schema: createdSchema
  });
  // Lien exact de la publication (l'identifiant du média n'est pas celui de l'adresse /p/…).
  const details = await graph("INSTAGRAM", `/${published.id}`, token, { params: { fields: "permalink" }, schema: permalinkSchema }).catch(
    () => ({ permalink: undefined })
  );
  return { externalPostId: published.id, externalUrl: details.permalink };
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

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishOutcome> {
    if (input.mediaUrls.length === 0) {
      throw new Error("Instagram exige au moins un média (image ou vidéo).");
    }
    const token = connection.accessToken;
    const account = connection.externalAccountId;

    // Étape 1 : créer un "media container"
    const isVideo = input.mediaType === "VIDEO";
    const params: Record<string, string | undefined> = { caption: input.caption };
    if (isVideo) {
      params.media_type = "REELS";
      params.video_url = input.mediaUrls[0];
    } else if (input.mediaUrls.length > 1) {
      // Carrousel : on crée un container "enfant" par image puis un container
      // parent de type CAROUSEL qui les référence.
      const children: string[] = [];
      for (const url of input.mediaUrls) {
        const child = await graph("INSTAGRAM", `/${account}/media`, token, {
          method: "POST",
          params: { image_url: url, is_carousel_item: "true" },
          schema: createdSchema
        });
        children.push(child.id);
      }
      params.media_type = "CAROUSEL";
      params.children = children.join(",");
    } else {
      params.image_url = input.mediaUrls[0];
    }

    // Lieu (location_id = Page Facebook du lieu). S'il est REFUSÉ par
    // Instagram (page sans adresse, identifiant invalide…), on recrée le
    // conteneur sans le lieu. Jamais sur un délai dépassé ou une erreur
    // serveur : le conteneur a peut-être été créé.
    if (input.location?.id) params.location_id = input.location.id;
    let container: { id: string };
    try {
      container = await graph("INSTAGRAM", `/${account}/media`, token, { method: "POST", params, schema: createdSchema });
    } catch (err) {
      if (!params.location_id || !(err instanceof SocialApiError) || !err.isRequestRejected) throw err;
      console.error(`[instagram] lieu ${input.location?.id} refusé, publication sans lieu :`, (err as Error).message);
      delete params.location_id;
      container = await graph("INSTAGRAM", `/${account}/media`, token, { method: "POST", params, schema: createdSchema });
    }

    // Étape 2 : attendre le traitement (vidéos surtout) puis publier.
    return finishInstagramContainer(connection, container.id, input);
  },

  async resumePublish(connection: ConnectionLike, input: PublishInput, checkpoint: PublishCheckpoint): Promise<PublishOutcome> {
    if (checkpoint.step === "ig_container" && typeof checkpoint.containerId === "string") {
      return finishInstagramContainer(connection, checkpoint.containerId, input);
    }
    throw new SocialApiError("INSTAGRAM", "Reprise de publication inconnue.");
  },

  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    const token = connection.accessToken;
    const account = connection.externalAccountId;
    const profile = await graph("INSTAGRAM", `/${account}`, token, {
      params: { fields: "followers_count,media_count" },
      schema: z.object({ followers_count: z.number(), media_count: countSchema })
    });

    // « impressions » a été retirée par Meta (avril 2025) : l'appel échouait
    // et un catch silencieux affichait 0. Remplacée par « views », qui
    // s'obtient en total (metric_type=total_value). Chaque métrique est
    // demandée séparément pour qu'une seule indisponible ne masque pas les
    // autres, et les erreurs sont journalisées.
    const reach = await graph("INSTAGRAM", `/${account}/insights`, token, {
      params: { metric: "reach", period: "day" },
      schema: insightsSchema
    }).catch((err) => logInsightsError("INSTAGRAM", "portée", err));
    const views = await graph("INSTAGRAM", `/${account}/insights`, token, {
      params: { metric: "views", period: "day", metric_type: "total_value" },
      schema: insightsSchema
    }).catch((err) => logInsightsError("INSTAGRAM", "vues", err));

    return {
      followers: profile.followers_count,
      followersDelta: 0,
      engagementRate: 0,
      impressions: insightValue(views, "views") ?? 0,
      reach: insightValue(reach, "reach") ?? 0,
      postsCount: profile.media_count ?? 0
    };
  },

  async postComment(connection, externalPostId, comment) {
    await graph("INSTAGRAM", `/${externalPostId}/comments`, connection.accessToken, { method: "POST", params: { message: comment } });
  },

  fetchEngagement: fetchInstagramEngagement,
  fetchPostMetrics: fetchInstagramPostMetrics,
  listRecentPosts: listInstagramRecentPosts
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
    const token = await ensureFacebookPageToken(connection);
    const page = connection.externalAccountId;
    const first = input.mediaUrls[0];

    // Texte seul : publication classique du fil de la Page.
    if (!first) {
      const post = await graph("FACEBOOK", `/${page}/feed`, token, { method: "POST", params: { message: input.caption }, schema: createdSchema });
      return { externalPostId: post.id, externalUrl: `https://www.facebook.com/${post.id}` };
    }

    const isVideo = input.mediaType === "VIDEO";
    const endpoint = isVideo ? "videos" : "photos";
    const params: Record<string, string | undefined> = isVideo
      ? { file_url: first, description: input.caption }
      : { url: first, caption: input.caption };
    // Lieu : paramètre « place » (Page Facebook du lieu), photos uniquement.
    // Refusé par Facebook (erreur 4xx) → on republie sans le lieu. Jamais
    // sur un délai dépassé ou une erreur serveur : la photo publiée
    // immédiatement l'aurait été deux fois.
    if (input.location?.id && !isVideo) params.place = input.location.id;
    let result: { id: string; post_id?: string };
    try {
      result = await graph("FACEBOOK", `/${page}/${endpoint}`, token, {
        method: "POST",
        params,
        timeoutMs: 60_000,
        schema: createdSchema
      });
    } catch (err) {
      if (!params.place || !(err instanceof SocialApiError) || !err.isRequestRejected) throw err;
      console.error(`[facebook] lieu ${input.location?.id} refusé, publication sans lieu :`, (err as Error).message);
      delete params.place;
      result = await graph("FACEBOOK", `/${page}/${endpoint}`, token, {
        method: "POST",
        params,
        timeoutMs: 60_000,
        schema: createdSchema
      });
    }
    const id = result.post_id ?? result.id;
    return { externalPostId: id, externalUrl: `https://www.facebook.com/${id}` };
  },

  async fetchAnalytics(connection) {
    const token = await ensureFacebookPageToken(connection);
    const page = await graph("FACEBOOK", `/${connection.externalAccountId}`, token, {
      params: { fields: "followers_count,fan_count" },
      schema: z.object({ id: opt(idSchema), followers_count: countSchema, fan_count: countSchema })
    });
    // Vues des contenus de la Page (page_media_view remplace les
    // « impressions » retirées par Meta le 15/11/2025).
    const views = await graph("FACEBOOK", `/${connection.externalAccountId}/insights`, token, {
      params: { metric: "page_media_view", period: "day" },
      schema: insightsSchema
    }).catch((err) => logInsightsError("FACEBOOK", "vues de la Page", err));
    return {
      followers: page.followers_count ?? page.fan_count ?? 0,
      followersDelta: 0,
      engagementRate: 0,
      impressions: insightValue(views, "page_media_view") ?? 0,
      reach: 0,
      postsCount: 0
    };
  },

  async postComment(connection, externalPostId, comment) {
    const token = await ensureFacebookPageToken(connection);
    await graph("FACEBOOK", `/${externalPostId}/comments`, token, { method: "POST", params: { message: comment } });
  },

  fetchEngagement: fetchFacebookEngagement,
  fetchPostMetrics: fetchFacebookPostMetrics,
  listRecentPosts: listFacebookRecentPosts
};
