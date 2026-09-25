// Intégration LinkedIn (lot 2, 25/09/2026) — profils personnels, API
// officielle gratuite. Doc : https://learn.microsoft.com/linkedin/
//
// Prérequis (côté Lucas) : créer une app sur linkedin.com/developers (elle
// doit être rattachée à une Page LinkedIn, par exemple une page « Nebula »),
// ajouter les produits « Sign In with LinkedIn using OpenID Connect » et
// « Share on LinkedIn » (accordés sans validation), déclarer l'URL de retour
// <site>/api/connections/linkedin/callback et renseigner LINKEDIN_CLIENT_ID /
// LINKEDIN_CLIENT_SECRET.
//
// Limites de l'accès gratuit : publication sur son propre profil (texte,
// images, vidéo) et premier commentaire. Ni abonnés ni statistiques de
// profil (voir NETWORK_META.LINKEDIN.statsAvailable). Les Pages entreprise
// demandent la Community Management API (validation LinkedIn) : plus tard,
// pour les paliers Pro et Agence. Jeton valable 60 jours, sans
// rafraîchissement : la page Comptes prévient avant l'expiration.
import type { ZodType, ZodTypeDef } from "zod";
import type { AnalyticsResult, PublishResult } from "@/lib/types";
import { oauthRedirectUri } from "@/lib/network-availability";
import {
  SocialApiError,
  checkShape,
  downloadMedia,
  errorFromResponse,
  fetchJson,
  readBody,
  sendRequest,
  throwUnexpected,
  pollUntil,
  waitBudgetMs,
  type ConnectionLike,
  type OAuthTokenResult,
  type PublishCheckpoint,
  type PublishInput,
  type PublishOutcome,
  type SocialClient
} from "./base";
import { endpointLabel, opt, soft, textSchema, z } from "./contract";
import { linkedinApiVersion } from "./versions";

// --- Contrats des réponses (lot 7, voir contract.ts) -------------------------
// Doc : https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
//       https://learn.microsoft.com/linkedin/marketing/community-management/shares/images-api
//       https://learn.microsoft.com/linkedin/marketing/community-management/shares/videos-api
// Réponses types : tests/contracts/fixtures/linkedin.
const imageInitSchema = z.object({ value: z.object({ uploadUrl: z.string().url(), image: z.string().min(1) }) });
const videoInitSchema = z.object({
  value: z.object({
    video: z.string().min(1),
    uploadToken: textSchema,
    uploadInstructions: z.array(z.object({ uploadUrl: z.string().url(), firstByte: z.number().int(), lastByte: z.number().int() })).min(1)
  })
});
const videoStatusSchema = z.object({ status: z.string() });

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const REST = "https://api.linkedin.com/rest";
const SCOPES = ["openid", "profile", "w_member_social"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant. Voir .env.example (section LinkedIn).`);
  return value;
}

const redirectUri = () => oauthRedirectUri("linkedin", "LINKEDIN_REDIRECT_URI");

/**
 * Version de l'API REST (en-tête LinkedIn-Version, format AAAAMM). LinkedIn
 * retire les versions au bout d'environ un an. LINKEDIN_API_VERSION permet
 * de la changer sans toucher au code.
 */
// Lot 2 : version FIXE (voir social/versions.ts) au lieu de « il y a deux
// mois », qui changeait toute seule chaque mois sans avoir été testée.
function apiVersion(): string {
  return linkedinApiVersion();
}

function restHeaders(token: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": apiVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

/**
 * Appel à l'API REST de LinkedIn par la porte commune (lot 7) : délai
 * garanti (avant : aucun, la fonction pouvait attendre jusqu'à être coupée)
 * et absence de réponse classée. Renvoie la réponse OK (en-têtes utiles :
 * x-restli-id) ; lève une SocialApiError sinon.
 */
async function rest(path: string, token: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const res = await sendRequest("LINKEDIN", `${REST}${path}`, {
    method,
    headers: restHeaders(token),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store"
  });
  if (!res.ok) {
    const { text, json } = await readBody("LINKEDIN", res, method);
    if (res.status === 401) throw new SocialApiError("LINKEDIN", "Connexion LinkedIn expirée : reconnectez le compte.", 401, json);
    throw errorFromResponse("LINKEDIN", res, text, json);
  }
  return res;
}

/** Appel REST dont la réponse JSON est vérifiée par son contrat. */
async function restJson<T>(path: string, token: string, schema: ZodType<T, ZodTypeDef, unknown>, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const res = await rest(path, token, init);
  const { json } = await readBody("LINKEDIN", res, method);
  return checkShape("LINKEDIN", schema, json, endpointLabel(method, `${REST}${path}`), res.status);
}

function checkExpiry(connection: ConnectionLike) {
  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() < Date.now()) {
    throw new SocialApiError("LINKEDIN", "Connexion LinkedIn expirée : reconnectez le compte.", 401);
  }
}

const personUrn = (connection: ConnectionLike) => `urn:li:person:${connection.externalAccountId}`;

/**
 * Texte au format LinkedIn (« little text ») : les caractères réservés sont
 * échappés, et les #hashtags deviennent de vrais hashtags cliquables.
 */
export function toLinkedInCommentary(text: string): string {
  const parts = text.split(/(#[\p{L}\p{N}_]+)/u);
  return parts
    .map((part) => {
      if (/^#[\p{L}\p{N}_]+$/u.test(part)) return `{hashtag|\\#|${part.slice(1)}}`;
      return part.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
    })
    .join("");
}

