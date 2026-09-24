// Intégration Bluesky (25/09/2026) — protocole AT, API publique et gratuite,
// sans validation d'application ni clé développeur.
//
// Connexion : pas d'OAuth ici, mais un « mot de passe d'application » créé
// par la personne dans Bluesky (Paramètres → Confidentialité et sécurité →
// Mots de passe d'application). Nebula ne le conserve PAS : il sert une
// seule fois à ouvrir une session (voir /api/social/bluesky/connect), puis on
// garde uniquement les jetons de session — accessJwt (quelques heures) dans
// accessToken, refreshJwt (plusieurs semaines, renouvelé à chaque
// rafraîchissement) dans refreshToken. Le serveur de données (PDS) du
// compte est retenu dans `scopes` sous la forme « pds=https://… ».
//
// Publication : texte (300 caractères) + jusqu'à 4 images (1 Mo chacune),
// liens, hashtags et mentions rendus cliquables. La vidéo n'est pas encore
// branchée (elle passe par un service d'encodage séparé côté Bluesky).
import { prisma } from "@/lib/prisma";
import type { AnalyticsResult, PublishResult } from "@/lib/types";
import {
  SocialApiError,
  type ConnectionLike,
  type EngagementItemInput,
  type OAuthTokenResult,
  type PostMetricInput,
  type PublishInput,
  type SocialClient
} from "./base";

const ENTRYWAY = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 1_000_000;

// --- Petits outils ---------------------------------------------------------

async function xrpc<T>(base: string, method: string, init: { query?: Record<string, string | string[]>; body?: unknown; token?: string; raw?: { data: ArrayBuffer; mime: string }; post?: boolean } = {}): Promise<T> {
  const url = new URL(`${base}/xrpc/${method}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, item);
  }
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let body: BodyInit | undefined;
  if (init.raw) {
    headers["Content-Type"] = init.raw.mime;
    body = init.raw.data;
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(url, { method: init.post || init.body !== undefined || init.raw ? "POST" : "GET", headers, body, cache: "no-store" });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const err = json as { error?: string; message?: string } | undefined;
    const code = err?.error ?? "";
    const message =
      code === "ExpiredToken" || code === "InvalidToken"
        ? "Session Bluesky expirée : reconnectez le compte."
        : method === "com.atproto.server.createSession" && (code === "AuthenticationRequired" || res.status === 401)
          ? "Identifiant ou mot de passe d'application Bluesky incorrect."
          : res.status === 401
            ? "Session Bluesky expirée : reconnectez le compte."
            : err?.message || code || res.statusText;
    throw new SocialApiError("BLUESKY", message, res.status, json);
  }
  return json as T;
}

function pdsOf(connection: { scopes?: string | null }): string {
  const match = /(?:^|\s)pds=(\S+)/.exec(connection.scopes ?? "");
  return match?.[1] ?? ENTRYWAY;
}

/** Date d'expiration (claim exp) d'un JWT, sans vérifier la signature. */
function jwtExpiry(jwt: string): Date | undefined {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: number };
    return payload.exp ? new Date(payload.exp * 1000) : undefined;
  } catch {
    return undefined;
  }
}

interface SessionResult {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

/** Trouve le serveur de données (PDS) d'un compte à partir de son pseudo. */
async function resolvePds(identifier: string): Promise<string> {
  if (identifier.includes("@") || !identifier.includes(".")) return ENTRYWAY;
  try {
    const { did } = await xrpc<{ did: string }>(APPVIEW, "com.atproto.identity.resolveHandle", { query: { handle: identifier } });
    const docUrl = did.startsWith("did:web:") ? `https://${did.slice("did:web:".length)}/.well-known/did.json` : `https://plc.directory/${did}`;
    const res = await fetch(docUrl, { cache: "no-store" });
    if (!res.ok) return ENTRYWAY;
    const doc = (await res.json()) as { service?: { id: string; type: string; serviceEndpoint: string }[] };
    const pds = doc.service?.find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer")?.serviceEndpoint;
    return pds?.replace(/\/$/, "") || ENTRYWAY;
  } catch {
    return ENTRYWAY;
  }
}

/**
 * Ouvre une session avec un mot de passe d'application et renvoie de quoi
 * créer la connexion (voir upsertConnection). Le mot de passe n'est jamais
 * stocké.
 */
