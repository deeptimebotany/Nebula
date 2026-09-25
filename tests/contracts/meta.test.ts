// Contrats Instagram / Facebook (Graph API de Meta) — lot 7.
// Réponses types d'après la documentation officielle :
//  - https://developers.facebook.com/docs/instagram-platform/content-publishing
//  - https://developers.facebook.com/docs/instagram-platform/reference/ig-media/insights
//  - https://developers.facebook.com/docs/graph-api/reference/page/photos
//  - https://developers.facebook.com/docs/graph-api/reference/page/feed
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } } }));

import { SocialApiError, UNEXPECTED_RESPONSE, isPendingPublish, type ConnectionLike, type PublishInput } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { exchangeMetaCode, facebookClient, instagramClient } from "@/lib/social/meta";
import { API_VERSIONS } from "@/lib/social/versions";
import { fixture, installNetwork, without, withValue } from "./harness";

const V = API_VERSIONS.META_GRAPH.version;
const G = `graph.facebook.com/${V}`;

const ig = (): ConnectionLike => ({ id: "c-ig", externalAccountId: "17841400000000001", accessToken: "TOKEN-IG", refreshToken: null, tokenExpiresAt: null, scopes: "" });
const fb = (): ConnectionLike => ({ id: "c-fb", externalAccountId: "101010101010101", accessToken: "TOKEN-PAGE", refreshToken: null, tokenExpiresAt: null, scopes: "page_token" });
const photo = (over: Partial<PublishInput> = {}): PublishInput => ({
  caption: "Nouveau menu d'automne ☕ #cafe",
  mediaUrls: ["https://cdn.nebula.test/menu.jpg"],
  mediaType: "IMAGE",
  waitUntil: Date.now() + 5_000,
  ...over
});

