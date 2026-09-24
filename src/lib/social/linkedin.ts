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
import type { AnalyticsResult, PublishResult } from "@/lib/types";
import { oauthRedirectUri } from "@/lib/network-availability";
import { SocialApiError, fetchJson, type ConnectionLike, type OAuthTokenResult, type PublishInput, type SocialClient } from "./base";

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
 * retire les versions au bout d'environ un an : par défaut, on prend le mois
 * d'il y a deux mois, toujours publié et jamais retiré. LINKEDIN_API_VERSION
 * permet de la figer si besoin.
 */
function apiVersion(): string {
  if (process.env.LINKEDIN_API_VERSION) return process.env.LINKEDIN_API_VERSION;
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function restHeaders(token: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": apiVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

async function rest(path: string, token: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<Response> {
  const res = await fetch(`${REST}${path}`, {
    method: init.method ?? "GET",
    headers: restHeaders(token),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const json = JSON.parse(text) as { message?: string };
      if (json.message) message = json.message;
    } catch {
      // réponse non JSON
    }
    if (res.status === 401) message = "Connexion LinkedIn expirée : reconnectez le compte.";
    throw new SocialApiError("LINKEDIN", message, res.status);
  }
  return res;
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

async function download(url: string): Promise<{ bytes: ArrayBuffer; type: string }> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new SocialApiError("LINKEDIN", `Média inaccessible (${res.status}).`);
  return { bytes: await res.arrayBuffer(), type: res.headers.get("content-type") || "application/octet-stream" };
}

async function uploadImage(token: string, owner: string, url: string): Promise<string> {
  const init = (await (await rest("/images?action=initializeUpload", token, { method: "POST", body: { initializeUploadRequest: { owner } } })).json()) as {
    value: { uploadUrl: string; image: string };
  };
  const { bytes, type } = await download(url);
  const put = await fetch(init.value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": type }, body: bytes });
  if (!put.ok) throw new SocialApiError("LINKEDIN", `Envoi de l'image refusé (${put.status}).`);
  return init.value.image;
}

async function uploadVideo(token: string, owner: string, url: string): Promise<string> {
  const { bytes } = await download(url);
  const init = (await (
    await rest("/videos?action=initializeUpload", token, {
      method: "POST",
      body: { initializeUploadRequest: { owner, fileSizeBytes: bytes.byteLength, uploadCaptions: false, uploadThumbnail: false } }
    })
  ).json()) as { value: { video: string; uploadToken?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } };

  const etags: string[] = [];
  for (const part of init.value.uploadInstructions) {
    const chunk = bytes.slice(part.firstByte, part.lastByte + 1);
    const put = await fetch(part.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
    if (!put.ok) throw new SocialApiError("LINKEDIN", `Envoi de la vidéo refusé (${put.status}).`);
    etags.push(put.headers.get("etag") ?? "");
  }
  await rest("/videos?action=finalizeUpload", token, {
    method: "POST",
    body: { finalizeUploadRequest: { video: init.value.video, uploadToken: init.value.uploadToken ?? "", uploadedPartIds: etags } }
  });
  for (let i = 0; i < 60; i++) {
    const status = (await (await rest(`/videos/${encodeURIComponent(init.value.video)}`, token)).json()) as { status?: string };
    if (status.status === "AVAILABLE") return init.value.video;
    if (status.status === "PROCESSING_FAILED") throw new SocialApiError("LINKEDIN", "LinkedIn n'a pas pu traiter la vidéo.");
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new SocialApiError("LINKEDIN", "LinkedIn met trop de temps à traiter la vidéo : réessayez dans quelques minutes.");
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
    const token = await fetchJson<{ access_token: string; expires_in: number; refresh_token?: string; scope?: string }>("LINKEDIN", TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        client_id: requireEnv("LINKEDIN_CLIENT_ID"),
        client_secret: requireEnv("LINKEDIN_CLIENT_SECRET")
      })
    });
    const me = await fetchJson<{ sub: string; name?: string; given_name?: string; family_name?: string; picture?: string }>(
      "LINKEDIN",
      "https://api.linkedin.com/v2/userinfo",
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    const name = me.name || [me.given_name, me.family_name].filter(Boolean).join(" ") || "Profil LinkedIn";
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      externalAccountId: me.sub,
      displayName: name,
      avatarUrl: me.picture,
      scopes: token.scope || SCOPES.join(" ")
    } satisfies OAuthTokenResult;
  },

  async publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishResult> {
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
      content = { media: { id: video, ...(input.title ? { title: input.title.slice(0, 200) } : {}) } };
    } else if (media.length === 1) {
      content = { media: { id: await uploadImage(token, author, media[0]), altText: "" } };
    } else if (media.length > 1) {
      const images: { id: string; altText: string }[] = [];
      for (const url of media.filter((u) => !isVideoUrl(u, "IMAGE")).slice(0, 20)) images.push({ id: await uploadImage(token, author, url), altText: "" });
      content = images.length > 1 ? { multiImage: { images } } : { media: images[0] };
    }

    const res = await rest("/posts", token, {
      method: "POST",
      body: {
        author,
        commentary: toLinkedInCommentary(text),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
        ...(content ? { content } : {})
      }
    });
    const urn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
    if (!urn) throw new SocialApiError("LINKEDIN", "LinkedIn n'a pas renvoyé l'identifiant du post.");
    return { externalPostId: urn, externalUrl: `https://www.linkedin.com/feed/update/${urn}/` };
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