export async function connectWithAppPassword(identifierRaw: string, appPassword: string): Promise<OAuthTokenResult> {
  const identifier = identifierRaw.trim().replace(/^@/, "");
  const pds = await resolvePds(identifier);
  const session = await xrpc<SessionResult>(pds, "com.atproto.server.createSession", { body: { identifier, password: appPassword.trim() } });
  const profile = await xrpc<{ displayName?: string; avatar?: string; handle: string }>(APPVIEW, "app.bsky.actor.getProfile", { query: { actor: session.did } }).catch(() => null);
  return {
    accessToken: session.accessJwt,
    refreshToken: session.refreshJwt,
    // Date affichée dans la page Comptes : celle du jeton de
    // rafraîchissement, repoussée à chaque utilisation.
    expiresAt: jwtExpiry(session.refreshJwt),
    externalAccountId: session.did,
    displayName: profile?.displayName || session.handle,
    handle: `@${session.handle}`,
    avatarUrl: profile?.avatar,
    scopes: `atproto pds=${pds}`
  };
}

type BlueskyConnection = ConnectionLike & { scopes?: string | null };

/** Jeton d'accès valide pour ce compte (rafraîchi et enregistré si besoin). */
async function accessTokenFor(connection: BlueskyConnection): Promise<string> {
  const exp = jwtExpiry(connection.accessToken);
  if (exp && exp.getTime() - Date.now() > 5 * 60_000) return connection.accessToken;
  if (!connection.refreshToken) throw new SocialApiError("BLUESKY", "Session Bluesky expirée : reconnectez le compte.", 401);
  // refreshSession : POST sans corps, authentifié par le jeton de rafraîchissement.
  const session = await xrpc<SessionResult>(pdsOf(connection), "com.atproto.server.refreshSession", { token: connection.refreshToken, post: true });
  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: { accessToken: session.accessJwt, refreshToken: session.refreshJwt, tokenExpiresAt: jwtExpiry(session.refreshJwt) ?? null, status: "CONNECTED", lastError: null }
  });
  connection.accessToken = session.accessJwt;
  connection.refreshToken = session.refreshJwt;
  return session.accessJwt;
}

// --- Images : Bluesky refuse tout fichier de plus de 1 Mo ------------------

/**
 * Réduit l'image (dimensions puis qualité JPEG) jusqu'à passer sous 1 Mo,
 * pour que les photos de téléphone passent sans que la personne ait à les
 * retoucher. Les images déjà légères sont envoyées telles quelles.
 */
async function fitImage(data: ArrayBuffer, mime: string): Promise<{ data: ArrayBuffer; mime: string }> {
  if (data.byteLength <= MAX_IMAGE_BYTES) return { data, mime };
  const sharp = (await import("sharp")).default;
  for (const [width, quality] of [
    [2000, 85],
    [1600, 80],
    [1280, 75],
    [1000, 70]
  ] as const) {
    const out = await sharp(Buffer.from(data)).rotate().resize({ width, height: width, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.byteLength <= MAX_IMAGE_BYTES) {
      return { data: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer, mime: "image/jpeg" };
    }
  }
  throw new SocialApiError("BLUESKY", "Image trop lourde pour Bluesky (1 Mo maximum par image), même après réduction.");
}

// --- Texte enrichi (liens, hashtags, mentions) -------------------------------

interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Record<string, string>[];
}

const encoder = new TextEncoder();

function byteRange(text: string, start: number, end: number) {
  return { byteStart: encoder.encode(text.slice(0, start)).length, byteEnd: encoder.encode(text.slice(0, end)).length };
}

async function buildFacets(text: string): Promise<Facet[]> {
  const facets: Facet[] = [];
  const urlRe = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;
  for (const m of Array.from(text.matchAll(urlRe))) {
    facets.push({ index: byteRange(text, m.index!, m.index! + m[0].length), features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
  }
  const tagRe = /(^|\s)#([\p{L}\p{N}_]{1,64})/gu;
  for (const m of Array.from(text.matchAll(tagRe))) {
    const start = m.index! + m[1].length;
    facets.push({ index: byteRange(text, start, start + m[2].length + 1), features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }] });
  }
  const mentionRe = /(^|\s)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  for (const m of Array.from(text.matchAll(mentionRe))) {
    try {
      const { did } = await xrpc<{ did: string }>(APPVIEW, "com.atproto.identity.resolveHandle", { query: { handle: m[2] } });
      const start = m.index! + m[1].length;
      facets.push({ index: byteRange(text, start, start + m[2].length + 1), features: [{ $type: "app.bsky.richtext.facet#mention", did }] });
    } catch {
      // Pseudo inconnu : laissé en texte simple.
    }
  }
  return facets;
}

