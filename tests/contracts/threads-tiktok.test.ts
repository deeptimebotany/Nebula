// Contrats Threads et TikTok — lot 7.
// Réponses types d'après la documentation officielle :
//  - Threads : https://developers.facebook.com/docs/threads/posts, /threads/insights
//  - TikTok : https://developers.tiktok.com/doc/content-posting-api-reference-direct-post,
//    /content-posting-api-reference-get-video-status, /tiktok-api-v2-video-list,
//    /tiktok-api-v2-get-user-info
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: (...a: unknown[]) => update(...(a as [])), findUnique: vi.fn(async () => null) } } }));

import { SocialApiError, UNEXPECTED_RESPONSE, isPendingPublish, type ConnectionLike, type PublishCheckpoint, type PublishInput } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { threadsClient } from "@/lib/social/threads";
import { TIKTOK_SCOPES, fetchTiktokCreatorInfo, freshTiktokToken, tiktokClient } from "@/lib/social/tiktok";
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

describe("TikTok : publication directe (FILE_UPLOAD, règles Direct Post)", () => {
  const VIDEO = "https://cdn.nebula.test/v.mp4";
  const MB = 1024 * 1024;
  const OPTIONS = { privacyLevel: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: true, commercial: false, yourBrand: false, brandedContent: false };
  const tiktokInput = (over: Partial<PublishInput> = {}) =>
    input({ mediaType: "VIDEO", mediaUrls: [VIDEO], tiktok: { ...OPTIONS }, videoDurationSec: 42, waitUntil: Date.now() + 30_000, ...over });

  /** Faux réseau d'un envoi complet : vidéo de `size` octets servie par morceaux (Range). */
  function uploadRoutes(size: number, extra: Parameters<typeof installNetwork>[0] = []) {
    return installNetwork([
      { method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" },
      { method: "HEAD", url: "cdn.nebula.test/v.mp4", raw: "", headers: { "content-length": String(size), "content-type": "video/mp4" } },
      { method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/publish-init-upload" },
      {
        method: "GET",
        url: "cdn.nebula.test/v.mp4",
        reply: (req) => {
          const [a, b] = req.headers.range.replace("bytes=", "").split("-").map(Number);
          return { status: 206, raw: "a".repeat(b - a + 1), headers: { "content-type": "video/mp4", "content-range": `bytes ${a}-${b}/${size}` } };
        }
      },
      {
        method: "PUT",
        url: /open-upload\.tiktokapis\.com\/video\//,
        reply: (req) => ({ status: Number(req.headers["content-range"].split("/")[0].split("-")[1]) === size - 1 ? 201 : 206, raw: "" })
      },
      ...extra,
      { method: "POST", url: `${TT}/post/publish/status/fetch/`, fixture: "tiktok/status-complete" }
    ]);
  }

  it("creator_info : compte, confidentialités, interactions coupées, durée maximale", async () => {
    const net = installNetwork([{ method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" }]);
    const info = await fetchTiktokCreatorInfo(conn());
    expect(info).toEqual({
      avatarUrl: "https://p16-sign.tiktokcdn.com/tos-maliva-avt-0068/exemple~c5_168x168.jpeg",
      username: "cafe.nebula",
      nickname: "Café Nebula",
      privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: true,
      maxVideoPostDurationSec: 300
    });
    expect(net.sent[0].headers.authorization).toBe("Bearer TOKEN");
  });

  it("dérive de creator_info : privacy_level_options absent → réponse inattendue, jamais « aucune option »", async () => {
    installNetwork([{ method: "POST", url: `${TT}/post/publish/creator_info/query/`, body: without(fixture("tiktok/creator-info"), "data.privacy_level_options") }]);
    const err = (await fetchTiktokCreatorInfo(conn()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain("data.privacy_level_options");
  });

  it("créateur qui ne peut plus publier (spam_risk_too_many_posts) : erreur avec le code TikTok", async () => {
    installNetwork([{ method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/error-too-many-posts" }]);
    const err = (await fetchTiktokCreatorInfo(conn()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe("spam_risk_too_many_posts");
    expect(classifyProviderError(err).category).toBe("QUOTA_EXHAUSTED");
  });

  it("envoi par morceaux : init FILE_UPLOAD, morceaux dans l'ordre avec Content-Range, puis statut (id de 19 chiffres intact)", async () => {
    const size = 25 * MB;
    const net = uploadRoutes(size);
    const out = await tiktokClient.publishPost(conn({ externalAccountId: "723f24d7" }), tiktokInput({ aiGenerated: true }));
    expect(out).toEqual({ externalPostId: "7301234567890123456", externalUrl: "https://www.tiktok.com/video/7301234567890123456" });

    const init = net.to(/video\/init\/$/)[0].json as { post_info: Record<string, unknown>; source_info: Record<string, unknown> };
    expect(init.source_info).toEqual({ source: "FILE_UPLOAD", video_size: size, chunk_size: 10 * MB, total_chunk_count: 2 });
    expect(init.post_info).toEqual({
      title: "Nouveau menu d'automne ☕",
      privacy_level: "SELF_ONLY",
      disable_comment: false,
      disable_duet: true,
      // Coupé par le créateur dans TikTok (stitch_disabled) : même si l'utilisateur l'autorisait.
      disable_stitch: true,
      brand_content_toggle: false,
      brand_organic_toggle: false,
      is_aigc: true
    });
    expect(JSON.stringify(init)).not.toContain("PULL_FROM_URL");

    const puts = net.to(/open-upload/, "PUT");
    expect(puts.map((p) => p.headers["content-range"])).toEqual([`bytes 0-${10 * MB - 1}/${size}`, `bytes ${10 * MB}-${size - 1}/${size}`]);
    expect(puts.map((p) => p.bytes)).toEqual([10 * MB, 15 * MB]);
    expect(puts[0].headers["content-type"]).toBe("video/mp4");
    // Lus depuis le stockage morceau par morceau (Range), jamais d'un bloc.
    expect(net.to(/cdn\.nebula\.test/, "GET").map((r) => r.headers.range)).toEqual([`bytes=0-${10 * MB - 1}`, `bytes=${10 * MB}-${size - 1}`]);
    // creator_info avant l'ouverture de l'envoi.
    expect(net.sent.map((r) => r.url.pathname).indexOf("/v2/post/publish/creator_info/query/")).toBeLessThan(net.sent.map((r) => r.url.pathname).indexOf("/v2/post/publish/video/init/"));
  });

  it("petite vidéo (moins de 5 Mo) : un seul morceau de la taille du fichier", async () => {
    const size = 3 * MB + 17;
    const net = uploadRoutes(size);
    await tiktokClient.publishPost(conn(), tiktokInput());
    expect((net.to(/video\/init\/$/)[0].json as { source_info: unknown }).source_info).toEqual({ source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 });
    expect(net.to(/open-upload/, "PUT").map((p) => p.headers["content-range"])).toEqual([`bytes 0-${size - 1}/${size}`]);
  });

  it("heure limite proche : point de reprise (morceau suivant), puis la reprise envoie la suite sans rien renvoyer", async () => {
    const size = 25 * MB;
    const net = uploadRoutes(size);
    const out = await tiktokClient.publishPost(conn(), tiktokInput({ waitUntil: Date.now() + 1_000 }));
    expect(isPendingPublish(out)).toBe(true);
    const checkpoint = (out as { checkpoint: PublishCheckpoint }).checkpoint;
    expect(checkpoint).toMatchObject({ step: "tiktok_upload", publishId: "v_inbox_file~v2.7301234567890123456", nextChunk: 0, totalChunks: 2, chunkSize: 10 * MB, videoSize: size });
    expect(net.to(/open-upload/, "PUT")).toHaveLength(0);

    // Reprise au passage suivant du cron, après un premier morceau déjà reçu.
    const resumed = await tiktokClient.resumePublish!(conn(), tiktokInput(), { ...checkpoint, nextChunk: 1 });
    expect(resumed).toMatchObject({ externalPostId: "7301234567890123456" });
    expect(net.to(/video\/init\/$/)).toHaveLength(1);
    expect(net.to(/open-upload/, "PUT").map((p) => p.headers["content-range"])).toEqual([`bytes ${10 * MB}-${size - 1}/${size}`]);
  });

  it("adresse d'envoi expirée (plus de 50 min) : l'envoi repart de zéro, rien n'avait été publié", async () => {
    const size = 6 * MB;
    const net = uploadRoutes(size);
    const old = { step: "tiktok_upload", publishId: "ancien", uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=1", mimeType: "video/mp4", videoSize: size, chunkSize: size, totalChunks: 1, nextChunk: 0, uploadStartedAt: Date.now() - 55 * 60_000 };
    await tiktokClient.resumePublish!(conn(), tiktokInput(), old);
    expect(net.to(/video\/init\/$/)).toHaveLength(1);
    expect(net.to(/status\/fetch\/$/)[0].json).toEqual({ publish_id: "v_inbox_file~v2.7301234567890123456" });
  });

  it("publication programmée : confidentialité plus proposée par le compte → échec clair, aucun autre choix fait à sa place", async () => {
    const net = installNetwork([{ method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" }]);
    const err = (await tiktokClient.publishPost(conn(), tiktokInput({ tiktok: { ...OPTIONS, privacyLevel: "FOLLOWER_OF_CREATOR" } })).catch((e) => e)) as SocialApiError;
    expect(err.message).toContain("« Mes abonnés » n'est plus proposée");
    expect(err.code).toBe("tiktok_options_invalid");
    expect(classifyProviderError(err)).toMatchObject({ category: "INVALID_REQUEST", autoRetry: false });
    expect(net.to(/video\/init\/$/)).toHaveLength(0);
  });

  it("sans confidentialité choisie, ou vidéo trop longue : rien n'est envoyé", async () => {
    const net = installNetwork([{ method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" }]);
    const missing = (await tiktokClient.publishPost(conn(), tiktokInput({ tiktok: undefined })).catch((e) => e)) as SocialApiError;
    expect(missing.message).toContain("Confidentialité TikTok non choisie");
    const long = (await tiktokClient.publishPost(conn(), tiktokInput({ videoDurationSec: 301 })).catch((e) => e)) as SocialApiError;
    expect(long.message).toContain("vidéo trop longue pour ce compte (301 s, 300 s au plus)");
    const photo = (await tiktokClient.publishPost(conn(), tiktokInput({ mediaType: "IMAGE" })).catch((e) => e)) as SocialApiError;
    expect(photo.message).toContain("ajoutez une vidéo");
    expect(net.to(/video\/init\/$/)).toHaveLength(0);
    expect(net.to(/cdn\.nebula\.test/)).toHaveLength(0);
  });

  it("refus de TikTok (privacy_level_option_mismatch) : requête invalide, jamais relancée automatiquement", async () => {
    installNetwork([
      { method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" },
      { method: "HEAD", url: "cdn.nebula.test/v.mp4", raw: "", headers: { "content-length": String(6 * MB) } },
      { method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/error-privacy-mismatch" }
    ]);
    const err = (await tiktokClient.publishPost(conn(), tiktokInput()).catch((e) => e)) as SocialApiError;
    expect(classifyProviderError(err)).toMatchObject({ category: "INVALID_REQUEST", autoRetry: false });
  });

  it("refus pendant le traitement (fail_reason) : classé comme média refusé", async () => {
    const size = 6 * MB;
    installNetwork([
      { method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" },
      { method: "HEAD", url: "cdn.nebula.test/v.mp4", raw: "", headers: { "content-length": String(size) } },
      { method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/publish-init-upload" },
      { method: "GET", url: "cdn.nebula.test/v.mp4", reply: () => ({ status: 206, raw: "a".repeat(size) }) },
      { method: "PUT", url: /open-upload/, status: 201, raw: "" },
      { method: "POST", url: `${TT}/post/publish/status/fetch/`, fixture: "tiktok/status-failed" }
    ]);
    const err = await tiktokClient.publishPost(conn(), tiktokInput()).catch((e) => e);
    expect(err.message).toContain("picture_size_check_failed");
    expect(classifyProviderError(err).category).toBe("INVALID_MEDIA");
  });

  it("vidéo privée (compte non audité) : identifiant d'envoi, sans lien ; traitement encore en cours : point de reprise", async () => {
    const size = 6 * MB;
    const routes = (status: string) => [
      { method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" },
      { method: "HEAD", url: "cdn.nebula.test/v.mp4", raw: "", headers: { "content-length": String(size) } },
      { method: "POST", url: `${TT}/post/publish/video/init/`, fixture: "tiktok/publish-init-upload" },
      { method: "GET", url: "cdn.nebula.test/v.mp4", reply: () => ({ status: 206, raw: "a".repeat(size) }) },
      { method: "PUT", url: /open-upload/, status: 201, raw: "" },
      { method: "POST", url: `${TT}/post/publish/status/fetch/`, fixture: status }
    ];
    installNetwork(routes("tiktok/status-complete-private"));
    expect(await tiktokClient.publishPost(conn(), tiktokInput())).toEqual({ externalPostId: "v_inbox_file~v2.7301234567890123456", externalUrl: undefined });
    // Fichier reçu, TikTok traite encore : point de reprise « statut ».
    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: `${TT}/post/publish/status/fetch/`, fixture: "tiktok/status-processing" }]);
    const later = await tiktokClient.resumePublish!(conn(), tiktokInput({ waitUntil: Date.now() }), { step: "tiktok_status", publishId: "v_inbox_file~v2.7301234567890123456" });
    expect(later).toMatchObject({ pending: true, checkpoint: { step: "tiktok_status", publishId: "v_inbox_file~v2.7301234567890123456" } });
  });

  it("limite de débit (429) à l'ouverture : relance automatique autorisée", async () => {
    installNetwork([
      { method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" },
      { method: "HEAD", url: "cdn.nebula.test/v.mp4", raw: "", headers: { "content-length": String(6 * MB) } },
      { method: "POST", url: `${TT}/post/publish/video/init/`, status: 429, fixture: "tiktok/error-rate-limit" }
    ]);
    const err = await tiktokClient.publishPost(conn(), tiktokInput()).catch((e) => e);
    expect(classifyProviderError(err)).toMatchObject({ category: "RATE_LIMITED", autoRetry: true });
  });

  it("dérive : upload_url absent → réponse inattendue", async () => {
    installNetwork([
      { method: "POST", url: `${TT}/post/publish/creator_info/query/`, fixture: "tiktok/creator-info" },
      { method: "HEAD", url: "cdn.nebula.test/v.mp4", raw: "", headers: { "content-length": String(6 * MB) } },
      { method: "POST", url: `${TT}/post/publish/video/init/`, body: without(fixture("tiktok/publish-init-upload"), "data.upload_url") }
    ]);
    const err = (await tiktokClient.publishPost(conn(), tiktokInput()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain("data.upload_url");
  });

  it("clé collée dans Vercel avec guillemets, espaces ou retour à la ligne : envoyée propre (sinon TikTok affiche « client_key »)", () => {
    process.env.TIKTOK_CLIENT_KEY = ' "sbawxbk1yy7rf2k75i" \n';
    process.env.TIKTOK_REDIRECT_URI = " https://nebulahub.space/api/connections/tiktok/callback\n";
    const url = new URL(tiktokClient.getAuthUrl("state-1"));
    expect(url.searchParams.get("client_key")).toBe("sbawxbk1yy7rf2k75i");
    expect(url.searchParams.get("redirect_uri")).toBe("https://nebulahub.space/api/connections/tiktok/callback");
    process.env.TIKTOK_CLIENT_KEY = "   ";
    expect(() => tiktokClient.getAuthUrl("state-1")).toThrow("TIKTOK_CLIENT_KEY manquant");
  });

  it("autorisations demandées : exactement celles déclarées dans le portail", () => {
    const url = new URL(tiktokClient.getAuthUrl("state-1"));
    expect(url.searchParams.get("scope")!.split(",").sort()).toEqual(["user.info.basic", "user.info.stats", "video.list", "video.publish"]);
    expect([...TIKTOK_SCOPES].sort()).toEqual(["user.info.basic", "user.info.stats", "video.list", "video.publish"]);
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
