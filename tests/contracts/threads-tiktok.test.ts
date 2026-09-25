// Contrats Threads et TikTok — lot 7.
// Réponses types d'après la documentation officielle :
//  - Threads : https://developers.facebook.com/docs/threads/posts, /threads/insights
//  - TikTok : https://developers.tiktok.com/doc/content-posting-api-reference-direct-post,
//    /content-posting-api-reference-get-video-status, /tiktok-api-v2-video-list,
//    /tiktok-api-v2-get-user-info
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: (...a: unknown[]) => update(...(a as [])), findUnique: vi.fn(async () => null) } } }));

import { SocialApiError, UNEXPECTED_RESPONSE, isPendingPublish, type ConnectionLike, type PublishInput } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { threadsClient } from "@/lib/social/threads";
import { freshTiktokToken, tiktokClient } from "@/lib/social/tiktok";
import { API_VERSIONS } from "@/lib/social/versions";
import { fixture, installNetwork, without } from "./harness";

const T = `graph.threads.net/${API_VERSIONS.THREADS.version}`;
const TT = "open.tiktokapis.com/v2";

const conn = (over: Partial<ConnectionLike> = {}): ConnectionLike => ({
  id: "c1",
  externalAccountId: "26123456789012345",
  accessToken: "TOKEN",
  refreshToken: null,
  tokenExpiresAt: null,
  scopes: "",
  ...over
});
const input = (over: Partial<PublishInput> = {}): PublishInput => ({ caption: "Nouveau menu d'automne ☕", mediaUrls: [], mediaType: "IMAGE", waitUntil: Date.now() + 5_000, ...over });

