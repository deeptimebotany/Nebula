// Format de la publication (07/10/2026) : Publication, Reel ou Story sur
// Instagram et Facebook, Short ou vidéo sur YouTube (décidé par YouTube).
// Requêtes d'après la documentation officielle :
//  - Instagram : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
//  - Reels Facebook : https://developers.facebook.com/docs/video-api/guides/reels-publishing
//  - Stories Facebook : https://developers.facebook.com/docs/page-stories-api
//  - Photos multiples : https://developers.facebook.com/docs/graph-api/reference/page/feed (attached_media)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } } }));

import { SocialApiError, type ConnectionLike, type PublishInput } from "@/lib/social/base";
import { facebookClient, instagramClient } from "@/lib/social/meta";
import { API_VERSIONS } from "@/lib/social/versions";
import { defaultFormat, effectiveFormat, formatOptions, formatProblem, youtubeKind, youtubeKindText, type MediaFacts } from "@/lib/social/post-format";
import { firstCommentSupport } from "@/lib/social/first-comment-support";
import { installNetwork } from "./harness";

const V = API_VERSIONS.META_GRAPH.version;
const G = `graph.facebook.com/${V}`;
const IG = "17841400000000001";
const PAGE = "101010101010101";
const ig = (): ConnectionLike => ({ id: "c-ig", externalAccountId: IG, accessToken: "TOKEN-IG", refreshToken: null, tokenExpiresAt: null, scopes: "" });
const fb = (): ConnectionLike => ({ id: "c-fb", externalAccountId: PAGE, accessToken: "TOKEN-PAGE", refreshToken: null, tokenExpiresAt: null, scopes: "page_token" });
const video = (over: Partial<PublishInput> = {}): PublishInput => ({
  caption: "Latte art en 30 secondes #cafe",
  mediaUrls: ["https://store.public.blob.vercel-storage.com/latte.mp4"],
  mediaType: "VIDEO",
  waitUntil: Date.now() + 5_000,
  ...over
});
const image = (over: Partial<PublishInput> = {}): PublishInput => ({
  caption: "Nouveau menu d'automne ☕",
  mediaUrls: ["https://cdn.nebula.test/menu.jpg"],
  mediaType: "IMAGE",
  waitUntil: Date.now() + 5_000,
  ...over
});
const igPublishRoutes = () => [
  { method: "POST", url: `${G}/${IG}/media`, body: { id: "CONTAINER1" } },
  { url: `${G}/CONTAINER1`, body: { id: "CONTAINER1", status_code: "FINISHED" } },
  { method: "POST", url: `${G}/${IG}/media_publish`, body: { id: "MEDIA1" } },
  { url: `${G}/MEDIA1`, body: { id: "MEDIA1", permalink: "https://www.instagram.com/reel/abc/" } }
];