/** Envoi d'un fichier vers l'adresse fournie par LinkedIn (rien n'est encore publié). */
async function putFile(url: string, headers: Record<string, string>, body: ArrayBuffer): Promise<Response> {
  const put = await sendRequest("LINKEDIN", url, { method: "PUT", headers, body, timeoutMs: 50_000 });
  if (!put.ok) {
    const { text, json } = await readBody("LINKEDIN", put, "PUT");
    throw errorFromResponse("LINKEDIN", put, text, json);
  }
  return put;
}

async function uploadImage(token: string, owner: string, url: string): Promise<string> {
  const init = await restJson("/images?action=initializeUpload", token, imageInitSchema, { method: "POST", body: { initializeUploadRequest: { owner } } });
  const { bytes, type } = await downloadMedia("LINKEDIN", url);
  await putFile(init.value.uploadUrl, { Authorization: `Bearer ${token}`, "Content-Type": type }, bytes);
  return init.value.image;
}

async function uploadVideo(token: string, owner: string, url: string): Promise<string> {
  const { bytes } = await downloadMedia("LINKEDIN", url);
  const init = await restJson("/videos?action=initializeUpload", token, videoInitSchema, {
    method: "POST",
    body: { initializeUploadRequest: { owner, fileSizeBytes: bytes.byteLength, uploadCaptions: false, uploadThumbnail: false } }
  });

  const etags: string[] = [];
  for (const part of init.value.uploadInstructions) {
    const chunk = bytes.slice(part.firstByte, part.lastByte + 1);
    const put = await putFile(part.uploadUrl, { "Content-Type": "application/octet-stream" }, chunk);
    etags.push(put.headers.get("etag") ?? "");
  }
  await rest("/videos?action=finalizeUpload", token, {
    method: "POST",
    body: { finalizeUploadRequest: { video: init.value.video, uploadToken: init.value.uploadToken ?? "", uploadedPartIds: etags } }
  });
  return init.value.video;
}

/**
 * Attend (dans la limite du temps disponible) que LinkedIn ait traité la
 * vidéo, puis publie le post. Sinon : point de reprise pour le cron (lot 2 —
 * avant, l'attente pouvait durer 5 minutes dans une requête coupée par Vercel).
 */
async function finishLinkedInVideo(connection: ConnectionLike, video: string, input: PublishInput): Promise<PublishOutcome> {
  const token = connection.accessToken;
  const ready = await pollUntil(
    async () => {
      const status = await restJson(`/videos/${encodeURIComponent(video)}`, token, videoStatusSchema);
      if (status.status === "AVAILABLE") return true;
      if (status.status === "PROCESSING_FAILED") throw new SocialApiError("LINKEDIN", "LinkedIn n'a pas pu traiter la vidéo.", 400);
      return undefined;
    },
    waitBudgetMs(input),
    4000
  );
  if (!ready) return { pending: true, checkpoint: { step: "linkedin_video", video }, retryInMs: 30_000 };
  return createLinkedInPost(connection, input, { media: { id: video, ...(input.title ? { title: input.title.slice(0, 200) } : {}) } });
}