beforeEach(() => {
  process.env.META_APP_ID = "app-id";
  process.env.META_APP_SECRET = "app-secret";
  process.env.META_REDIRECT_URI = "https://nebulahub.space/api/connections/meta/callback";
  delete process.env.META_GRAPH_VERSION;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Instagram : publication d'une photo", () => {
  it("envoie la bonne version, le jeton dans le corps (jamais dans l'adresse) et renvoie le vrai lien", async () => {
    const net = installNetwork([
      { method: "POST", url: `${G}/17841400000000001/media`, fixture: "meta/ig-container-created" },
      { url: `${G}/17889455560051444`, fixture: "meta/ig-container-finished" },
      { method: "POST", url: `${G}/17841400000000001/media_publish`, fixture: "meta/ig-media-publish" },
      { url: `${G}/17920238422030506`, fixture: "meta/ig-media-permalink" }
    ]);
    const out = await instagramClient.publishPost(ig(), photo());
    expect(out).toEqual({ externalPostId: "17920238422030506", externalUrl: "https://www.instagram.com/p/C0dEfGhIjKl/" });

    const [create] = net.to(/\/media$/, "POST");
    expect(create.url.search).toBe("");
    expect(create.form?.get("access_token")).toBe("TOKEN-IG");
    expect(create.form?.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
    expect(create.form?.get("image_url")).toBe("https://cdn.nebula.test/menu.jpg");
    expect(create.form?.get("caption")).toBe("Nouveau menu d'automne ☕ #cafe");
    expect(net.to(/media_publish$/)[0].form?.get("creation_id")).toBe("17889455560051444");
    expect(net.unmatched).toEqual([]);
  });

  it("vidéo encore en traitement : point de reprise, aucune publication", async () => {
    installNetwork([
      { method: "POST", url: `${G}/17841400000000001/media`, fixture: "meta/ig-container-created" },
      { url: `${G}/17889455560051444`, fixture: "meta/ig-container-in-progress" }
    ]);
    const out = await instagramClient.publishPost(ig(), photo({ mediaType: "VIDEO", mediaUrls: ["https://cdn.nebula.test/v.mp4"], waitUntil: Date.now() }));
    expect(isPendingPublish(out)).toBe(true);
  });

  it("média refusé par Instagram (statut ERROR) : erreur de média, pas d'appel de publication", async () => {
    const net = installNetwork([
      { method: "POST", url: `${G}/17841400000000001/media`, fixture: "meta/ig-container-created" },
      { url: `${G}/17889455560051444`, fixture: "meta/ig-container-error" }
    ]);
    const err = (await instagramClient.publishPost(ig(), photo()).catch((e) => e)) as SocialApiError;
    expect(err).toBeInstanceOf(SocialApiError);
    expect(net.to(/media_publish$/)).toHaveLength(0);
  });

  it("dérive : « id » absent de media_publish → réponse inattendue, publication peut-être faite", async () => {
    installNetwork([
      { method: "POST", url: `${G}/17841400000000001/media`, fixture: "meta/ig-container-created" },
      { url: `${G}/17889455560051444`, fixture: "meta/ig-container-finished" },
      { method: "POST", url: `${G}/17841400000000001/media_publish`, body: { success: true } }
    ]);
    const err = (await instagramClient.publishPost(ig(), photo()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain(`POST ${G}/{id}/media_publish`);
    expect(err.message).toContain("champ « id » absent");
    expect(err.message).not.toContain("TOKEN-IG");
    const classified = classifyProviderError(err);
    expect(classified).toMatchObject({ category: "UNEXPECTED_RESPONSE", uncertain: true, autoRetry: false, outage: false });
  });

  it("dérive : statut du conteneur renommé → erreur immédiate au lieu d'une heure d'attente", async () => {
    installNetwork([
      { method: "POST", url: `${G}/17841400000000001/media`, fixture: "meta/ig-container-created" },
      { url: `${G}/17889455560051444`, body: without(fixture("meta/ig-container-finished"), "status_code") }
    ]);
    const err = (await instagramClient.publishPost(ig(), photo()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain("status_code");
  });

  it("jeton expiré (code 190) : connexion à refaire", async () => {
    installNetwork([{ method: "POST", url: `${G}/17841400000000001/media`, status: 400, fixture: "meta/error-token-expired" }]);
    const err = await instagramClient.publishPost(ig(), photo()).catch((e) => e);
    expect(classifyProviderError(err).category).toBe("AUTH_EXPIRED");
  });

  it("limite de débit transitoire (code 4, is_transient) : relance automatique autorisée", async () => {
    installNetwork([{ method: "POST", url: `${G}/17841400000000001/media`, status: 400, fixture: "meta/error-rate-limit" }]);
    const err = await instagramClient.publishPost(ig(), photo()).catch((e) => e);
    expect(classifyProviderError(err)).toMatchObject({ category: "TRANSIENT", autoRetry: true });
  });
});

describe("Instagram : lectures", () => {
  it("dernières publications (vérification « déjà en ligne ? ») : texte, lien et date UTC", async () => {
    installNetwork([{ url: `${G}/17841400000000001/media`, fixture: "meta/ig-media-list" }]);
    const posts = await instagramClient.listRecentPosts!(ig());
    expect(posts[0]).toEqual({
      externalPostId: "17920238422030506",
      text: "Nouveau menu d'automne ☕ #cafe",
      permalink: "https://www.instagram.com/p/C0dEfGhIjKl/",
      publishedAt: new Date("2026-09-24T08:15:30Z")
    });
  });

  it("dérive : liste sans « data » → erreur, jamais « aucune publication » (sinon doublon à la relance)", async () => {
    installNetwork([{ url: `${G}/17841400000000001/media`, body: { items: [] } }]);
    const err = (await instagramClient.listRecentPosts!(ig()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain("champ « data » absent");
  });

  it("statistiques par publication : compteurs et vues ; un compteur au type inattendu devient « — »", async () => {
    const list = withValue(fixture("meta/ig-media-list"), "data.1.like_count", { total: 130 });
    installNetwork([
      { url: `${G}/17841400000000001/media`, body: list },
      { url: /\/insights$/, fixture: "meta/ig-media-insights" }
    ]);
    const metrics = await instagramClient.fetchPostMetrics!(ig());
    expect(metrics[0]).toMatchObject({ postExternalId: "17920238422030506", likes: 42, comments: 5, views: 1234, shares: 3, saves: 9 });
    expect(metrics[0].thumbnailUrl).toBe("https://scontent.cdninstagram.com/v/menu.jpg");
    expect(metrics[1]).toMatchObject({ likes: null, comments: 12, thumbnailUrl: "https://scontent.cdninstagram.com/v/torrefaction.jpg" });
  });

  it("statistiques du compte : abonnés, portée (dernière valeur), vues (total)", async () => {
    installNetwork([
      { url: `${G}/17841400000000001`, fixture: "meta/ig-user-profile" },
      { url: `${G}/17841400000000001/insights`, reply: (req) => ({ raw: JSON.stringify(fixture(req.url.searchParams.get("metric") === "reach" ? "meta/ig-user-insights-reach" : "meta/ig-user-insights-views")) }) }
    ]);
    const stats = await instagramClient.fetchAnalytics(ig());
    expect(stats).toMatchObject({ followers: 1520, postsCount: 87, reach: 402, impressions: 5230 });
  });

  it("dérive : nombre d'abonnés en texte → erreur (jamais un faux 0 enregistré)", async () => {
    installNetwork([
      { url: `${G}/17841400000000001`, body: withValue(fixture("meta/ig-user-profile"), "followers_count", "1520") },
      { url: `${G}/17841400000000001/insights`, fixture: "meta/ig-user-insights-views" }
    ]);
    const err = (await instagramClient.fetchAnalytics(ig()).catch((e) => e)) as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(err.message).toContain("champ « followers_count » : nombre attendu, texte reçu");
  });

  it("commentaires reçus, avec la réponse du compte lui-même (Réussites, lot B)", async () => {
    const net = installNetwork([
      { url: `${G}/17841400000000001/media`, fixture: "meta/ig-media-list" },
      { url: /\/comments$/, fixture: "meta/ig-comments" }
    ]);
    const items = await instagramClient.fetchEngagement!(ig());
    expect(items[0]).toMatchObject({ type: "COMMENT", externalId: "17858893269000001", authorName: "client.fidele", text: "Trop bon !" });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-09-24T09:00:00.000Z");
    // Deux réponses : celle d'un autre compte est ignorée, celle du compte compte.
    expect(items[0].ownerRepliedAt?.toISOString()).toBe("2026-09-24T10:05:00.000Z");
    expect(items[1]).toMatchObject({ externalId: "17858893269000002" });
    expect(items[1].ownerRepliedAt).toBeUndefined();
    expect(net.to(/\/comments$/)[0].url.searchParams.get("fields")).toBe("id,text,username,timestamp,replies{from,username,timestamp}");
  });

  it("réponse repérée par le nom du compte quand Instagram ne donne pas l'identifiant", async () => {
    const reply = { id: "r1", username: "Cafe.Nebula", timestamp: "2026-09-24T10:05:00+0000" };
    installNetwork([
      { url: `${G}/17841400000000001/media`, fixture: "meta/ig-media-list" },
      { url: /\/comments$/, body: { data: [{ id: "c1", text: "Top", username: "client", timestamp: "2026-09-24T09:00:00+0000", replies: { data: [reply] } }] } }
    ]);
    const items = await instagramClient.fetchEngagement!({ ...ig(), handle: "@cafe.nebula" });
    expect(items[0].ownerRepliedAt?.toISOString()).toBe("2026-09-24T10:05:00.000Z");
  });

  it("réponses illisibles : le commentaire reste, sans réponse repérée", async () => {
    installNetwork([
      { url: `${G}/17841400000000001/media`, fixture: "meta/ig-media-list" },
      { url: /\/comments$/, body: { data: [{ id: "c1", text: "Top", username: "client", timestamp: "2026-09-24T09:00:00+0000", replies: "inattendu" }] } }
    ]);
    const items = await instagramClient.fetchEngagement!(ig());
    expect(items[0]).toMatchObject({ externalId: "c1", text: "Top" });
    expect(items[0].ownerRepliedAt).toBeUndefined();
  });
});

describe("Connexion Meta", () => {
  it("échange du code : jeton longue durée, Pages avec leur propre jeton, comptes Instagram liés", async () => {
    const net = installNetwork([
      { url: `${G}/oauth/access_token`, times: 1, fixture: "meta/oauth-token-short" },
      { url: `${G}/oauth/access_token`, times: 1, fixture: "meta/oauth-token-long" },
      { url: `${G}/me`, fixture: "meta/me" },
      { url: `${G}/me/accounts`, fixture: "meta/me-accounts" },
      { url: `${G}/17841400000000001`, fixture: "meta/ig-user" }
    ]);
    const { facebookPages, instagramAccounts } = await exchangeMetaCode("CODE");
    expect(facebookPages[0]).toMatchObject({ accessToken: "EAAB-exemple-page", externalAccountId: "101010101010101", displayName: "Café Nebula", authUserId: "10223344556677889" });
    expect(facebookPages[0].expiresAt).toBeUndefined();
    expect(instagramAccounts[0]).toMatchObject({ externalAccountId: "17841400000000001", handle: "@cafe.nebula", accessToken: "EAAB-exemple-long" });
    expect(instagramAccounts[0].expiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000);
    expect(net.to(/oauth\/access_token$/)[1].url.searchParams.get("grant_type")).toBe("fb_exchange_token");
  });

  it("durée du jeton absente : 60 jours par défaut (avant : date invalide)", async () => {
    installNetwork([
      { url: `${G}/oauth/access_token`, times: 1, fixture: "meta/oauth-token-short" },
      { url: `${G}/oauth/access_token`, times: 1, body: { access_token: "EAAB-long" } },
      { url: `${G}/me`, fixture: "meta/me" },
      { url: `${G}/me/accounts`, body: { data: [] } }
    ]);
    const { facebookPages } = await exchangeMetaCode("CODE");
    expect(facebookPages).toEqual([]);
  });
});

describe("Facebook", () => {
  it("photo : identifiant de la publication (post_id) et lien", async () => {
    const net = installNetwork([{ method: "POST", url: `${G}/101010101010101/photos`, fixture: "meta/fb-photo-created" }]);
    const out = await facebookClient.publishPost(fb(), photo());
    expect(out).toEqual({ externalPostId: "101010101010101_987654321098765", externalUrl: "https://www.facebook.com/101010101010101_987654321098765" });
    expect(net.sent[0].form?.get("url")).toBe("https://cdn.nebula.test/menu.jpg");
  });

  it("texte seul : fil de la Page", async () => {
    installNetwork([{ method: "POST", url: `${G}/101010101010101/feed`, fixture: "meta/fb-feed-created" }]);
    const out = await facebookClient.publishPost(fb(), photo({ mediaUrls: [] }));
    expect(out).toMatchObject({ externalPostId: "101010101010101_987654321098766" });
  });

  it("dernières publications et statistiques (réactions, commentaires, partages)", async () => {
    installNetwork([{ url: `${G}/101010101010101/posts`, fixture: "meta/fb-posts" }]);
    const recent = await facebookClient.listRecentPosts!(fb());
    expect(recent[0]).toMatchObject({ externalPostId: "101010101010101_987654321098765", publishedAt: new Date("2026-09-24T08:15:31Z") });
    const metrics = await facebookClient.fetchPostMetrics!(fb());
    expect(metrics[0]).toMatchObject({ likes: 12, comments: 4, shares: 3, views: null, saves: null });
  });

  it("commentaires reçus, avec la réponse de la Page (Réussites, lot B)", async () => {
    const net = installNetwork([
      { url: `${G}/101010101010101/posts`, fixture: "meta/fb-posts" },
      { url: /\/comments$/, fixture: "meta/fb-comments" }
    ]);
    const items = await facebookClient.fetchEngagement!(fb());
    expect(items[0]).toMatchObject({ externalId: "987654321098765_111111111111111", authorName: "Camille Martin", text: "Superbe menu !" });
    expect(items[0].ownerRepliedAt?.toISOString()).toBe("2026-09-24T12:40:00.000Z");
    expect(items[1].ownerRepliedAt).toBeUndefined();
    expect(net.to(/\/comments$/)[0].url.searchParams.get("fields")).toContain("comments.limit(10){from,created_time}");
  });

  it("statistiques de la Page : abonnés et vues du jour", async () => {
    installNetwork([
      { url: `${G}/101010101010101`, fixture: "meta/fb-page" },
      { url: `${G}/101010101010101/insights`, fixture: "meta/fb-page-insights" }
    ]);
    expect(await facebookClient.fetchAnalytics(fb())).toMatchObject({ followers: 980, impressions: 140 });
  });
});
