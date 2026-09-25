// Contrats LinkedIn et Pinterest — lot 7.
// Réponses types d'après la documentation officielle :
//  - LinkedIn : https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api,
//    /images-api, /videos-api ; https://learn.microsoft.com/linkedin/shared/integrations/people/sign-in-with-linkedin-v2
//  - Pinterest : https://developers.pinterest.com/docs/api/v5/ (oauth-token, user_account-get,
//    boards-list, pins-create, pins-list, media-create, media-get, pins-analytics)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } } }));

import { SocialApiError, UNEXPECTED_RESPONSE, isPendingPublish, type ConnectionLike, type PublishInput } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { linkedinClient } from "@/lib/social/linkedin";
import { listPinterestBoards, pinterestClient } from "@/lib/social/pinterest";
import { matchRecentPost } from "@/lib/social/reconcile";
import { API_VERSIONS } from "@/lib/social/versions";
import { installNetwork } from "./harness";

const LI = "api.linkedin.com/rest";
const PIN = "api.pinterest.com/v5";

const li = (): ConnectionLike => ({ id: "c-li", externalAccountId: "782bbtaQ", accessToken: "AQV-actuel", refreshToken: null, tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
const pin = (): ConnectionLike => ({ id: "c-pin", externalAccountId: "549755885175", accessToken: "pina_actuel", refreshToken: "pinr", tokenExpiresAt: new Date(Date.now() + 20 * 86_400_000) });
const post = (over: Partial<PublishInput> = {}): PublishInput => ({ caption: "Nouveau menu d'automne ☕ #cafe", mediaUrls: [], mediaType: "IMAGE", waitUntil: Date.now() + 5_000, ...over });

beforeEach(() => {
  process.env.LINKEDIN_CLIENT_ID = "li-id";
  process.env.LINKEDIN_CLIENT_SECRET = "li-secret";
  process.env.LINKEDIN_REDIRECT_URI = "https://nebulahub.space/api/connections/linkedin/callback";
  process.env.PINTEREST_APP_ID = "pin-id";
  process.env.PINTEREST_APP_SECRET = "pin-secret";
  process.env.PINTEREST_REDIRECT_URI = "https://nebulahub.space/api/connections/pinterest/callback";
  delete process.env.LINKEDIN_API_VERSION;
});
afterEach(() => vi.unstubAllGlobals());

describe("LinkedIn", () => {
  it("texte : en-têtes de version, hashtag cliquable, identifiant lu dans x-restli-id", async () => {
    const net = installNetwork([{ method: "POST", url: `${LI}/posts`, status: 201, headers: { "x-restli-id": "urn:li:share:6844785523593134080" }, raw: "" }]);
    const out = await linkedinClient.publishPost(li(), post());
    expect(out).toEqual({ externalPostId: "urn:li:share:6844785523593134080", externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:6844785523593134080/" });
    const sent = net.sent[0];
    expect(sent.headers["linkedin-version"]).toBe(API_VERSIONS.LINKEDIN.version);
    expect(sent.headers["x-restli-protocol-version"]).toBe("2.0.0");
    expect(sent.json).toMatchObject({ author: "urn:li:person:782bbtaQ", commentary: "Nouveau menu d'automne ☕ {hashtag|\\#|cafe}", lifecycleState: "PUBLISHED" });
  });

  it("dérive : post créé sans identifiant → réponse inattendue (avant : « contenu refusé », relancé en doublon)", async () => {
    installNetwork([{ method: "POST", url: `${LI}/posts`, status: 201, raw: "" }]);
    const err = await linkedinClient.publishPost(li(), post()).catch((e) => e);
    expect(classifyProviderError(err)).toMatchObject({ category: "UNEXPECTED_RESPONSE", uncertain: true });
  });

  it("image : initialisation, envoi du fichier, puis post avec l'image", async () => {
    const net = installNetwork([
      { method: "POST", url: `${LI}/images`, fixture: "linkedin/images-init" },
      { url: "cdn.nebula.test/menu.jpg", raw: "image", headers: { "content-type": "image/jpeg" } },
      { method: "PUT", url: /^www\.linkedin\.com\/dms-uploads\//, status: 201, raw: "" },
      { method: "POST", url: `${LI}/posts`, status: 201, headers: { "x-restli-id": "urn:li:share:1" }, raw: "" }
    ]);
    await linkedinClient.publishPost(li(), post({ mediaUrls: ["https://cdn.nebula.test/menu.jpg"] }));
    expect(net.to(/rest\/posts$/)[0].json).toMatchObject({ content: { media: { id: "urn:li:image:C4E10AQFoyyAjHPMQuQ" } } });
    expect(net.to(/dms-uploads/, "PUT")[0].headers["content-type"]).toBe("image/jpeg");
  });

  it("vidéo en plusieurs morceaux, finalisation ; traitement en cours → point de reprise", async () => {
    const bytes = "x".repeat(2048);
    const net = installNetwork([
      { url: "cdn.nebula.test/v.mp4", raw: bytes, headers: { "content-type": "video/mp4" } },
      { method: "POST", url: `${LI}/videos`, times: 1, fixture: "linkedin/videos-init" },
      { method: "PUT", url: /^www\.linkedin\.com\/dms-uploads\//, status: 200, headers: { etag: "etag-part" }, raw: "" },
      { method: "POST", url: `${LI}/videos`, times: 1, status: 200, raw: "" },
      { url: /^api\.linkedin\.com\/rest\/videos\//, fixture: "linkedin/video-processing" }
    ]);
    const out = await linkedinClient.publishPost(li(), post({ mediaUrls: ["https://cdn.nebula.test/v.mp4"], mediaType: "VIDEO", waitUntil: Date.now() }));
    expect(isPendingPublish(out)).toBe(true);
    expect(net.to(/dms-uploads/, "PUT").map((r) => r.bytes)).toEqual([1024, 1024]);
    expect(net.to(/rest\/videos$/, "POST")[1].json).toMatchObject({ finalizeUploadRequest: { video: "urn:li:video:C5505AQHoV1qvnFtKA", uploadedPartIds: ["etag-part", "etag-part"] } });
  });

  it("version retirée (426) : classée « version d'API retirée »", async () => {
    installNetwork([{ method: "POST", url: `${LI}/posts`, status: 426, fixture: "linkedin/error-version" }]);
    expect(classifyProviderError(await linkedinClient.publishPost(li(), post()).catch((e) => e)).category).toBe("VERSION_SUNSET");
  });

  it("connexion : profil OpenID", async () => {
    installNetwork([
      { method: "POST", url: "www.linkedin.com/oauth/v2/accessToken", fixture: "linkedin/oauth-token" },
      { url: "api.linkedin.com/v2/userinfo", fixture: "linkedin/userinfo" }
    ]);
    expect(await linkedinClient.exchangeCodeForToken("CODE")).toMatchObject({ externalAccountId: "782bbtaQ", displayName: "Lucas Exemple" });
  });
});

describe("Pinterest", () => {
  it("épingle image dans le premier tableau : identifiant et lien", async () => {
    const net = installNetwork([
      { url: `${PIN}/boards`, fixture: "pinterest/boards" },
      { method: "POST", url: `${PIN}/pins`, fixture: "pinterest/pin-created" }
    ]);
    const out = await pinterestClient.publishPost(pin(), post({ mediaUrls: ["https://cdn.nebula.test/menu.jpg"] }));
    expect(out).toEqual({ externalPostId: "813744226420795884", externalUrl: "https://www.pinterest.com/pin/813744226420795884/" });
    expect(net.to(/v5\/pins$/, "POST")[0].json).toMatchObject({ board_id: "549755885176", media_source: { source_type: "image_url", url: "https://cdn.nebula.test/menu.jpg" } });
  });

  it("vidéo : enregistrement, envoi vers le stockage, traitement terminé, épingle", async () => {
    const net = installNetwork([
      { method: "POST", url: `${PIN}/media`, fixture: "pinterest/media-register" },
      { url: "cdn.nebula.test/v.mp4", raw: "video", headers: { "content-type": "video/mp4" } },
      { method: "POST", url: "pinterest-media-upload.s3-accelerate.amazonaws.com/", status: 204 },
      { url: `${PIN}/media/5310999999999999999`, fixture: "pinterest/media-succeeded" },
      { method: "POST", url: `${PIN}/pins`, fixture: "pinterest/pin-created" }
    ]);
    const out = await pinterestClient.publishPost(pin(), post({ mediaUrls: ["https://cdn.nebula.test/v.mp4"], mediaType: "VIDEO", pinterest: { boardId: "549755885176" } }));
    expect(out).toMatchObject({ externalPostId: "813744226420795884" });
    expect(net.to(/v5\/pins$/, "POST")[0].json).toMatchObject({ media_source: { source_type: "video_id", media_id: "5310999999999999999" } });
  });

  it("dérive : tableau sans identifiant → réponse inattendue avant tout envoi", async () => {
    const net = installNetwork([{ url: `${PIN}/boards`, body: { items: [{ name: "Recettes" }], bookmark: null } }]);
    const err = (await listPinterestBoards(pin()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(net.to(/v5\/pins$/)).toHaveLength(0);
  });

  it("nouveau : vérification « déjà en ligne ? » (date sans fuseau lue en UTC)", async () => {
    installNetwork([{ url: `${PIN}/pins`, fixture: "pinterest/pins-list" }]);
    const recent = await pinterestClient.listRecentPosts!(pin());
    expect(recent[0]).toEqual({
      externalPostId: "813744226420795884",
      text: "Nouveau menu d'automne ☕ #cafe",
      permalink: "https://www.pinterest.com/pin/813744226420795884/",
      publishedAt: new Date("2026-09-24T08:15:30Z")
    });
    // L'épingle envoyée à 08:15:10 est bien retrouvée par la comparaison du lot 6.
    const match = matchRecentPost(recent, { text: "Nouveau menu d'automne ☕ #cafe", since: new Date("2026-09-24T08:15:10Z"), until: new Date("2026-09-24T08:16:00Z"), excludeIds: [] });
    expect(match?.externalPostId).toBe("813744226420795884");
  });

  it("statistiques du compte et des épingles", async () => {
    installNetwork([
      { url: `${PIN}/user_account`, fixture: "pinterest/user-account" },
      { url: `${PIN}/user_account/analytics`, fixture: "pinterest/user-analytics" },
      { url: `${PIN}/pins`, fixture: "pinterest/pins-list" },
      { url: `${PIN}/pins/813744226420795884/analytics`, fixture: "pinterest/pin-analytics" }
    ]);
    expect(await pinterestClient.fetchAnalytics(pin())).toMatchObject({ followers: 130, impressions: 3400, postsCount: 42, engagementRate: 3.53 });
    const metrics = await pinterestClient.fetchPostMetrics!(pin());
    expect(metrics[0]).toMatchObject({ views: 880, saves: 12, comments: 2, thumbnailUrl: "https://i.pinimg.com/400x300/exemple.jpg" });
  });

  it("connexion : compte professionnel", async () => {
    installNetwork([
      { method: "POST", url: `${PIN}/oauth/token`, fixture: "pinterest/oauth-token" },
      { url: `${PIN}/user_account`, fixture: "pinterest/user-account" }
    ]);
    expect(await pinterestClient.exchangeCodeForToken("CODE")).toMatchObject({ externalAccountId: "549755885175", displayName: "Café Nebula", handle: "@cafenebula" });
  });
});
