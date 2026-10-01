// Répondre à un commentaire depuis Nebula (01/10/2026) : ce que chaque
// réseau reçoit. Requêtes d'après la documentation officielle :
//  - Instagram : POST /{ig-comment-id}/replies?message=… → {"id": …}
//  - Facebook : POST /{comment-id}/comments (message, jeton de Page) → {"id": …}
//  - Threads : POST /{user}/threads (TEXT, reply_to_id) puis /threads_publish
//  - Bluesky : getPosts du commentaire, puis createRecord avec reply {root, parent}
//  - YouTube : POST /comments?part=snippet {snippet: {parentId, textOriginal}}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } } }));

import { SocialApiError, type ConnectionLike } from "@/lib/social/base";
import { facebookClient, instagramClient } from "@/lib/social/meta";
import { threadsClient } from "@/lib/social/threads";
import { blueskyClient } from "@/lib/social/bluesky";
import { youtubeClient, youtubeCommentReplyEnabled } from "@/lib/social/youtube";
import { tiktokClient } from "@/lib/social/tiktok";
import { linkedinClient } from "@/lib/social/linkedin";
import { pinterestClient } from "@/lib/social/pinterest";
import { replyFailureMessage } from "@/lib/engagement/reply";
import { API_VERSIONS } from "@/lib/social/versions";
import { installNetwork } from "./harness";