async function createLinkedInPost(connection: ConnectionLike, input: PublishInput, content: Record<string, unknown> | undefined): Promise<PublishResult> {
  const res = await rest("/posts", connection.accessToken, {
    method: "POST",
    body: {
      author: personUrn(connection),
      commentary: toLinkedInCommentary(input.caption.trim()),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {})
    }
  });
  const urn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
  // Réponse « créé » sans identifiant : le post est PROBABLEMENT en ligne.
  // Avant le lot 7, classé « contenu refusé » (et donc relancé à la main,
  // en doublon) ; maintenant « réponse inattendue » : à vérifier d'abord.
  if (!urn) throwUnexpected("LINKEDIN", "réponse dans un format inattendu (POST api.linkedin.com/rest/posts : en-tête « x-restli-id » absent).", res.status);
  return { externalPostId: urn, externalUrl: `https://www.linkedin.com/feed/update/${urn}/` };
}

function isVideoUrl(url: string, fallback: "VIDEO" | "IMAGE"): boolean {
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)) return true;
  if (/\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(url)) return false;
  return fallback === "VIDEO";
}

export const linkedinClient: SocialClient = {
  network: "LINKEDIN",

  getAuthUrl(state) {
    const url = new URL(AUTH_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", requireEnv("LINKEDIN_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCodeForToken(code) {
    const token = await fetchJson("LINKEDIN", TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        client_id: requireEnv("LINKEDIN_CLIENT_ID"),
        client_secret: requireEnv("LINKEDIN_CLIENT_SECRET")
      }),
      schema: z.object({ access_token: z.string().min(1), expires_in: soft(z.number()), refresh_token: opt(z.string().min(1)), scope: textSchema })
    });
    const me = await fetchJson("LINKEDIN", "https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      schema: z.object({ sub: z.string().min(1), name: textSchema, given_name: textSchema, family_name: textSchema, picture: textSchema })
    });
    const name = me.name || [me.given_name, me.family_name].filter(Boolean).join(" ") || "Profil LinkedIn";
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 60 * 86_400) * 1000),
      externalAccountId: me.sub,
      displayName: name,
      avatarUrl: me.picture,
      scopes: token.scope || SCOPES.join(" ")
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishOutcome> {
    checkExpiry(connection);
    const token = connection.accessToken;
    const author = personUrn(connection);
    const text = input.caption.trim();
    if (text.length > 3000) {
      throw new SocialApiError("LINKEDIN", `Texte trop long pour LinkedIn (${text.length} caractères, 3 000 maximum) : utilisez « Personnaliser pour LinkedIn » dans Publier.`);
    }

    let content: Record<string, unknown> | undefined;
    const media = input.mediaUrls;
    if (media.length > 0 && isVideoUrl(media[0], input.mediaType)) {
      const video = await uploadVideo(token, author, media[0]);
      return finishLinkedInVideo(connection, video, input);
    } else if (media.length === 1) {
      content = { media: { id: await uploadImage(token, author, media[0]), altText: "" } };
    } else if (media.length > 1) {
      const images: { id: string; altText: string }[] = [];
      for (const url of media.filter((u) => !isVideoUrl(u, "IMAGE")).slice(0, 20)) images.push({ id: await uploadImage(token, author, url), altText: "" });
      content = images.length > 1 ? { multiImage: { images } } : { media: images[0] };
    }
    return createLinkedInPost(connection, input, content);
  },

  async resumePublish(connection: ConnectionLike, input: PublishInput, checkpoint: PublishCheckpoint): Promise<PublishOutcome> {
    checkExpiry(connection);
    if (checkpoint.step === "linkedin_video" && typeof checkpoint.video === "string") {
      return finishLinkedInVideo(connection, checkpoint.video, input);
    }
    throw new SocialApiError("LINKEDIN", "Reprise de publication inconnue.");
  },

  async postComment(connection: ConnectionLike, externalPostId: string, comment: string) {
    checkExpiry(connection);
    await rest(`/socialActions/${encodeURIComponent(externalPostId)}/comments`, connection.accessToken, {
      method: "POST",
      body: { actor: personUrn(connection), object: externalPostId, message: { text: comment.trim() } }
    });
  },

  // L'accès gratuit ne donne pas les statistiques d'un profil personnel :
  // la synchro Analytics ignore LinkedIn (NETWORK_META.LINKEDIN.statsAvailable).
  async fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult> {
    checkExpiry(connection);
    return { followers: 0, followersDelta: 0, engagementRate: 0, impressions: 0, reach: 0, postsCount: 0, raw: { source: "linkedin", available: false } };
  }
};
