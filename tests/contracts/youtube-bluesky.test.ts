// Contrats YouTube et Bluesky — lot 7.
// Réponses types d'après la documentation officielle :
//  - YouTube : https://developers.google.com/youtube/v3/docs (channels, playlistItems,
//    videos, commentThreads), https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol,
//    https://developers.google.com/youtube/analytics/reference/reports/query
//  - Bluesky : https://docs.bsky.app/docs/api/ (createSession, uploadBlob, createRecord,
//    getAuthorFeed, getProfile)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Base factice : seul le pseudo Bluesky est lu (lien des publications).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialConnection: {
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async (args: { select?: { handle?: boolean } }) => (args?.select?.handle ? { handle: "@cafe-nebula.bsky.social" } : null))
    }
  }
}));

import { SocialApiError, UNEXPECTED_RESPONSE, type ConnectionLike, type PublishInput } from "@/lib/social/base";
import { blueskyClient, connectWithAppPassword } from "@/lib/social/bluesky";
import { classifyProviderError } from "@/lib/social/errors";
import { fetchRecentVideos, fetchRetention, freshYoutubeToken, youtubeClient } from "@/lib/social/youtube";
import { fixture, fixtureText, installNetwork, without, type Route } from "./harness";

const YT = "www.googleapis.com/youtube/v3";
const ACCESS_JWT = JSON.parse(fixtureText("bluesky/create-session")).accessJwt as string;

const yt = (over: Partial<ConnectionLike> = {}): ConnectionLike => ({
  id: "c-yt",
  externalAccountId: "UCabcdefghijklmnopqrstuv",
  accessToken: "ya29.actuel",
  refreshToken: "1//0exemple",
  tokenExpiresAt: new Date(Date.now() + 3_600_000),
  ...over
});
const bsky = (): ConnectionLike => ({
  id: "c-bsky",
  externalAccountId: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  accessToken: ACCESS_JWT,
  refreshToken: "refresh",
  tokenExpiresAt: null,
  scopes: "atproto pds=https://pds.exemple.test"
});
const video = (over: Partial<PublishInput> = {}): PublishInput => ({
  title: "Nouveau menu d'automne",
  caption: "Toutes les nouveautés de la saison.",
  mediaUrls: ["https://cdn.nebula.test/v.mp4"],
  mediaType: "VIDEO",
  ...over
});

const uploadsRoutes = [
  { url: `${YT}/channels`, fixture: "youtube/channels-content-details" },
  { url: `${YT}/playlistItems`, fixture: "youtube/playlist-items" }
];

beforeEach(() => {
  process.env.YOUTUBE_CLIENT_ID = "yt-id";
  process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
  process.env.YOUTUBE_REDIRECT_URI = "https://nebulahub.space/api/connections/youtube/callback";
});
afterEach(() => vi.unstubAllGlobals());

