// « Supprimer aussi sur … » (01/10/2026) : ce que chaque réseau reçoit pour
// retirer une publication, et ce qui compte comme « déjà supprimée ».
// Requêtes d'après la documentation officielle :
//  - Facebook : DELETE /{post-id} (pages_manage_posts) → {"success": true}
//  - Instagram : DELETE /{ig-media-id} (instagram_manage_contents) → {"success": true, "deleted_id": …}
//  - Threads : DELETE /{threads-media-id} (threads_delete) → {"success": true}
//  - LinkedIn : DELETE /rest/posts/{urn encodée} → 204
//  - Pinterest : DELETE /v5/pins/{pin_id} → 204
//  - Bluesky : POST com.atproto.repo.deleteRecord {repo, collection, rkey}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } } }));

import { SocialApiError, type ConnectionLike } from "@/lib/social/base";
import { facebookClient, instagramClient, instagramDeleteEnabled, metaOAuthScopes } from "@/lib/social/meta";
import { threadsClient } from "@/lib/social/threads";
import { linkedinClient } from "@/lib/social/linkedin";
import { pinterestClient } from "@/lib/social/pinterest";
import { blueskyClient } from "@/lib/social/bluesky";
import { tiktokClient } from "@/lib/social/tiktok";
import { youtubeClient } from "@/lib/social/youtube";
import { deleteFailureMessage, isAlreadyGone } from "@/lib/posts/remote-delete";
import { API_VERSIONS } from "@/lib/social/versions";
import { installNetwork } from "./harness";

const G = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;
const T = `graph.threads.net/${API_VERSIONS.THREADS.version}`;

// JWT Bluesky valide encore 1 h (seul exp est lu).
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
  delete process.env.META_INSTAGRAM_DELETE;
  delete process.env.LINKEDIN_API_VERSION;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("suppression sur chaque réseau", () => {
  it("Facebook : DELETE /{id} avec le jeton de la Page et la preuve app secret", async () => {
    const net = installNetwork([{ method: "DELETE", url: `${G}/101_202`, body: { success: true } }]);
    await facebookClient.deletePost!(conn({ accessToken: "TOKEN-PAGE", scopes: "page_token" }), "101_202");
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0].url.searchParams.get("access_token")).toBe("TOKEN-PAGE");
    expect(net.sent[0].url.searchParams.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Facebook : success false → erreur (jamais « supprimée » à tort)", async () => {
    installNetwork([{ method: "DELETE", url: `${G}/101_202`, body: { success: false } }]);
    await expect(facebookClient.deletePost!(conn({ scopes: "page_token" }), "101_202")).rejects.toBeInstanceOf(SocialApiError);
  });

  it("Instagram : DELETE /{id-du-média}", async () => {
    const net = installNetwork([{ method: "DELETE", url: `${G}/17890000000000001`, body: { success: true, deleted_id: "17890000000000001" } }]);
    await instagramClient.deletePost!(conn({ accessToken: "TOKEN-IG" }), "17890000000000001");
    expect(net.sent[0].method).toBe("DELETE");
  });

  it("Threads : DELETE /{id}", async () => {
    const net = installNetwork([{ method: "DELETE", url: `${T}/1801234`, body: { success: true, deleted_id: "1801234" } }]);
    await threadsClient.deletePost!(conn({ tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000) }), "1801234");
    expect(net.sent[0].url.searchParams.get("access_token")).toBe("TOKEN");
  });

  it("LinkedIn : DELETE /rest/posts/{urn encodée} avec les en-têtes de version", async () => {
    const net = installNetwork([{ method: "DELETE", url: /^api\.linkedin\.com\/rest\/posts\//, status: 204, raw: "" }]);
    await linkedinClient.deletePost!(conn({ tokenExpiresAt: new Date(Date.now() + 86_400_000) }), "urn:li:share:6844785523593134080");
    expect(net.sent[0].url.pathname).toBe("/rest/posts/urn%3Ali%3Ashare%3A6844785523593134080");
    expect(net.sent[0].headers["linkedin-version"]).toBe(API_VERSIONS.LINKEDIN.version);
    expect(net.sent[0].headers["x-restli-protocol-version"]).toBe("2.0.0");
  });

  it("Pinterest : DELETE /v5/pins/{id}, réponse 204 sans corps", async () => {
    const net = installNetwork([{ method: "DELETE", url: "api.pinterest.com/v5/pins/813744226420795884", status: 204, raw: "" }]);
    await pinterestClient.deletePost!(conn({ tokenExpiresAt: new Date(Date.now() + 20 * 86_400_000) }), "813744226420795884");
    expect(net.sent[0].headers.authorization).toBe("Bearer TOKEN");
  });

  it("Bluesky : deleteRecord sur le serveur du compte, avec repo, collection et rkey", async () => {
    const did = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
    const net = installNetwork([{ method: "POST", url: "pds.exemple.test/xrpc/com.atproto.repo.deleteRecord", body: {} }]);
    await blueskyClient.deletePost!(
      conn({ externalAccountId: did, accessToken: jwt(Math.floor(Date.now() / 1000) + 3600), scopes: "atproto pds=https://pds.exemple.test" }),
      `at://${did}/app.bsky.feed.post/3lbexemple2x`
    );
    expect(net.sent[0].json).toEqual({ repo: did, collection: "app.bsky.feed.post", rkey: "3lbexemple2x" });
  });

  it("Bluesky : publication d'un autre compte → refus, sans appel réseau", async () => {
    const net = installNetwork([]);
    const err = await blueskyClient
      .deletePost!(conn({ externalAccountId: "did:plc:moi", accessToken: jwt(Math.floor(Date.now() / 1000) + 3600) }), "at://did:plc:autre/app.bsky.feed.post/abc")
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialApiError);
    expect(net.sent).toHaveLength(0);
  });

  it("TikTok et YouTube : pas de suppression depuis Nebula", () => {
    expect(tiktokClient.deletePost).toBeUndefined();
    expect(youtubeClient.deletePost).toBeUndefined();
  });
});