const G = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;
const T = `graph.threads.net/${API_VERSIONS.THREADS.version}`;
const jwt = (exp: number) => `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
const conn = (over: Partial<ConnectionLike> = {}): ConnectionLike => ({
  id: "c1",
  externalAccountId: "ACC",
  accessToken: "TOKEN",
  refreshToken: null,
  tokenExpiresAt: null,
  scopes: "",
  ...over
});

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

describe("réponse à un commentaire, réseau par réseau", () => {
  it("Instagram : POST /{commentaire}/replies, texte dans le corps", async () => {
    const net = installNetwork([{ method: "POST", url: `${G}/17858893269000001/replies`, body: { id: "17873440459141021" } }]);
    const out = await instagramClient.replyToComment!(conn({ accessToken: "TOKEN-IG" }), { externalId: "17858893269000001" }, "  Merci beaucoup ! 🙏  ");
    expect(out).toEqual({ externalId: "17873440459141021" });
    expect(net.sent[0].form?.get("message")).toBe("Merci beaucoup ! 🙏");
    expect(net.sent[0].form?.get("access_token")).toBe("TOKEN-IG");
    expect(net.sent[0].url.searchParams.get("message")).toBeNull();
  });

  it("Facebook : POST /{commentaire}/comments avec le jeton de la Page", async () => {
    const net = installNetwork([{ method: "POST", url: `${G}/101_202_303/comments`, body: { id: "101_202_404" } }]);
    const out = await facebookClient.replyToComment!(conn({ accessToken: "TOKEN-PAGE", scopes: "page_token" }), { externalId: "101_202_303" }, "Avec plaisir !");
    expect(out).toEqual({ externalId: "101_202_404" });
    expect(net.sent[0].form?.get("access_token")).toBe("TOKEN-PAGE");
    expect(net.sent[0].form?.get("message")).toBe("Avec plaisir !");
  });

  it("Threads : conteneur TEXT sous la réponse reçue, puis publication", async () => {
    const net = installNetwork([
      { method: "POST", url: `${T}/ACC/threads`, body: { id: "CONT-1" } },
      { url: `${T}/CONT-1`, body: { status: "FINISHED" } },
      { method: "POST", url: `${T}/ACC/threads_publish`, body: { id: "1809999" } }
    ]);
    const out = await threadsClient.replyToComment!(conn({ tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000) }), { externalId: "1801234" }, "Merci !");
    expect(out).toEqual({ externalId: "1809999" });
    const create = net.to(/\/ACC\/threads$/, "POST")[0];
    expect(create.url.searchParams.get("reply_to_id")).toBe("1801234");
    expect(create.url.searchParams.get("media_type")).toBe("TEXT");
    expect(create.url.searchParams.get("text")).toBe("Merci !");
    expect(net.to(/threads_publish/, "POST")[0].url.searchParams.get("creation_id")).toBe("CONT-1");
  });

  it("Bluesky : parent = le commentaire, racine = la racine de son fil", async () => {
    const did = "did:plc:moi";
    const comment = "at://did:plc:fan/app.bsky.feed.post/c1";
    const root = { uri: `at://${did}/app.bsky.feed.post/p1`, cid: "bafyroot" };
    const net = installNetwork([
      { url: "public.api.bsky.app/xrpc/app.bsky.feed.getPosts", body: { posts: [{ uri: comment, cid: "bafycomment", record: { text: "Super !", reply: { root, parent: root } } }] } },
      { method: "POST", url: "pds.exemple.test/xrpc/com.atproto.repo.createRecord", body: { uri: `at://${did}/app.bsky.feed.post/r1`, cid: "bafyreply" } }
    ]);
    const out = await blueskyClient.replyToComment!(
      conn({ externalAccountId: did, accessToken: jwt(Math.floor(Date.now() / 1000) + 3600), scopes: "atproto pds=https://pds.exemple.test" }),
      { externalId: comment, postExternalId: root.uri },
      "Merci beaucoup !"
    );
    expect(out).toEqual({ externalId: `at://${did}/app.bsky.feed.post/r1` });
    const body = net.to(/createRecord/, "POST")[0].json as { repo: string; record: { text: string; reply: unknown } };
    expect(body.repo).toBe(did);
    expect(body.record.text).toBe("Merci beaucoup !");
    expect(body.record.reply).toEqual({ root, parent: { uri: comment, cid: "bafycomment" } });
  });

  it("Bluesky : commentaire supprimé → 404 explicite, rien de publié", async () => {
    const net = installNetwork([{ url: "public.api.bsky.app/xrpc/app.bsky.feed.getPosts", body: { posts: [] } }]);
    const err = await blueskyClient
      .replyToComment!(conn({ externalAccountId: "did:plc:moi", accessToken: jwt(Math.floor(Date.now() / 1000) + 3600) }), { externalId: "at://x/app.bsky.feed.post/y" }, "Merci")
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialApiError);
    expect(err.status).toBe(404);
    expect(net.to(/createRecord/)).toHaveLength(0);
  });

  it("YouTube : POST /comments?part=snippet avec parentId et textOriginal", async () => {
    const net = installNetwork([{ method: "POST", url: "www.googleapis.com/youtube/v3/comments", body: { id: "UgzREPLY.123" } }]);
    const out = await youtubeClient.replyToComment!(
      conn({ refreshToken: "1//r", tokenExpiresAt: new Date(Date.now() + 3_600_000), scopes: "youtube.upload,youtube.readonly,youtube.force-ssl" }),
      { externalId: "UgzTOP" },
      "Merci pour ton retour !"
    );
    expect(out).toEqual({ externalId: "UgzREPLY.123" });
    expect(net.sent[0].url.searchParams.get("part")).toBe("snippet");
    expect(net.sent[0].json).toEqual({ snippet: { parentId: "UgzTOP", textOriginal: "Merci pour ton retour !" } });
    expect(net.sent[0].headers.authorization).toBe("Bearer TOKEN");
  });

  it("YouTube : youtube.force-ssl demandé seulement avec YOUTUBE_COMMENT_REPLY=true", () => {
    process.env.YOUTUBE_CLIENT_ID = "yt-id";
    process.env.YOUTUBE_REDIRECT_URI = "https://nebulahub.space/api/connections/youtube/callback";
    expect(youtubeCommentReplyEnabled()).toBe(false);
    expect(new URL(youtubeClient.getAuthUrl("s")).searchParams.get("scope")).not.toContain("youtube.force-ssl");
    process.env.YOUTUBE_COMMENT_REPLY = "true";
    expect(new URL(youtubeClient.getAuthUrl("s")).searchParams.get("scope")).toContain("https://www.googleapis.com/auth/youtube.force-ssl");
  });

  it("TikTok, LinkedIn, Pinterest : pas de réponse (commentaires non lus par Nebula)", () => {
    expect(tiktokClient.replyToComment).toBeUndefined();
    expect(linkedinClient.replyToComment).toBeUndefined();
    expect(pinterestClient.replyToComment).toBeUndefined();
  });
});

describe("messages d'échec", () => {
  it("délai dépassé : jamais renvoyé tout seul, vérifier d'abord", () => {
    const out = replyFailureMessage(new SocialApiError("INSTAGRAM", "délai", undefined, undefined, "TIMEOUT"), "INSTAGRAM");
    expect(out).toMatchObject({ uncertain: true });
    expect(out.error).toMatch(/vérifiez sur Instagram/);
  });

  it("commentaire supprimé, connexion expirée, permission", () => {
    expect(replyFailureMessage(new SocialApiError("FACEBOOK", "does not exist", 400, undefined, "100/33"), "FACEBOOK").error).toMatch(/n'existe plus/);
    expect(replyFailureMessage(new SocialApiError("FACEBOOK", "Session has expired", 401, undefined, "190"), "FACEBOOK")).toMatchObject({ reconnect: true });
    expect(replyFailureMessage(new SocialApiError("INSTAGRAM", "(#10) Permission", 403, undefined, "10"), "INSTAGRAM")).toMatchObject({ reconnect: true });
  });
});