describe("YouTube : envoi d'une vidéo", () => {
  it("session d'envoi puis fichier : identifiant et lien ; métadonnées et déclarations envoyées", async () => {
    const net = installNetwork([
      { url: "cdn.nebula.test/v.mp4", raw: "0123456789", headers: { "content-type": "video/mp4" } },
      { method: "POST", url: "www.googleapis.com/upload/youtube/v3/videos", headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=ABC" }, raw: "" },
      { method: "PUT", url: "www.googleapis.com/upload/youtube/v3/videos", fixture: "youtube/video-uploaded" }
    ]);
    const out = await youtubeClient.publishPost(yt(), video({ aiGenerated: true }));
    expect(out).toEqual({ externalPostId: "aBcDeFgHiJk", externalUrl: "https://youtube.com/watch?v=aBcDeFgHiJk" });
    const init = net.to(/upload\/youtube\/v3\/videos$/, "POST")[0];
    expect(init.url.searchParams.get("uploadType")).toBe("resumable");
    expect(init.json).toMatchObject({
      snippet: { title: "Nouveau menu d'automne" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true }
    });
    expect(net.to(/upload\/youtube\/v3\/videos$/, "PUT")[0].bytes).toBe(10);
  });

  // Miniature choisie dans Publier (Réussites, lot B) : appliquée après l'envoi,
  // best-effort — la vidéo est déjà en ligne, jamais d'échec de publication.
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const uploadRoutes: Route[] = [
    { url: "cdn.nebula.test/v.mp4", raw: "0123456789", headers: { "content-type": "video/mp4" } },
    { method: "POST", url: "www.googleapis.com/upload/youtube/v3/videos", headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=ABC" }, raw: "" },
    { method: "PUT", url: "www.googleapis.com/upload/youtube/v3/videos", fixture: "youtube/video-uploaded" }
  ];

  it("miniature choisie : envoyée à thumbnails.set (image, identifiant de la vidéo) puis « appliquée »", async () => {
    const net = installNetwork([
      ...uploadRoutes,
      { url: "cdn.nebula.test/miniature.png", bytes: PNG, headers: { "content-type": "application/octet-stream" } },
      { method: "POST", url: "www.googleapis.com/upload/youtube/v3/thumbnails/set", fixture: "youtube/thumbnail-set" }
    ]);
    const out = await youtubeClient.publishPost(yt(), video({ thumbnailUrl: "https://cdn.nebula.test/miniature.png" }));
    expect(out).toEqual({ externalPostId: "aBcDeFgHiJk", externalUrl: "https://youtube.com/watch?v=aBcDeFgHiJk", thumbnail: "APPLIED" });
    const set = net.to(/thumbnails\/set$/, "POST")[0];
    expect(set.url.searchParams.get("videoId")).toBe("aBcDeFgHiJk");
    expect(set.headers["content-type"]).toBe("image/png");
    expect(set.headers.authorization).toBe("Bearer ya29.actuel");
    expect(set.bytes).toBe(PNG.byteLength);
  });

  it("chaîne non vérifiée (403) : vidéo publiée quand même, miniature « refusée »", async () => {
    installNetwork([
      ...uploadRoutes,
      { url: "cdn.nebula.test/miniature.png", bytes: PNG },
      { method: "POST", url: "www.googleapis.com/upload/youtube/v3/thumbnails/set", status: 403, fixture: "youtube/error-thumbnail-forbidden" }
    ]);
    const out = await youtubeClient.publishPost(yt(), video({ thumbnailUrl: "https://cdn.nebula.test/miniature.png" }));
    expect(out).toMatchObject({ externalPostId: "aBcDeFgHiJk", thumbnail: "REFUSED" });
  });

  it("image ni JPEG ni PNG : rien n'est envoyé, miniature « non prise en charge »", async () => {
    const net = installNetwork([...uploadRoutes, { url: "cdn.nebula.test/miniature.gif", raw: "GIF89a-image" }]);
    const out = await youtubeClient.publishPost(yt(), video({ thumbnailUrl: "https://cdn.nebula.test/miniature.gif" }));
    expect(out).toMatchObject({ externalPostId: "aBcDeFgHiJk", thumbnail: "UNSUPPORTED" });
    expect(net.to(/thumbnails\/set$/, "POST")).toHaveLength(0);
  });

  it("session refusée (quota) : erreur classée, rien n'est envoyé", async () => {
    const net = installNetwork([
      { url: "cdn.nebula.test/v.mp4", raw: "0123456789" },
      { method: "POST", url: "www.googleapis.com/upload/youtube/v3/videos", status: 403, fixture: "youtube/error-quota" }
    ]);
    const err = await youtubeClient.publishPost(yt(), video()).catch((e) => e);
    expect(classifyProviderError(err).category).toBe("QUOTA_EXHAUSTED");
    expect(net.to(/videos$/, "PUT")).toHaveLength(0);
  });

  it("dérive : vidéo envoyée sans identifiant dans la réponse → réponse inattendue (à vérifier, jamais renvoyée)", async () => {
    installNetwork([
      { url: "cdn.nebula.test/v.mp4", raw: "0123456789" },
      { method: "POST", url: "www.googleapis.com/upload/youtube/v3/videos", headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=ABC" }, raw: "" },
      { method: "PUT", url: "www.googleapis.com/upload/youtube/v3/videos", body: without(fixture("youtube/video-uploaded"), "id") }
    ]);
    const err = await youtubeClient.publishPost(yt(), video()).catch((e) => e);
    expect(classifyProviderError(err)).toMatchObject({ category: "UNEXPECTED_RESPONSE", uncertain: true });
  });

  it("média de Nebula momentanément inaccessible : rien n'a été envoyé, relance sans risque", async () => {
    installNetwork([{ url: "cdn.nebula.test/v.mp4", status: 503, raw: "indisponible" }]);
    const err = await youtubeClient.publishPost(yt(), video()).catch((e) => e);
    expect(classifyProviderError(err)).toMatchObject({ category: "TRANSIENT", autoRetry: true, uncertain: false });
  });
});

describe("YouTube : lectures (liste « uploads », 2 unités de quota)", () => {
  it("vidéos récentes sans search.list (100 unités, limité à 100 appels/jour)", async () => {
    const net = installNetwork(uploadsRoutes);
    const videos = await fetchRecentVideos(yt(), 12);
    expect(videos).toEqual([
      { videoId: "aBcDeFgHiJk", title: "Nouveau menu d'automne", thumbnailUrl: "https://i.ytimg.com/vi/aBcDeFgHiJk/mqdefault.jpg", publishedAt: "2026-09-24T08:15:40Z" },
      { videoId: "lMnOpQrStUv", title: "Vidéo privée de test", thumbnailUrl: "https://i.ytimg.com/vi/lMnOpQrStUv/mqdefault.jpg", publishedAt: "2026-09-18T12:00:00Z" }
    ]);
    expect(net.to(/\/search$/)).toHaveLength(0);
    expect(net.to(/playlistItems$/)[0].url.searchParams.get("playlistId")).toBe("UUabcdefghijklmnopqrstuv");
  });

  it("vérification « déjà en ligne ? » : titre et date de mise en ligne", async () => {
    installNetwork(uploadsRoutes);
    const recent = await youtubeClient.listRecentPosts!(yt());
    expect(recent[0]).toEqual({
      externalPostId: "aBcDeFgHiJk",
      text: "Nouveau menu d'automne",
      permalink: "https://www.youtube.com/watch?v=aBcDeFgHiJk",
      publishedAt: new Date("2026-09-24T08:15:40Z")
    });
  });

  it("dérive : liste « uploads » introuvable → erreur (jamais « aucune vidéo »)", async () => {
    installNetwork([{ url: `${YT}/channels`, body: without(fixture("youtube/channels-content-details"), "items.0.contentDetails.relatedPlaylists.uploads") }]);
    const err = (await youtubeClient.listRecentPosts!(yt()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain("items.0.contentDetails.relatedPlaylists.uploads");
  });

  it("statistiques par vidéo : compteurs en texte convertis ; J'aime masqués → « — »", async () => {
    installNetwork([...uploadsRoutes, { url: `${YT}/videos`, fixture: "youtube/videos-statistics" }]);
    const metrics = await youtubeClient.fetchPostMetrics!(yt());
    expect(metrics[0]).toMatchObject({ postExternalId: "aBcDeFgHiJk", views: 1520, likes: 87, comments: 12 });
    expect(metrics[1]).toMatchObject({ postExternalId: "lMnOpQrStUv", views: 10, likes: null, comments: null });
  });

  it("statistiques de la chaîne", async () => {
    installNetwork([{ url: `${YT}/channels`, fixture: "youtube/channels-statistics" }]);
    expect(await youtubeClient.fetchAnalytics(yt())).toMatchObject({ followers: 2300, impressions: 123456, postsCount: 87 });
  });

  it("commentaires reçus, avec la réponse de la chaîne (Réussites, lot B)", async () => {
    const net = installNetwork([...uploadsRoutes, { url: `${YT}/commentThreads`, fixture: "youtube/comment-threads" }]);
    const items = await youtubeClient.fetchEngagement!(yt());
    expect(items[0]).toMatchObject({ externalId: "UgzExempleDeFil", postExternalId: "aBcDeFgHiJk", authorName: "@spectateur", text: "Super vidéo !" });
    expect(items[0].ownerRepliedAt?.toISOString()).toBe("2026-09-24T11:15:00.000Z");
    const other = items.find((i) => i.externalId === "UgzAutreFil");
    expect(other?.ownerRepliedAt).toBeUndefined();
    // Même coût de quota : part=snippet,replies.
    expect(net.to(/commentThreads$/)[0].url.searchParams.get("part")).toBe("snippet,replies");
  });

  it("courbe de rétention ; vidéo sans données : message clair", async () => {
    installNetwork([{ url: "youtubeanalytics.googleapis.com/v2/reports", fixture: "youtube/analytics-retention" }]);
    expect((await fetchRetention(yt(), "aBcDeFgHiJk"))[2]).toEqual({ timeRatio: 0.5, watchRatio: 0.41 });
    vi.unstubAllGlobals();
    installNetwork([{ url: "youtubeanalytics.googleapis.com/v2/reports", fixture: "youtube/analytics-empty" }]);
    await expect(fetchRetention(yt(), "aBcDeFgHiJk")).rejects.toThrow(/Aucune donnée de rétention/);
  });
});

describe("YouTube : connexion et jetons", () => {
  it("échange du code : chaîne, avatar ; compte Google sans chaîne → message clair (avant : plantage)", async () => {
    installNetwork([
      { method: "POST", url: "oauth2.googleapis.com/token", fixture: "youtube/oauth-token" },
      { url: `${YT}/channels`, fixture: "youtube/channels-snippet" }
    ]);
    expect(await youtubeClient.exchangeCodeForToken("CODE")).toMatchObject({
      externalAccountId: "UCabcdefghijklmnopqrstuv",
      displayName: "Café Nebula",
      avatarUrl: "https://yt3.ggpht.com/avatar-88.jpg",
      refreshToken: "1//0exemple"
    });
    vi.unstubAllGlobals();
    installNetwork([
      { method: "POST", url: "oauth2.googleapis.com/token", fixture: "youtube/oauth-token" },
      { url: `${YT}/channels`, fixture: "youtube/channels-none" }
    ]);
    await expect(youtubeClient.exchangeCodeForToken("CODE")).rejects.toThrow(/pas de chaîne YouTube/);
  });

  it("renouvellement : nouveau jeton ; invalid_grant → connexion à refaire ; délai dépassé → pas « expirée »", async () => {
    installNetwork([{ method: "POST", url: "oauth2.googleapis.com/token", fixture: "youtube/oauth-refresh" }]);
    const c = yt({ tokenExpiresAt: new Date(Date.now() + 60_000) });
    expect(await freshYoutubeToken(c)).toBe("ya29.exemple-2");
    expect(c.refreshToken).toBe("1//0exemple");

    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: "oauth2.googleapis.com/token", status: 400, fixture: "youtube/oauth-invalid-grant" }]);
    const expired = yt({ tokenExpiresAt: new Date(Date.now() + 60_000) });
    expect(classifyProviderError(await freshYoutubeToken(expired).catch((e) => e)).category).toBe("AUTH_EXPIRED");
    expect(expired.refreshToken).toBeNull();

    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(Object.assign(new Error("délai"), { name: "TimeoutError" }))));
    const slow = yt({ tokenExpiresAt: new Date(Date.now() + 60_000) });
    const err = await freshYoutubeToken(slow).catch((e) => e);
    expect(err).toBeInstanceOf(SocialApiError);
    expect(classifyProviderError(err).category).toBe("TIMEOUT");
    expect(slow.refreshToken).toBe("1//0exemple");
  });
});

