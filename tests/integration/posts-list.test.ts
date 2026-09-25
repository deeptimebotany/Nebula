import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listBrandPosts, pageBrandPosts, parsePostListQuery, parsePostPageQuery, postPageSummary } from "@/lib/posts/list-posts";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

// GET /api/posts par période et en version allégée (lot 4, performance).
describe.skipIf(!hasDatabase)("liste des publications par période (lot 4)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function seed() {
    const { user, brand } = await makeBrand();
    const other = await makeBrand();
    const conn = await prisma.socialConnection.create({
      data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: "ig-1", displayName: "Compte", accessToken: "tok", status: "CONNECTED" }
    });
    const mk = (title: string, scheduledAt: Date | null, createdAt?: Date, brandId = brand.id, userId = user.id) =>
      prisma.post.create({ data: { brandId, createdById: userId, title, caption: `Texte ${title}`, status: scheduledAt ? "SCHEDULED" : "PUBLISHED", scheduledAt, ...(createdAt ? { createdAt } : {}) } });
    const inside = await mk("dedans", new Date("2026-10-10T08:00:00Z"));
    await mk("avant", new Date("2026-08-10T08:00:00Z"));
    await mk("après", new Date("2026-12-10T08:00:00Z"));
    // Publiée tout de suite : pas de date de programmation, repère = création.
    await mk("immédiate-dedans", null, new Date("2026-10-02T09:00:00Z"));
    await mk("immédiate-avant", null, new Date("2026-07-02T09:00:00Z"));
    // Même période, autre marque : jamais renvoyée.
    await mk("autre-marque", new Date("2026-10-11T08:00:00Z"), undefined, other.brand.id, other.user.id);

    const m1 = await prisma.mediaAsset.create({ data: { brandId: brand.id, url: "https://x.test/1.jpg", filename: "1.jpg", mimeType: "image/jpeg", type: "IMAGE", sizeBytes: 100 } });
    const m2 = await prisma.mediaAsset.create({ data: { brandId: brand.id, url: "https://x.test/2.jpg", filename: "2.jpg", mimeType: "image/jpeg", type: "IMAGE", sizeBytes: 100 } });
    await prisma.postMedia.createMany({ data: [{ postId: inside.id, mediaAssetId: m2.id, order: 1 }, { postId: inside.id, mediaAssetId: m1.id, order: 0 }] });
    await prisma.postTarget.create({ data: { postId: inside.id, connectionId: conn.id, network: "INSTAGRAM", status: "SCHEDULED", metadata: { secret: "réglage" } } });
    return { brand, inside };
  }

  it("ne renvoie que la période demandée, publications immédiates comprises", async () => {
    const { brand } = await seed();
    const query = parsePostListQuery(new URLSearchParams("from=2026-09-30T00:00:00Z&to=2026-11-02T00:00:00Z&view=light"));
    const { posts, truncated } = await listBrandPosts(brand.id, query);
    expect(posts.map((p) => p.title).sort()).toEqual(["dedans", "immédiate-dedans"]);
    expect(truncated).toBe(false);
  });

  it("version allégée : première image seulement, ni compte ni réglages par réseau", async () => {
    const { brand, inside } = await seed();
    const { posts } = await listBrandPosts(brand.id, parsePostListQuery(new URLSearchParams("view=light")));
    const row = posts.find((p) => p.id === inside.id) as unknown as Record<string, unknown> & {
      media: { mediaAsset: Record<string, unknown> }[];
      targets: Record<string, unknown>[];
    };
    expect(row.media).toHaveLength(1);
    expect(row.media[0].mediaAsset).toEqual({ url: "https://x.test/1.jpg", type: "IMAGE", thumbnailUrl: null });
    expect(Object.keys(row.targets[0]).sort()).toEqual(["connectionId", "errorMessage", "externalUrl", "network", "publishedAt", "status"]);
    expect(JSON.stringify(row)).not.toContain("réglage");
  });

  it("plafond : les plus récentes d'abord, et le dépassement est signalé", async () => {
    const { brand } = await seed();
    const { posts, truncated } = await listBrandPosts(brand.id, parsePostListQuery(new URLSearchParams("view=light&limit=2")));
    expect(posts).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it("sans paramètre : la réponse complète d'avant (compatibilité)", async () => {
    const { brand, inside } = await seed();
    const { posts } = await listBrandPosts(brand.id, parsePostListQuery(new URLSearchParams("")));
    expect(posts).toHaveLength(5);
    const full = posts.find((p) => p.id === inside.id) as unknown as { targets: { connection: { displayName: string } }[]; media: unknown[] };
    expect(full.targets[0].connection.displayName).toBe("Compte");
    expect(full.media).toHaveLength(2);
  });

  it("page Publications : pages de N, ordre par date, filtres et compteurs calculés par la base", async () => {
    const { user, brand } = await makeBrand();
    const conn = await prisma.socialConnection.create({
      data: { brandId: brand.id, network: "TIKTOK", externalAccountId: "tt-1", displayName: "TT", accessToken: "tok", status: "CONNECTED" }
    });
    const specs: [string, string, string | null, string][] = [
      ["A", "PUBLISHED", "2026-09-01T10:00:00Z", "2026-08-30T10:00:00Z"],
      ["B", "FAILED", "2026-09-05T10:00:00Z", "2026-08-30T10:00:00Z"],
      ["C", "PARTIAL", "2026-09-07T10:00:00Z", "2026-08-30T10:00:00Z"],
      ["D", "DRAFT", null, "2026-09-06T10:00:00Z"],
      ["E 100% promo", "SCHEDULED", "2026-10-01T10:00:00Z", "2026-09-01T10:00:00Z"],
      ["F", "PUBLISHING", "2026-09-20T10:00:00Z", "2026-09-01T10:00:00Z"],
      ["G", "PUBLISHED", null, "2026-09-10T10:00:00Z"]
    ];
    for (const [title, status, scheduledAt, createdAt] of specs) {
      const post = await prisma.post.create({
        data: { brandId: brand.id, createdById: user.id, title, caption: `Légende ${title}`, status, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, createdAt: new Date(createdAt) }
      });
      if (["B", "E 100% promo"].includes(title)) {
        await prisma.postTarget.create({ data: { postId: post.id, connectionId: conn.id, network: "TIKTOK", status: "SCHEDULED" } });
      }
    }
    const q = (s: string) => parsePostPageQuery(new URLSearchParams(s));
    const first = await pageBrandPosts(brand.id, q("limit=3"));
    // Date de programmation, sinon de création, de la plus récente à la plus ancienne.
    expect(first.posts.map((p) => p.title)).toEqual(["E 100% promo", "F", "G"]);
    expect(first.nextCursor).toBeTruthy();
    const second = await pageBrandPosts(brand.id, q(`limit=3&cursor=${first.nextCursor}`));
    expect(second.posts.map((p) => p.title)).toEqual(["C", "D", "B"]);
    const third = await pageBrandPosts(brand.id, q(`limit=3&cursor=${second.nextCursor}`));
    expect(third.posts.map((p) => p.title)).toEqual(["A"]);
    expect(third.nextCursor).toBeNull();

    expect((await pageBrandPosts(brand.id, q("status=FAILED"))).posts.map((p) => p.title)).toEqual(["C", "B"]);
    expect((await pageBrandPosts(brand.id, q("status=SCHEDULED"))).posts.map((p) => p.title)).toEqual(["E 100% promo", "F"]);
    expect((await pageBrandPosts(brand.id, q("network=TIKTOK"))).posts.map((p) => p.title)).toEqual(["E 100% promo", "B"]);
    // Recherche insensible à la casse ; « % » cherché tel quel.
    expect((await pageBrandPosts(brand.id, q("q=légende%20g"))).posts.map((p) => p.title)).toEqual(["G"]);
    expect((await pageBrandPosts(brand.id, q("q=100%25"))).posts.map((p) => p.title)).toEqual(["E 100% promo"]);

    const summary = await postPageSummary(brand.id, q(""));
    expect(summary.counts).toEqual({ ALL: 7, SCHEDULED: 2, PUBLISHED: 2, FAILED: 2, DRAFT: 1 });
    expect(summary.networks).toEqual(["TIKTOK"]);
    expect((await postPageSummary(brand.id, q("network=TIKTOK"))).counts).toEqual({ ALL: 2, SCHEDULED: 1, PUBLISHED: 0, FAILED: 1, DRAFT: 0 });
  });
});