// --- Client ----------------------------------------------------------------

function postUrl(handle: string | null | undefined, did: string, uri: string): string {
  const rkey = uri.split("/").pop() ?? "";
  const who = handle ? handle.replace(/^@/, "") : did;
  return `https://bsky.app/profile/${who}/post/${rkey}`;
}

interface FeedPost {
  uri: string;
  cid: string;
  author: { did: string; handle: string };
  record: { text?: string; createdAt?: string };
  embed?: { images?: { thumb?: string }[]; thumbnail?: string };
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  quoteCount?: number;
  indexedAt?: string;
}

async function recentOwnPosts(did: string, limit = 30): Promise<FeedPost[]> {
  const feed = await xrpc<{ feed: { post: FeedPost; reason?: unknown }[] }>(APPVIEW, "app.bsky.feed.getAuthorFeed", {
    query: { actor: did, limit: String(limit), filter: "posts_no_replies" }
  });
  return feed.feed.filter((f) => !f.reason && f.post.author.did === did).map((f) => f.post);
}

export const blueskyClient: SocialClient = {
  network: "BLUESKY",

  getAuthUrl() {
    throw new Error("Bluesky se connecte avec un mot de passe d'application, depuis la page Comptes.");
  },

  async exchangeCodeForToken() {
    throw new Error("Bluesky se connecte avec un mot de passe d'application, depuis la page Comptes.");
  },

  async publishPost(connection: BlueskyConnection, input: PublishInput): Promise<PublishResult> {
    const token = await accessTokenFor(connection);
    const pds = pdsOf(connection);
    const did = connection.externalAccountId;
    const text = input.caption.trim();
    const graphemes = Array.from(new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(text)).length;
    if (graphemes > 300) {
      throw new SocialApiError(
        "BLUESKY",
        `Texte trop long pour Bluesky (${graphemes} caractères, 300 maximum) : utilisez « Personnaliser pour Bluesky » dans Publier pour une version plus courte.`
      );
    }

    if (input.mediaType === "VIDEO" && input.mediaUrls.length > 0) {
      throw new SocialApiError("BLUESKY", "La vidéo n'est pas encore prise en charge pour Bluesky dans Nebula : publiez des images ou du texte.");
    }

    let embed: Record<string, unknown> | undefined;
    const imageUrls = input.mediaUrls.slice(0, MAX_IMAGES);
    if (imageUrls.length > 0) {
      const images = [];
      for (const url of imageUrls) {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new SocialApiError("BLUESKY", `Image inaccessible (${res.status}).`);
        const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
        const fitted = await fitImage(await res.arrayBuffer(), mime);
        const { blob } = await xrpc<{ blob: unknown }>(pds, "com.atproto.repo.uploadBlob", { token, raw: fitted });
        images.push({ alt: "", image: blob });
      }
      embed = { $type: "app.bsky.embed.images", images };
    }

    const facets = await buildFacets(text);
    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      langs: ["fr"],
      ...(facets.length ? { facets } : {}),
      ...(embed ? { embed } : {}),
      // Étiquette « contenu généré par IA » : pas d'équivalent officiel sur
      // Bluesky, rien n'est ajouté.
    };

    const created = await xrpc<{ uri: string; cid: string }>(pds, "com.atproto.repo.createRecord", {
      token,
      body: { repo: did, collection: "app.bsky.feed.post", record }
    });
    const handle = (await prisma.socialConnection.findUnique({ where: { id: connection.id }, select: { handle: true } }).catch(() => null))?.handle;
    return { externalPostId: created.uri, externalUrl: postUrl(handle, did, created.uri) };
  },

  async postComment(connection: BlueskyConnection, externalPostId: string, comment: string) {
    const token = await accessTokenFor(connection);
    const { posts } = await xrpc<{ posts: { uri: string; cid: string }[] }>(APPVIEW, "app.bsky.feed.getPosts", { query: { uris: [externalPostId] } });
    const parent = posts[0];
    if (!parent) throw new SocialApiError("BLUESKY", "Publication introuvable pour ajouter le commentaire.");
    const facets = await buildFacets(comment);
    await xrpc(pdsOf(connection), "com.atproto.repo.createRecord", {
      token,
      body: {
        repo: connection.externalAccountId,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text: comment.trim(),
          createdAt: new Date().toISOString(),
          langs: ["fr"],
          reply: { root: { uri: parent.uri, cid: parent.cid }, parent: { uri: parent.uri, cid: parent.cid } },
          ...(facets.length ? { facets } : {})
        }
      }
    });
  },

  async fetchAnalytics(connection: BlueskyConnection): Promise<AnalyticsResult> {
    // Vérifie au passage que la session est toujours valide (sinon l'erreur
    // remonte et la page Comptes invite à reconnecter).
    await accessTokenFor(connection);
    const profile = await xrpc<{ followersCount?: number; postsCount?: number }>(APPVIEW, "app.bsky.actor.getProfile", { query: { actor: connection.externalAccountId } });
    const posts = await recentOwnPosts(connection.externalAccountId, 30).catch(() => [] as FeedPost[]);
    const followers = profile.followersCount ?? 0;
    const interactions = posts.reduce((sum, p) => sum + (p.likeCount ?? 0) + (p.replyCount ?? 0) + (p.repostCount ?? 0) + (p.quoteCount ?? 0), 0);
    const engagementRate = followers > 0 && posts.length > 0 ? Math.round((interactions / posts.length / followers) * 10000) / 100 : 0;
    return {
      followers,
      followersDelta: 0,
      engagementRate,
      // Bluesky n'expose ni impressions ni portée.
      impressions: 0,
      reach: 0,
      postsCount: profile.postsCount ?? 0,
      raw: { source: "bluesky", sampledPosts: posts.length }
    };
  },

  async fetchPostMetrics(connection: BlueskyConnection): Promise<PostMetricInput[]> {
    const handle = (await prisma.socialConnection.findUnique({ where: { id: connection.id }, select: { handle: true } }).catch(() => null))?.handle;
    const posts = await recentOwnPosts(connection.externalAccountId, 30);
    return posts.map((p) => ({
      postExternalId: p.uri,
      title: (p.record.text ?? "").split("\n")[0].slice(0, 120),
      permalink: postUrl(handle, connection.externalAccountId, p.uri),
      thumbnailUrl: p.embed?.images?.[0]?.thumb ?? p.embed?.thumbnail,
      publishedAt: p.record.createdAt ? new Date(p.record.createdAt) : undefined,
      views: null,
      likes: p.likeCount ?? 0,
      comments: p.replyCount ?? 0,
      shares: (p.repostCount ?? 0) + (p.quoteCount ?? 0),
      saves: null
    }));
  },

  async fetchEngagement(connection: BlueskyConnection): Promise<EngagementItemInput[]> {
    const handle = (await prisma.socialConnection.findUnique({ where: { id: connection.id }, select: { handle: true } }).catch(() => null))?.handle;
    const posts = (await recentOwnPosts(connection.externalAccountId, 10)).filter((p) => (p.replyCount ?? 0) > 0);
    const items: EngagementItemInput[] = [];
    for (const post of posts) {
      const thread = await xrpc<{ thread: { replies?: { post?: FeedPost & { author: { did: string; handle: string; displayName?: string; avatar?: string } } }[] } }>(
        APPVIEW,
        "app.bsky.feed.getPostThread",
        { query: { uri: post.uri, depth: "1" } }
      ).catch(() => null);
      for (const reply of thread?.thread.replies ?? []) {
        const r = reply.post;
        if (!r || r.author.did === connection.externalAccountId) continue;
        items.push({
          type: "COMMENT",
          externalId: r.uri,
          postExternalId: post.uri,
          postPermalink: postUrl(handle, connection.externalAccountId, post.uri),
          authorName: r.author.displayName || `@${r.author.handle}`,
          authorAvatarUrl: r.author.avatar,
          text: r.record.text,
          permalink: postUrl(r.author.handle, r.author.did, r.uri),
          publishedAt: r.record.createdAt ? new Date(r.record.createdAt) : undefined
        });
      }
    }
    return items;
  }
};