describe("Bluesky", () => {
  it("connexion par mot de passe d'application : session, profil ; mot de passe jamais conservé", async () => {
    const net = installNetwork([
      { url: "public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle", fixture: "bluesky/resolve-handle" },
      { url: "plc.directory/did:plc:ewvi7nxzyoun6zhxrhs64oiz", body: { service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: "https://pds.exemple.test/" }] } },
      { method: "POST", url: "pds.exemple.test/xrpc/com.atproto.server.createSession", fixture: "bluesky/create-session" },
      { url: "public.api.bsky.app/xrpc/app.bsky.actor.getProfile", fixture: "bluesky/get-profile" }
    ]);
    const res = await connectWithAppPassword("@cafe-nebula.bsky.social", "abcd-efgh-ijkl-mnop");
    expect(res).toMatchObject({ externalAccountId: "did:plc:ewvi7nxzyoun6zhxrhs64oiz", handle: "@cafe-nebula.bsky.social", displayName: "Café Nebula", scopes: "atproto pds=https://pds.exemple.test" });
    expect(JSON.stringify(res)).not.toContain("abcd-efgh-ijkl-mnop");
    expect(net.unmatched).toEqual([]);
  });

  it("publication avec image : blob puis enregistrement ; lien bsky.app", async () => {
    const net = installNetwork([
      { url: "cdn.nebula.test/menu.jpg", raw: "img", headers: { "content-type": "image/jpeg" } },
      { method: "POST", url: "pds.exemple.test/xrpc/com.atproto.repo.uploadBlob", fixture: "bluesky/upload-blob" },
      { method: "POST", url: "pds.exemple.test/xrpc/com.atproto.repo.createRecord", fixture: "bluesky/create-record" }
    ]);
    const out = await blueskyClient.publishPost(bsky(), { caption: "Nouveau menu ☕ #cafe", mediaUrls: ["https://cdn.nebula.test/menu.jpg"], mediaType: "IMAGE" });
    expect(out).toEqual({
      externalPostId: "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3lbexemple2x",
      externalUrl: "https://bsky.app/profile/cafe-nebula.bsky.social/post/3lbexemple2x"
    });
    const record = net.to(/createRecord$/)[0].json as { record: { embed: { images: { image: unknown }[] }; facets: unknown[] } };
    expect(record.record.embed.images[0].image).toMatchObject({ mimeType: "image/jpeg" });
    expect(record.record.facets).toHaveLength(1);
  });

  it("délai dépassé à l'enregistrement : classé TIMEOUT (avant : erreur brute « inconnue »)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })))
    );
    const err = await blueskyClient.publishPost(bsky(), { caption: "Bonjour", mediaUrls: [], mediaType: "IMAGE" }).catch((e) => e);
    expect(err).toBeInstanceOf(SocialApiError);
    expect(classifyProviderError(err)).toMatchObject({ category: "TIMEOUT", uncertain: true });
  });

  it("fil de l'auteur : republications d'autres comptes exclues ; statistiques", async () => {
    installNetwork([{ url: "public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed", fixture: "bluesky/author-feed" }]);
    const recent = await blueskyClient.listRecentPosts!(bsky());
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ text: "Nouveau menu d'automne ☕ #cafe", publishedAt: new Date("2026-09-24T08:15:30.123Z") });
    const metrics = await blueskyClient.fetchPostMetrics!(bsky());
    expect(metrics[0]).toMatchObject({ likes: 14, comments: 2, shares: 1, thumbnailUrl: "https://cdn.bsky.app/img/feed_thumbnail/plain/x@jpeg" });
  });

  it("dérive : « feed » absent → erreur (jamais « aucune publication »)", async () => {
    installNetwork([{ url: "public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed", body: { posts: [] } }]);
    const err = (await blueskyClient.listRecentPosts!(bsky()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
  });

  it("session expirée : connexion à refaire", async () => {
    installNetwork([{ url: "public.api.bsky.app/xrpc/app.bsky.actor.getProfile", status: 400, fixture: "bluesky/error-expired" }]);
    const err = await blueskyClient.fetchAnalytics(bsky()).catch((e) => e);
    expect(classifyProviderError(err).category).toBe("AUTH_EXPIRED");
  });
});