beforeEach(() => {
  update.mockClear();
  process.env.THREADS_APP_ID = "threads-app";
  process.env.THREADS_APP_SECRET = "threads-secret";
  process.env.THREADS_REDIRECT_URI = "https://nebulahub.space/api/connections/threads/callback";
  process.env.TIKTOK_CLIENT_KEY = "tt-key";
  process.env.TIKTOK_CLIENT_SECRET = "tt-secret";
  process.env.TIKTOK_REDIRECT_URI = "https://nebulahub.space/api/connections/tiktok/callback";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Threads", () => {
  it("texte seul : conteneur TEXT, publication, lien ; version de versions.ts (plus de v1.0 en dur)", async () => {
    const net = installNetwork([
      { method: "POST", url: `${T}/26123456789012345/threads`, fixture: "threads/container-created" },
      { url: `${T}/17890000000000001`, fixture: "threads/container-finished" },
      { method: "POST", url: `${T}/26123456789012345/threads_publish`, fixture: "threads/publish" },
      { url: `${T}/18000000000000001`, fixture: "threads/permalink" }
    ]);
    const out = await threadsClient.publishPost(conn(), input());
    expect(out).toEqual({ externalPostId: "18000000000000001", externalUrl: "https://www.threads.net/@cafe.nebula/post/C0dEfGhIjKl" });
    expect(net.sent[0].url.searchParams.get("media_type")).toBe("TEXT");
    expect(net.unmatched).toEqual([]);
  });

  it("conteneur pas prêt : point de reprise", async () => {
    installNetwork([
      { method: "POST", url: `${T}/26123456789012345/threads`, fixture: "threads/container-created" },
      { url: `${T}/17890000000000001`, fixture: "threads/container-in-progress" }
    ]);
    expect(isPendingPublish(await threadsClient.publishPost(conn(), input({ waitUntil: Date.now() })))).toBe(true);
  });

  it("connexion : identifiant du compte (grand entier) gardé intact", async () => {
    installNetwork([
      { method: "POST", url: "graph.threads.net/oauth/access_token", fixture: "threads/oauth-token" },
      { url: "graph.threads.net/access_token", fixture: "threads/oauth-token-long" },
      { url: `${T}/me`, fixture: "threads/me" }
    ]);
    const res = await threadsClient.exchangeCodeForToken("CODE");
    expect(res).toMatchObject({ externalAccountId: "26123456789012345", handle: "@cafe.nebula", displayName: "Café Nebula" });
  });

  it("statistiques : abonnés (total), vues (série), interactions", async () => {
    installNetwork([
      { url: `${T}/26123456789012345/threads_insights`, reply: (req) => ({ raw: JSON.stringify(fixture(req.url.searchParams.get("metric") === "followers_count" ? "threads/user-insights-followers" : "threads/user-insights-activity")) }) },
      { url: `${T}/26123456789012345/threads`, fixture: "threads/threads-list" }
    ]);
    const stats = await threadsClient.fetchAnalytics(conn());
    expect(stats).toMatchObject({ followers: 321, impressions: 25, postsCount: 1 });
  });

  it("dernières publications et statistiques par publication", async () => {
    installNetwork([
      { url: `${T}/26123456789012345/threads`, fixture: "threads/threads-list" },
      { url: `${T}/18000000000000001/insights`, fixture: "threads/media-insights" }
    ]);
    const recent = await threadsClient.listRecentPosts!(conn());
    expect(recent[0]).toMatchObject({ externalPostId: "18000000000000001", text: "Nouveau menu d'automne ☕", publishedAt: new Date("2026-09-24T08:15:30Z") });
    const metrics = await threadsClient.fetchPostMetrics!(conn());
    expect(metrics[0]).toMatchObject({ views: 100, likes: 5, comments: 2, shares: 1 });
  });

  it("dérive : liste sans « data » → erreur (jamais « aucune publication »)", async () => {
    installNetwork([{ url: `${T}/26123456789012345/threads`, body: { threads: [] } }]);
    const err = (await threadsClient.listRecentPosts!(conn()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
  });
});

describe("TikTok : publication", () => {
  it("envoi par URL puis statut : identifiant de vidéo de 19 chiffres JAMAIS arrondi", async () => {
    const net = installNetwork([
      { method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/publish-init" },
      { method: "POST", url: `${TT}/post/publish/status/fetch/`, fixture: "tiktok/status-complete" }
    ]);
    const out = await tiktokClient.publishPost(conn({ externalAccountId: "723f24d7" }), input({ mediaType: "VIDEO", mediaUrls: ["https://cdn.nebula.test/v.mp4"] }));
    // 7301234567890123456 lu comme un nombre JavaScript deviendrait 7301234567890123000.
    expect(out).toEqual({ externalPostId: "7301234567890123456", externalUrl: "https://www.tiktok.com/video/7301234567890123456" });
    const init = net.to(/video\/init\/$/)[0];
    expect(init.headers.authorization).toBe("Bearer TOKEN");
    expect(init.json).toMatchObject({ source_info: { source: "PULL_FROM_URL", video_url: "https://cdn.nebula.test/v.mp4" } });
    expect(net.to(/status\/fetch\/$/)[0].json).toEqual({ publish_id: "v_pub_url~v2-1.7301234567890123456" });
  });

  it("vidéo privée (compte non audité) : identifiant d'envoi, sans lien", async () => {
    installNetwork([
      { method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/publish-init" },
      { method: "POST", url: `${TT}/post/publish/status/fetch/`, fixture: "tiktok/status-complete-private" }
    ]);
    const out = await tiktokClient.publishPost(conn(), input({ mediaType: "VIDEO", mediaUrls: ["https://cdn.nebula.test/v.mp4"] }));
    expect(out).toEqual({ externalPostId: "v_pub_url~v2-1.7301234567890123456", externalUrl: undefined });
  });

  it("traitement en cours : point de reprise", async () => {
    installNetwork([
      { method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/publish-init" },
      { method: "POST", url: `${TT}/post/publish/status/fetch/`, fixture: "tiktok/status-processing" }
    ]);
    const out = await tiktokClient.publishPost(conn(), input({ mediaType: "VIDEO", mediaUrls: ["https://cdn.nebula.test/v.mp4"], waitUntil: Date.now() }));
    expect(isPendingPublish(out)).toBe(true);
  });

  it("refus (fail_reason) : classé comme média refusé grâce au code TikTok", async () => {
    installNetwork([
      { method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/publish-init" },
      { method: "POST", url: `${TT}/post/publish/status/fetch/`, fixture: "tiktok/status-failed" }
    ]);
    const err = await tiktokClient.publishPost(conn(), input({ mediaType: "VIDEO", mediaUrls: ["https://cdn.nebula.test/v.mp4"] })).catch((e) => e);
    expect(err.message).toContain("picture_size_check_failed");
    expect(classifyProviderError(err).category).toBe("INVALID_MEDIA");
  });

  it("erreur annoncée avec un statut 200 (error.code ≠ ok) : jamais prise pour un succès", async () => {
    installNetwork([{ method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/error-too-many-posts" }]);
    const err = await tiktokClient.publishPost(conn(), input({ mediaType: "VIDEO", mediaUrls: ["https://cdn.nebula.test/v.mp4"] })).catch((e) => e);
    expect(classifyProviderError(err).category).toBe("QUOTA_EXHAUSTED");
  });

  it("limite de débit (429) : relance automatique autorisée", async () => {
    installNetwork([{ method: "POST", url: `${TT}/post/publish/video/init/`, status: 429, fixture: "tiktok/error-rate-limit" }]);
    const err = await tiktokClient.publishPost(conn(), input({ mediaType: "VIDEO", mediaUrls: ["https://cdn.nebula.test/v.mp4"] })).catch((e) => e);
    expect(classifyProviderError(err)).toMatchObject({ category: "RATE_LIMITED", autoRetry: true });
  });

  it("dérive : publish_id absent → réponse inattendue", async () => {
    installNetwork([{ method: "POST", url: `${TT}/post/publish/video/init/`, body: without(fixture("tiktok/publish-init"), "data.publish_id") }]);
    const err = (await tiktokClient.publishPost(conn(), input({ mediaType: "VIDEO", mediaUrls: ["https://cdn.nebula.test/v.mp4"] })).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain("champ « data.publish_id » absent");
  });
});

describe("TikTok : lectures et jetons", () => {
  it("liste de vidéos : texte, lien, date (secondes → UTC)", async () => {
    const net = installNetwork([{ method: "POST", url: `${TT}/video/list/`, fixture: "tiktok/video-list" }]);
    const recent = await tiktokClient.listRecentPosts!(conn());
    expect(recent[0]).toEqual({
      externalPostId: "7301234567890123456",
      text: "Nouveau menu d'automne ☕ #cafe",
      permalink: "https://www.tiktok.com/@cafe.nebula/video/7301234567890123456",
      publishedAt: new Date("2026-09-24T08:15:30Z")
    });
    expect(net.sent[0].json).toEqual({ max_count: 10 });
  });

  it("compte sans vidéo (has_more: false, pas de « videos ») : liste vide, sans erreur", async () => {
    installNetwork([{ method: "POST", url: `${TT}/video/list/`, fixture: "tiktok/video-list-empty" }]);
    expect(await tiktokClient.listRecentPosts!(conn())).toEqual([]);
  });

  it("dérive : « videos » absent sans has_more → erreur (jamais « aucune vidéo »)", async () => {
    installNetwork([{ method: "POST", url: `${TT}/video/list/`, body: without(without(fixture("tiktok/video-list"), "data.videos"), "data.has_more") }]);
    const err = (await tiktokClient.listRecentPosts!(conn()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain("data.videos");
  });

  it("statistiques par vidéo", async () => {
    installNetwork([{ method: "POST", url: `${TT}/video/list/`, fixture: "tiktok/video-list" }]);
    const metrics = await tiktokClient.fetchPostMetrics!(conn());
    expect(metrics[0]).toMatchObject({ views: 456, likes: 12, comments: 3, shares: 1, saves: null });
  });

  it("connexion : seuls les champs de user.info.basic sont demandés", async () => {
    const net = installNetwork([
      { method: "POST", url: `${TT}/oauth/token/`, fixture: "tiktok/oauth-token" },
      { url: `${TT}/user/info/`, fixture: "tiktok/user-info-basic" }
    ]);
    const res = await tiktokClient.exchangeCodeForToken("CODE");
    expect(res).toMatchObject({ externalAccountId: "723f24d7-e717-40f8-a2b6-cb8464cd23b4", displayName: "Café Nebula", refreshToken: "rft.exemple" });
    const fields = net.to(/user\/info\/$/)[0].url.searchParams.get("fields")!.split(",");
    expect(fields.sort()).toEqual(["avatar_url", "display_name", "open_id"]);
  });

  it("jeton renouvelé et enregistré ; refus invalid_grant → connexion à refaire", async () => {
    installNetwork([{ method: "POST", url: `${TT}/oauth/token/`, fixture: "tiktok/oauth-refresh" }]);
    const c = conn({ refreshToken: "rft.exemple", tokenExpiresAt: new Date(Date.now() + 60_000) });
    expect(await freshTiktokToken(c)).toBe("act.exemple-2");
    expect(c.refreshToken).toBe("rft.exemple-2");
    expect(update).toHaveBeenCalled();

    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: `${TT}/oauth/token/`, status: 400, fixture: "tiktok/oauth-invalid-grant" }]);
    const expired = conn({ refreshToken: "rft.ancien", tokenExpiresAt: new Date(Date.now() + 60_000) });
    const err = await freshTiktokToken(expired).catch((e) => e);
    expect(classifyProviderError(err).category).toBe("AUTH_EXPIRED");
    expect(expired.refreshToken).toBeNull();
  });

  it("panne pendant le renouvellement : la connexion n'est PAS déclarée expirée", async () => {
    installNetwork([{ method: "POST", url: `${TT}/oauth/token/`, status: 503, body: { error: "server_error" } }]);
    const c = conn({ refreshToken: "rft.exemple", tokenExpiresAt: new Date(Date.now() + 60_000) });
    const err = await freshTiktokToken(c).catch((e) => e);
    expect(classifyProviderError(err).category).toBe("TRANSIENT");
    expect(c.refreshToken).toBe("rft.exemple");
  });
});
