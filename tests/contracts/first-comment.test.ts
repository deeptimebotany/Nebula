// Premier commentaire (07/10/2026) : la requête envoyée par chaque réseau
// qui le permet, et la traduction des refus. Docs officielles :
//  - YouTube : https://developers.google.com/youtube/v3/docs/commentThreads/insert
//  - Instagram : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments
//  - Facebook : https://developers.facebook.com/docs/graph-api/reference/object/comments
//  - Threads : https://developers.facebook.com/docs/threads/reply-management
//  - LinkedIn : https://learn.microsoft.com/linkedin/marketing/community-management/shares/comments-api
//  - Bluesky : https://docs.bsky.app/docs/advanced-guides/posts#replies
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } } }));

import { SocialApiError, type ConnectionLike } from "@/lib/social/base";
import { facebookClient, instagramClient } from "@/lib/social/meta";
import { threadsClient } from "@/lib/social/threads";
import { linkedinClient } from "@/lib/social/linkedin";
import { youtubeClient } from "@/lib/social/youtube";
import { tiktokClient } from "@/lib/social/tiktok";
import { pinterestClient } from "@/lib/social/pinterest";
import { API_VERSIONS } from "@/lib/social/versions";
import { firstCommentFailure, FIRST_COMMENT_MAX_ATTEMPTS } from "@/lib/first-comment";
import { firstCommentSupport } from "@/lib/social/first-comment-support";
import { installNetwork } from "./harness";

const G = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;
const T = `graph.threads.net/${API_VERSIONS.THREADS.version}`;
const conn = (over: Partial<ConnectionLike> = {}): ConnectionLike => ({
  id: "c1",
  externalAccountId: "ACC",
  accessToken: "TOKEN",
  refreshToken: null,
  tokenExpiresAt: null,
  scopes: "",
  ...over
});
const YT_SCOPES = "youtube.upload,youtube.readonly,youtube.force-ssl";