describe("déjà supprimée, ou échec", () => {
  it("404/410, et « objet introuvable » de Meta (100/33) : déjà absente", () => {
    expect(isAlreadyGone(new SocialApiError("PINTEREST", "Pin not found", 404))).toBe(true);
    expect(isAlreadyGone(new SocialApiError("LINKEDIN", "gone", 410))).toBe(true);
    expect(isAlreadyGone(new SocialApiError("FACEBOOK", "Unsupported delete request", 400, undefined, "100/33"))).toBe(true);
    expect(isAlreadyGone(new SocialApiError("FACEBOOK", "Permissions error", 403, undefined, "200"))).toBe(false);
    expect(isAlreadyGone(new SocialApiError("FACEBOOK", "Invalid parameter", 400, undefined, "100"))).toBe(false);
    expect(isAlreadyGone(new Error("réseau"))).toBe(false);
  });

  it("messages d'échec : connexion expirée, permission, délai dépassé", () => {
    expect(deleteFailureMessage(new SocialApiError("FACEBOOK", "Session has expired", 401, undefined, "190"), "FACEBOOK")).toMatch(/reconnectez le compte/);
    expect(deleteFailureMessage(new SocialApiError("FACEBOOK", "(#200) Permissions error", 403, undefined, "200"), "FACEBOOK")).toMatch(/autorisations/);
    const timeout = new SocialApiError("LINKEDIN", "délai", undefined, undefined, "TIMEOUT");
    expect(deleteFailureMessage(timeout, "LINKEDIN")).toBe(
      "LinkedIn n'a pas répondu à temps : vérifiez sur LinkedIn si la publication est encore en ligne, puis réessayez."
    );
  });
});

describe("permission Instagram de suppression (META_INSTAGRAM_DELETE)", () => {
  it("désactivée par défaut : la liste demandée à Meta ne change pas", () => {
    expect(instagramDeleteEnabled()).toBe(false);
    expect(metaOAuthScopes()).not.toContain("instagram_manage_contents");
  });

  it("activée : instagram_manage_contents demandée en plus, et dans l'adresse de connexion", () => {
    process.env.META_INSTAGRAM_DELETE = "true";
    process.env.META_REDIRECT_URI = "https://nebulahub.space/api/connections/meta/callback";
    expect(metaOAuthScopes()).toContain("instagram_manage_contents");
    const url = new URL(instagramClient.getAuthUrl("etat"));
    expect(url.searchParams.get("scope")!.split(",")).toContain("instagram_manage_contents");
  });
});
