// Contrats des sources de l'audit de présence (produit n°8).
// Réponses types d'après la documentation officielle :
//  - YouTube : https://developers.google.com/youtube/v3/docs/channels/list,
//    .../playlistItems/list, .../videos/list (clé d'API, jamais search.list)
//  - Instagram : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
//  - TikTok : https://developers.tiktok.com/doc/embed-creator-profiles (oEmbed)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const alerts = vi.hoisted(() => ({ list: [] as { dedupeKey?: string }[] }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/owner-alerts", () => ({
  alertOwner: vi.fn(async (a: { dedupeKey?: string }) => {
    alerts.list.push(a);
  }),
  alertOwnerFormatChange: vi.fn(async () => undefined)
}));

import { auditYoutube, isoDurationSeconds } from "@/lib/audit/sources/youtube";
import { auditInstagram } from "@/lib/audit/sources/instagram";
import { auditTiktok } from "@/lib/audit/sources/tiktok";
import { installNetwork, withValue, fixture } from "./harness";

const YT = "www.googleapis.com/youtube/v3";
const GRAPH = /^graph\.facebook\.com\/v\d+\.0\/17841400000009999$/;

beforeEach(() => {
  alerts.list = [];
  process.env.YOUTUBE_API_KEY = "cle-youtube-test";
  process.env.IG_DISCOVERY_USER_ID = "17841400000009999";
  process.env.IG_DISCOVERY_TOKEN = "jeton-ig-test";
  delete process.env.META_APP_SECRET;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.IG_DISCOVERY_USER_ID;
  delete process.env.IG_DISCOVERY_TOKEN;
});

describe("audit — YouTube (clé d'API)", () => {
  it("chaîne par @pseudo : 3 appels (channels, playlistItems, videos), clé dans l'en-tête, jamais search.list", async () => {
    const net = installNetwork([
      { url: `${YT}/channels`, fixture: "audit/yt-channels" },
      { url: `${YT}/playlistItems`, fixture: "audit/yt-playlist" },
      { url: `${YT}/videos`, fixture: "audit/yt-videos" }
    ]);
    const out = await auditYoutube({ kind: "handle", value: "cafenebula" });
    expect(out.status).toBe("ok");
    expect(net.sent).toHaveLength(3);
    expect(net.to(/search/)).toHaveLength(0);
    const channels = net.to(/\/channels$/)[0];
    expect(channels.url.searchParams.get("forHandle")).toBe("@cafenebula");
    expect(channels.url.searchParams.get("part")).toBe("snippet,statistics,brandingSettings,contentDetails");
    for (const r of net.sent) {
      expect(r.headers["x-goog-api-key"]).toBe("cle-youtube-test");
      expect(r.url.searchParams.has("key")).toBe(false);
    }
    expect(net.to(/playlistItems/)[0].url.searchParams.get("playlistId")).toBe("UUaudit1234567890abcdefg");
    expect(net.to(/videos/)[0].url.searchParams.get("id")).toBe("vidA000001a,vidA000002b,vidA000003c");

    const f = out.facts!;
    expect(f).toMatchObject({ title: "Café Nebula", handle: "@cafenebula", subscribers: 12400, views: 845210, videoCount: 142, country: "FR", keywords: "café pâtisserie recettes" });
    expect(f.bannerUrl).toContain("banniere");
    expect(f.url).toBe("https://www.youtube.com/@cafenebula");
    // Triées de la plus récente à la plus ancienne ; champs manquants tolérés.
    expect(f.videos.map((v) => v.id)).toEqual(["vidA000001a", "vidA000002b", "vidA000003c"]);
    expect(f.videos[0]).toMatchObject({ durationSec: 34, views: 5100, likes: 310, comments: null, descriptionLength: 0, tagsCount: 0 });
    expect(f.videos[1].thumbnailUrl).toBe("https://i.ytimg.com/vi/vidA000002b/mqdefault.jpg");
    expect(f.videos[2]).toMatchObject({ durationSec: 492, comments: 18, tagsCount: 2 });
  });

  it("identifiant de chaîne et ancien nom d'utilisateur : bon filtre", async () => {
    const net = installNetwork([{ url: `${YT}/channels`, fixture: "audit/yt-channels-empty" }]);
    await auditYoutube({ kind: "id", value: "UCaudit1234567890abcdefg" });
    await auditYoutube({ kind: "username", value: "cafenebula" });
    expect(net.sent[0].url.searchParams.get("id")).toBe("UCaudit1234567890abcdefg");
    expect(net.sent[1].url.searchParams.get("forUsername")).toBe("cafenebula");
  });

  it("chaîne introuvable ; nombre d'abonnés masqué → null (jamais 0)", async () => {
    installNetwork([{ url: `${YT}/channels`, fixture: "audit/yt-channels-empty" }]);
    expect(await auditYoutube({ kind: "handle", value: "inconnue" })).toMatchObject({ status: "not_found" });

    const hidden = withValue(fixture("audit/yt-channels"), "items.0.statistics", { viewCount: "10", hiddenSubscriberCount: true, videoCount: "0" });
    vi.unstubAllGlobals();
    installNetwork([
      { url: `${YT}/channels`, body: hidden },
      { url: `${YT}/playlistItems`, status: 404, body: { error: { code: 404, message: "The playlist identified with the request's playlistId parameter cannot be found.", errors: [{ reason: "playlistNotFound" }] } } }
    ]);
    const out = await auditYoutube({ kind: "handle", value: "cafenebula" });
    expect(out.status).toBe("ok");
    expect(out.facts).toMatchObject({ subscribers: null, videos: [] });
  });

  it("quota épuisé : indisponible, sans alerte ; clé refusée : indisponible et propriétaire prévenu", async () => {
    installNetwork([{ url: `${YT}/channels`, status: 403, fixture: "audit/yt-error-quota" }]);
    expect(await auditYoutube({ kind: "handle", value: "cafenebula" })).toMatchObject({ status: "unavailable", message: expect.stringContaining("demain") });
    expect(alerts.list).toHaveLength(0);
    vi.unstubAllGlobals();
    installNetwork([{ url: `${YT}/channels`, status: 400, fixture: "audit/yt-error-key" }]);
    expect(await auditYoutube({ kind: "handle", value: "cafenebula" })).toMatchObject({ status: "unavailable" });
    expect(alerts.list.map((a) => a.dedupeKey)).toEqual(["audit:youtube-key"]);
  });

  it("sans clé : source désactivée, aucun appel", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const net = installNetwork([]);
    expect(await auditYoutube({ kind: "handle", value: "cafenebula" })).toMatchObject({ status: "disabled" });
    expect(net.sent).toHaveLength(0);
  });

  it("durées ISO 8601", () => {
    expect(isoDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(isoDurationSeconds("PT45S")).toBe(45);
    expect(isoDurationSeconds("P1DT1S")).toBe(86_401);
    expect(isoDurationSeconds("P0D")).toBe(0);
    expect(isoDurationSeconds(undefined)).toBe(0);
  });
});