beforeEach(() => {
  process.env.META_APP_ID = "app-id";
  process.env.META_APP_SECRET = "app-secret";
  delete process.env.META_GRAPH_VERSION;
  delete process.env.YOUTUBE_COMMENT_REPLY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("premier commentaire : la requête de chaque réseau", () => {
  it("YouTube : commentThreads.insert, commentaire principal sous la vidéo (videoId + textOriginal)", async () => {
    const net = installNetwork([{ method: "POST", url: "www.googleapis.com/youtube/v3/commentThreads", body: { id: "UgzTHREAD.1", snippet: { videoId: "VID123" } } }]);
    await youtubeClient.postComment!(conn({ refreshToken: "1//r", tokenExpiresAt: new Date(Date.now() + 3_600_000), scopes: YT_SCOPES }), "VID123", "  Le lien est en description 👇  ");
    expect(net.sent[0].url.searchParams.get("part")).toBe("snippet");
    expect(net.sent[0].json).toEqual({ snippet: { videoId: "VID123", topLevelComment: { snippet: { textOriginal: "Le lien est en description 👇" } } } });
    expect(net.sent[0].headers.authorization).toBe("Bearer TOKEN");
  });

  it("YouTube sans l'autorisation de commenter : refus clair, aucun appel", async () => {
    const net = installNetwork([]);
    const err = await youtubeClient.postComment!(conn({ scopes: "youtube.upload,youtube.readonly" }), "VID123", "Coucou").catch((e) => e);
    expect(err).toBeInstanceOf(SocialApiError);
    expect((err as SocialApiError).status).toBe(403);
    expect(net.sent).toHaveLength(0);
  });

  it("Instagram : POST /{media}/comments avec message", async () => {
    const net = installNetwork([{ method: "POST", url: `${G}/17900000000000001/comments`, body: { id: "17858893269000009" } }]);
    await instagramClient.postComment!(conn({ accessToken: "TOKEN-IG" }), "17900000000000001", "Lien en bio 👇");
    expect(net.sent[0].form?.get("message") ?? (net.sent[0].json as { message?: string } | undefined)?.message ?? net.sent[0].url.searchParams.get("message")).toBe("Lien en bio 👇");
  });

  it("Facebook : POST /{publication}/comments avec le jeton de la Page", async () => {
    const net = installNetwork([{ method: "POST", url: `${G}/101_202/comments`, body: { id: "101_202_303" } }]);
    await facebookClient.postComment!(conn({ accessToken: "TOKEN-PAGE", scopes: "page_token" }), "101_202", "Le lien : https://nebulahub.space");
    const sent = net.sent[0];
    const message = sent.form?.get("message") ?? sent.url.searchParams.get("message");
    expect(message).toBe("Le lien : https://nebulahub.space");
    expect(JSON.stringify([sent.headers, sent.url.search, sent.body])).toContain("TOKEN-PAGE");
  });

  it("Threads : réponse à la publication (reply_to_id) puis threads_publish", async () => {
    const net = installNetwork([
      { method: "POST", url: `${T}/ACC/threads`, body: { id: "CONT1" } },
      { method: "GET", url: `${T}/CONT1`, body: { id: "CONT1", status: "FINISHED" } },
      { method: "POST", url: `${T}/ACC/threads_publish`, body: { id: "REPLY1" } }
    ]);
    await threadsClient.postComment!(conn({ tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000) }), "1801234", "Suite en commentaire");
    const container = net.sent[0];
    const params = container.form ?? container.url.searchParams;
    expect(params.get("reply_to_id")).toBe("1801234");
    expect(params.get("media_type")).toBe("TEXT");
    expect(net.to(/threads_publish$/)).toHaveLength(1);
  });

  it("LinkedIn : POST /rest/socialActions/{urn}/comments (actor, object, message)", async () => {
    const net = installNetwork([{ method: "POST", url: /^api\.linkedin\.com\/rest\/socialActions\/.+\/comments$/, status: 201, raw: "" }]);
    await linkedinClient.postComment!(conn({ externalAccountId: "abc123", tokenExpiresAt: new Date(Date.now() + 86_400_000) }), "urn:li:share:7000000000000000001", "Le lien en commentaire");
    const sent = net.sent[0];
    expect(sent.url.pathname).toBe("/rest/socialActions/urn%3Ali%3Ashare%3A7000000000000000001/comments");
    expect(sent.json).toMatchObject({ object: "urn:li:share:7000000000000000001", message: { text: "Le lien en commentaire" } });
    expect((sent.json as { actor: string }).actor).toMatch(/^urn:li:person:abc123$/);
  });

  it("TikTok, Pinterest : pas de premier commentaire (aucune API pour commenter)", () => {
    expect(tiktokClient.postComment).toBeUndefined();
    expect(pinterestClient.postComment).toBeUndefined();
    expect(firstCommentSupport("TIKTOK", null)).toMatchObject({ mode: "unsupported", reason: expect.stringMatching(/TikTok ne permet pas/) });
    expect(firstCommentSupport("PINTEREST", null)).toMatchObject({ mode: "unsupported", reason: expect.stringMatching(/Pinterest ne permet pas/) });
  });
});

describe("premier commentaire : ce qui est possible, compte par compte", () => {
  it("YouTube : autorisation de commenter, vidéo privée, vidéo pour enfants", () => {
    expect(firstCommentSupport("YOUTUBE", { scopes: "youtube.upload,youtube.readonly" })).toMatchObject({ mode: "unsupported", reason: expect.stringMatching(/pas encore activée sur Nebula/) });
    expect(firstCommentSupport("YOUTUBE", { scopes: "youtube.upload" }, { youtubeCommentsEnabled: true })).toMatchObject({ mode: "unsupported", reconnect: true });
    expect(firstCommentSupport("YOUTUBE", { scopes: YT_SCOPES })).toEqual({ mode: "api", maxLength: 10000 });
    expect(firstCommentSupport("YOUTUBE", { scopes: YT_SCOPES }, { youtube: { privacyStatus: "private" } })).toMatchObject({ mode: "unsupported", reason: expect.stringMatching(/Vidéo privée/) });
    expect(firstCommentSupport("YOUTUBE", { scopes: YT_SCOPES }, { youtube: { privacyStatus: "unlisted", madeForKids: true } })).toMatchObject({ reason: expect.stringMatching(/conçue pour les enfants/) });
    expect(firstCommentSupport("YOUTUBE", { scopes: YT_SCOPES }, { youtube: { privacyStatus: "unlisted" } })).toMatchObject({ mode: "api" });
  });

  it("longueurs propres à chaque réseau", () => {
    expect(firstCommentSupport("BLUESKY", null)).toEqual({ mode: "api", maxLength: 300 });
    expect(firstCommentSupport("THREADS", null)).toEqual({ mode: "api", maxLength: 500 });
    expect(firstCommentSupport("LINKEDIN", null)).toEqual({ mode: "api", maxLength: 1250 });
    expect(firstCommentSupport("INSTAGRAM", null)).toEqual({ mode: "api", maxLength: 2200 });
  });
});

describe("premier commentaire : refus traduits, relances sans doublon", () => {
  const yt = (status: number, reason: string, message = "x") => new SocialApiError("YOUTUBE", message, status, { error: { code: status, message, errors: [{ reason, domain: "youtube.commentThread" }] } });

  it("YouTube : commentaires désactivés → échec expliqué ; vidéo pas encore traitée → nouvel essai", () => {
    expect(firstCommentFailure("YOUTUBE", yt(403, "commentsDisabled", "The video identified by the videoId parameter has disabled comments."), 1)).toEqual({
      status: "FAILED",
      error: expect.stringMatching(/commentaires sont désactivés/)
    });
    expect(firstCommentFailure("YOUTUBE", yt(404, "videoNotFound"), 1)).toMatchObject({ status: "WAITING" });
    expect(firstCommentFailure("YOUTUBE", yt(404, "videoNotFound"), FIRST_COMMENT_MAX_ATTEMPTS)).toMatchObject({ status: "FAILED", error: expect.stringMatching(/peut-être privée/) });
  });

  it("YouTube 403 (vidéo privée, appli pas encore validée par Google) : la cause probable est dite", () => {
    expect(firstCommentFailure("YOUTUBE", yt(403, "forbidden"), 1).error).toMatch(/application que Google n'a pas encore validée/);
  });

  it("pas de réponse : JAMAIS renvoyé (le commentaire est peut-être en ligne)", () => {
    const timeout = new SocialApiError("INSTAGRAM", "le réseau n'a pas répondu à temps.", 504, undefined, "TIMEOUT");
    expect(firstCommentFailure("INSTAGRAM", timeout, 1)).toEqual({ status: "FAILED", error: expect.stringMatching(/a peut-être été publié/) });
  });

  it("limite de débit ou panne avec réponse : nouvel essai, puis échec après le dernier", () => {
    const limited = new SocialApiError("INSTAGRAM", "Application request limit reached", 400, { error: { code: 4, message: "Application request limit reached" } }, "4");
    expect(firstCommentFailure("INSTAGRAM", limited, 1)).toMatchObject({ status: "WAITING" });
    expect(firstCommentFailure("INSTAGRAM", limited, FIRST_COMMENT_MAX_ATTEMPTS)).toMatchObject({ status: "FAILED", error: expect.stringMatching(/plusieurs fois de suite/) });
  });

  it("permission refusée (Meta code 10) ou connexion expirée : reconnecter, sans relance", () => {
    const perm = new SocialApiError("THREADS", "Application does not have permission for this action", 400, { error: { code: 10, message: "Application does not have permission for this action" } }, "10");
    expect(firstCommentFailure("THREADS", perm, 1)).toMatchObject({ status: "FAILED", error: expect.stringMatching(/n'a pas l'autorisation de commenter.*Reconnectez/) });
    const expired = new SocialApiError("LINKEDIN", "Connexion LinkedIn expirée : reconnectez le compte.", 401);
    expect(firstCommentFailure("LINKEDIN", expired, 1)).toMatchObject({ status: "FAILED", error: expect.stringMatching(/a expiré/) });
  });
});