beforeEach(() => {
  process.env.META_APP_ID = "app-id";
  process.env.META_APP_SECRET = "app-secret";
  delete process.env.META_GRAPH_VERSION;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Instagram : Publication, Reel ou Story", () => {
  it("Reel : REELS, aussi dans le fil (share_to_feed), couverture = miniature JPEG choisie", async () => {
    const net = installNetwork(igPublishRoutes());
    await instagramClient.publishPost(ig(), video({ format: "REEL", thumbnailUrl: "https://store.public.blob.vercel-storage.com/cover.jpg" }));
    const create = net.to(/\/media$/, "POST")[0].form!;
    expect(create.get("media_type")).toBe("REELS");
    expect(create.get("share_to_feed")).toBe("true");
    expect(create.get("cover_url")).toBe("https://store.public.blob.vercel-storage.com/cover.jpg");
    expect(create.get("caption")).toBe("Latte art en 30 secondes #cafe");
  });

  it("Reel seulement dans l'onglet Reels ; miniature PNG non envoyée (Instagram n'accepte que le JPEG)", async () => {
    const net = installNetwork(igPublishRoutes());
    await instagramClient.publishPost(ig(), video({ format: "REEL", instagram: { shareToFeed: false }, thumbnailUrl: "https://x.test/ia.png" }));
    const create = net.to(/\/media$/, "POST")[0].form!;
    expect(create.get("share_to_feed")).toBe("false");
    expect(create.get("cover_url")).toBeNull();
  });

  it("couverture refusée par Instagram : nouvel essai sans elle (la publication part)", async () => {
    const net = installNetwork([
      { method: "POST", url: `${G}/${IG}/media`, times: 1, status: 400, body: { error: { code: 100, message: "Invalid parameter cover_url" } } },
      ...igPublishRoutes()
    ]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await instagramClient.publishPost(ig(), video({ format: "REEL", thumbnailUrl: "https://x.test/c.jpg" }));
    const creates = net.to(/\/media$/, "POST");
    expect(creates).toHaveLength(2);
    expect(creates[1].form!.get("cover_url")).toBeNull();
  });

  it("Story vidéo : STORIES, ni légende, ni lieu, ni collaborateurs", async () => {
    const net = installNetwork(igPublishRoutes());
    await instagramClient.publishPost(ig(), video({ format: "STORY", location: { id: "PLACE1", name: "Café" }, instagram: { collaborators: ["cafe.nova"] } }));
    const create = net.to(/\/media$/, "POST")[0].form!;
    expect(create.get("media_type")).toBe("STORIES");
    expect(create.get("video_url")).toBe("https://store.public.blob.vercel-storage.com/latte.mp4");
    expect(create.get("caption")).toBeNull();
    expect(create.get("location_id")).toBeNull();
    expect(create.get("collaborators")).toBeNull();
  });

  it("Story image : STORIES avec image_url", async () => {
    const net = installNetwork(igPublishRoutes());
    await instagramClient.publishPost(ig(), image({ format: "STORY" }));
    const create = net.to(/\/media$/, "POST")[0].form!;
    expect(create.get("media_type")).toBe("STORIES");
    expect(create.get("image_url")).toBe("https://cdn.nebula.test/menu.jpg");
  });

  it("sans format (ancienne publication, API) : vidéo → Reel, comme avant", async () => {
    const net = installNetwork(igPublishRoutes());
    await instagramClient.publishPost(ig(), video());
    expect(net.to(/\/media$/, "POST")[0].form!.get("media_type")).toBe("REELS");
  });

  it("format impossible : refus clair avant tout appel", async () => {
    const net = installNetwork([]);
    await expect(instagramClient.publishPost(ig(), video({ format: "POST" }))).rejects.toThrow(/toute vidéo en Reel/);
    await expect(instagramClient.publishPost(ig(), image({ format: "REEL" }))).rejects.toThrow(/Un Reel est une vidéo/);
    await expect(instagramClient.publishPost(ig(), image({ format: "STORY", mediaUrls: ["https://a.test/1.jpg", "https://a.test/2.jpg"] }))).rejects.toThrow(/qu'une image ou une vidéo/);
    expect(net.sent).toHaveLength(0);
  });
});

describe("Facebook : Publication, Reel ou Story", () => {
  it("Reel : session video_reels (start), vidéo envoyée par son adresse à rupload, publication (finish)", async () => {
    const net = installNetwork([
      { method: "POST", url: `${G}/${PAGE}/video_reels`, times: 1, body: { video_id: "VID9", upload_url: `https://rupload.facebook.com/video-upload/${V}/VID9` } },
      { method: "POST", url: `rupload.facebook.com/video-upload/${V}/VID9`, body: { success: true } },
      { method: "POST", url: `${G}/${PAGE}/video_reels`, body: { success: true } }
    ]);
    const out = await facebookClient.publishPost(fb(), video({ format: "REEL", location: { id: "PLACE1", name: "Café" } }));
    expect(out).toEqual({ externalPostId: "VID9", externalUrl: "https://www.facebook.com/reel/VID9" });
    const [start, finish] = net.to(/video_reels$/, "POST");
    expect(start.form!.get("upload_phase")).toBe("start");
    expect(finish.form!.get("upload_phase")).toBe("finish");
    expect(finish.form!.get("video_id")).toBe("VID9");
    expect(finish.form!.get("video_state")).toBe("PUBLISHED");
    expect(finish.form!.get("description")).toBe("Latte art en 30 secondes #cafe");
    expect(finish.form!.get("place")).toBe("PLACE1");
    const upload = net.to(/rupload\.facebook\.com/)[0];
    expect(upload.headers.authorization).toBe("OAuth TOKEN-PAGE");
    expect(upload.headers.file_url).toBe("https://store.public.blob.vercel-storage.com/latte.mp4");
  });

  it("Reel : envoi de la vidéo refusé → erreur, pas de publication", async () => {
    const net = installNetwork([
      { method: "POST", url: `${G}/${PAGE}/video_reels`, times: 1, body: { video_id: "VID9", upload_url: `https://rupload.facebook.com/video-upload/${V}/VID9` } },
      { method: "POST", url: `rupload.facebook.com/video-upload/${V}/VID9`, status: 400, body: { debug_info: { type: "ProcessingFailedError", message: "Request processing failed" } } }
    ]);
    await expect(facebookClient.publishPost(fb(), video({ format: "REEL" }))).rejects.toBeInstanceOf(SocialApiError);
    expect(net.to(/video_reels$/, "POST")).toHaveLength(1);
  });

  it("Story photo : photo non publiée, puis photo_stories", async () => {
    const net = installNetwork([
      { method: "POST", url: `${G}/${PAGE}/photos`, body: { id: "PHOTO1" } },
      { method: "POST", url: `${G}/${PAGE}/photo_stories`, body: { success: true, post_id: "STORY1" } }
    ]);
    const out = await facebookClient.publishPost(fb(), image({ format: "STORY" }));
    expect(out).toMatchObject({ externalPostId: "STORY1" });
    expect(net.to(/\/photos$/)[0].form!.get("published")).toBe("false");
    expect(net.to(/photo_stories$/)[0].form!.get("photo_id")).toBe("PHOTO1");
  });

  it("Story vidéo : video_stories (start), rupload, video_stories (finish)", async () => {
    const net = installNetwork([
      { method: "POST", url: `${G}/${PAGE}/video_stories`, times: 1, body: { video_id: "VS1", upload_url: `https://rupload.facebook.com/video-upload/${V}/VS1` } },
      { method: "POST", url: `rupload.facebook.com/video-upload/${V}/VS1`, body: { success: true } },
      { method: "POST", url: `${G}/${PAGE}/video_stories`, body: { success: true, post_id: "STORY2" } }
    ]);
    const out = await facebookClient.publishPost(fb(), video({ format: "STORY" }));
    expect(out).toMatchObject({ externalPostId: "STORY2" });
    const [, finish] = net.to(/video_stories$/, "POST");
    expect(finish.form!.get("upload_phase")).toBe("finish");
    expect(finish.form!.get("video_id")).toBe("VS1");
  });

  it("Publication avec plusieurs photos : toutes les photos (avant : seulement la première)", async () => {
    let n = 0;
    const net = installNetwork([
      { method: "POST", url: `${G}/${PAGE}/photos`, reply: () => ({ body: { id: `P${++n}` } }) },
      { method: "POST", url: `${G}/${PAGE}/feed`, body: { id: `${PAGE}_555` } }
    ]);
    const out = await facebookClient.publishPost(fb(), image({ format: "POST", mediaUrls: ["https://a.test/1.jpg", "https://a.test/2.jpg", "https://a.test/3.jpg"] }));
    expect(out).toEqual({ externalPostId: `${PAGE}_555`, externalUrl: `https://www.facebook.com/${PAGE}_555` });
    const photos = net.to(/\/photos$/);
    expect(photos.map((p) => [p.form!.get("url"), p.form!.get("published")])).toEqual([
      ["https://a.test/1.jpg", "false"],
      ["https://a.test/2.jpg", "false"],
      ["https://a.test/3.jpg", "false"]
    ]);
    const feed = net.to(/\/feed$/)[0].form!;
    expect(feed.get("message")).toBe("Nouveau menu d'automne ☕");
    expect([0, 1, 2].map((k) => JSON.parse(feed.get(`attached_media[${k}]`) ?? "{}"))).toEqual([{ media_fbid: "P1" }, { media_fbid: "P2" }, { media_fbid: "P3" }]);
  });

  it("vidéo sans format : vidéo classique (/videos), comme avant", async () => {
    const net = installNetwork([{ method: "POST", url: `${G}/${PAGE}/videos`, body: { id: "V1" } }]);
    await facebookClient.publishPost(fb(), video());
    expect(net.to(/\/videos$/)).toHaveLength(1);
  });
});

describe("règles de format (Publier et vérification à la création)", () => {
  const vertical = (d: number): MediaFacts => ({ type: "VIDEO", count: 1, width: 1080, height: 1920, durationSeconds: d });
  const horizontal = (d: number): MediaFacts => ({ type: "VIDEO", count: 1, width: 1920, height: 1080, durationSeconds: d });
  const photo1: MediaFacts = { type: "IMAGE", count: 1, width: 1080, height: 1350 };
  const photos3: MediaFacts = { type: "IMAGE", count: 3, width: 1080, height: 1080 };

  it("format proposé : Instagram vidéo → Reel, image → Publication ; Facebook vidéo verticale courte → Reel, sinon Publication", () => {
    expect(defaultFormat("INSTAGRAM", vertical(30))).toBe("REEL");
    expect(defaultFormat("INSTAGRAM", photo1)).toBe("POST");
    expect(defaultFormat("FACEBOOK", vertical(30))).toBe("REEL");
    expect(defaultFormat("FACEBOOK", vertical(120))).toBe("POST");
    expect(defaultFormat("FACEBOOK", horizontal(30))).toBe("POST");
    expect(defaultFormat("YOUTUBE", vertical(30))).toBeNull();
  });

  it("formats impossibles, avec la raison", () => {
    const ig = (m: MediaFacts) => Object.fromEntries(formatOptions("INSTAGRAM", m).map((o) => [o.format, o.unavailable ?? null]));
    expect(ig(vertical(30))).toMatchObject({ POST: expect.stringMatching(/toute vidéo .* en Reel/), REEL: null, STORY: null });
    expect(ig(vertical(75)).STORY).toMatch(/trop longue \(1 min 15 s, 60 s au plus\)/);
    expect(ig(photos3)).toMatchObject({ POST: null, REEL: "Un Reel est une vidéo.", STORY: expect.stringMatching(/qu'une image ou une vidéo/) });
    const f = (m: MediaFacts) => Object.fromEntries(formatOptions("FACEBOOK", m).map((o) => [o.format, o.unavailable ?? null]));
    expect(f(horizontal(30)).REEL).toMatch(/verticale/);
    expect(f(vertical(2)).REEL).toMatch(/trop courte/);
    expect(f(vertical(95)).REEL).toMatch(/1 min 30 s au plus/);
    expect(formatProblem("FACEBOOK", "REEL", horizontal(30))).toBe("Facebook (Reel) : Facebook n'accepte en Reel qu'une vidéo verticale (9:16).");
    expect(formatProblem("FACEBOOK", "POST", horizontal(30))).toBeNull();
  });

  it("taille ou durée inconnues : rien n'est refusé à tort", () => {
    expect(formatProblem("FACEBOOK", "REEL", { type: "VIDEO", count: 1 })).toBeNull();
    expect(formatProblem("INSTAGRAM", "STORY", { type: "VIDEO", count: 1 })).toBeNull();
  });

  it("sans choix : comportement d'avant (Instagram vidéo → Reel, Facebook → Publication)", () => {
    expect(effectiveFormat("INSTAGRAM", undefined, vertical(30))).toBe("REEL");
    expect(effectiveFormat("FACEBOOK", undefined, vertical(30))).toBe("POST");
    expect(effectiveFormat("FACEBOOK", "STORY", vertical(30))).toBe("STORY");
  });

  it("YouTube : Short si verticale ou carrée et 3 min au plus, sinon vidéo ; dit que YouTube décide", () => {
    expect(youtubeKind(vertical(45))).toBe("SHORT");
    expect(youtubeKind({ type: "VIDEO", count: 1, width: 1080, height: 1080, durationSeconds: 170 })).toBe("SHORT");
    expect(youtubeKind(vertical(200))).toBe("VIDEO");
    expect(youtubeKind(horizontal(30))).toBe("VIDEO");
    expect(youtubeKind({ type: "VIDEO", count: 1 })).toBeNull();
    expect(youtubeKindText(horizontal(30))).toMatch(/vidéo classique \(elle est horizontale\)/);
    expect(youtubeKindText(vertical(45))).toMatch(/aucune application ne peut le forcer/);
  });

  it("Story : pas de premier commentaire", () => {
    expect(firstCommentSupport("INSTAGRAM", null, { format: "STORY" })).toMatchObject({ mode: "unsupported", reason: expect.stringMatching(/story n'a pas de commentaires/) });
    expect(firstCommentSupport("FACEBOOK", null, { format: "REEL" })).toMatchObject({ mode: "api" });
  });
});