describe("audit — Instagram (Business Discovery)", () => {
  it("compte professionnel : un seul appel, champs demandés, publications triées, j'aime masqués → null", async () => {
    const net = installNetwork([{ url: GRAPH, fixture: "audit/ig-discovery" }]);
    const out = await auditInstagram("cafe.nebula");
    expect(out.status).toBe("ok");
    expect(net.sent).toHaveLength(1);
    const fields = net.sent[0].url.searchParams.get("fields")!;
    expect(fields).toContain("business_discovery.username(cafe.nebula)");
    expect(fields).toContain("media.limit(25){caption,comments_count,like_count,media_type,media_product_type,permalink,timestamp}");
    expect(net.sent[0].url.searchParams.get("access_token")).toBe("jeton-ig-test");
    const f = out.facts!;
    expect(f).toMatchObject({ username: "cafe.nebula", followers: 5400, mediaCount: 318, website: "https://cafe-nebula.fr/" });
    expect(f.media.map((m) => m.timestamp.slice(0, 10))).toEqual(["2026-09-23", "2026-09-19", "2026-09-14"]);
    expect(f.media[0]).toMatchObject({ product: "REELS", likes: 240, comments: 12, hashtags: 3 });
    expect(f.media[1]).toMatchObject({ likes: null, hashtags: 0 });
  });

  it("compte personnel ou introuvable : « non lisible », avec l'explication", async () => {
    installNetwork([{ url: GRAPH, status: 400, fixture: "audit/ig-error-not-found" }]);
    const out = await auditInstagram("compte.perso");
    expect(out).toMatchObject({ status: "private", message: expect.stringContaining("professionnels") });
    expect(alerts.list).toHaveLength(0);
  });

  it("jeton expiré : indisponible, propriétaire prévenu une fois (clé de dédoublonnage)", async () => {
    installNetwork([{ url: GRAPH, status: 400, fixture: "audit/ig-error-token" }]);
    expect(await auditInstagram("cafe.nebula")).toMatchObject({ status: "unavailable" });
    expect(alerts.list.map((a) => a.dedupeKey)).toEqual(["audit:instagram-token"]);
  });

  it("sans jeton : désactivée, aucun appel", async () => {
    delete process.env.IG_DISCOVERY_TOKEN;
    const net = installNetwork([]);
    expect(await auditInstagram("cafe.nebula")).toMatchObject({ status: "disabled" });
    expect(net.sent).toHaveLength(0);
  });
});

describe("audit — TikTok (oEmbed public)", () => {
  it("profil trouvé : nom, description, adresse ; aucune clé", async () => {
    const net = installNetwork([{ url: "www.tiktok.com/oembed", fixture: "audit/tiktok-oembed" }]);
    const out = await auditTiktok("cafenebula");
    expect(out).toMatchObject({ status: "ok", facts: { username: "cafenebula", displayName: "Café Nebula", url: "https://www.tiktok.com/@cafenebula" } });
    expect(out.facts!.bio).toContain("Recettes");
    expect(net.sent[0].url.searchParams.get("url")).toBe("https://www.tiktok.com/@cafenebula");
  });

  it("profil inexistant (400) : introuvable ; panne : indisponible", async () => {
    installNetwork([{ url: "www.tiktok.com/oembed", status: 400, fixture: "audit/tiktok-oembed-error" }]);
    expect(await auditTiktok("personne")).toMatchObject({ status: "not_found" });
    vi.unstubAllGlobals();
    installNetwork([{ url: "www.tiktok.com/oembed", status: 503, raw: "Service Unavailable", times: 5 }]);
    expect(await auditTiktok("cafenebula")).toMatchObject({ status: "unavailable" });
  });
});
