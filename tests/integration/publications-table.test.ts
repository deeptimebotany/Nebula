import { describe, expect, it } from "vitest";

// Page Publications façon YouTube Studio (09/10/2026), sur une vraie base :
// filtre de format (Shorts et Reels, vidéos, posts, stories), tri par date
// dans les deux sens, visibilité YouTube, et vues / j'aime / commentaires
// additionnés sur les réseaux affichés.
import { prisma } from "@/lib/prisma";
import { pageBrandPosts, parsePostPageQuery, postPageSummary } from "@/lib/posts/list-posts";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const q = (s: string) => parsePostPageQuery(new URLSearchParams(s));

async function scene() {
  await resetDatabase();
  const { user, brand } = await makeBrand();
  const conn = async (network: string) =>
    prisma.socialConnection.create({ data: { brandId: brand.id, network, externalAccountId: `${network}-1`, displayName: network, accessToken: "tok" } });
  const yt = await conn("YOUTUBE");
  const ig = await conn("INSTAGRAM");
  const fb = await conn("FACEBOOK");
  const media = async (type: string, width: number, height: number, durationSeconds: number | null) =>
    prisma.mediaAsset.create({ data: { brandId: brand.id, type, url: `https://cdn.test/${Math.random()}`, filename: "f", mimeType: type === "VIDEO" ? "video/mp4" : "image/jpeg", sizeBytes: 10, width, height, durationSeconds } });
  const vertical = await media("VIDEO", 1080, 1920, 40);
  const horizontal = await media("VIDEO", 1920, 1080, 400);
  const image = await media("IMAGE", 1080, 1080, null);

  const post = async (title: string, createdAt: string, assetId: string, targets: { connectionId: string; network: string; externalPostId?: string; metadata?: object }[]) =>
    prisma.post.create({
      data: {
        brandId: brand.id,
        createdById: user.id,
        title,
        caption: `Légende ${title}`,
        status: "PUBLISHED",
        createdAt: new Date(createdAt),
        media: { create: { mediaAssetId: assetId, order: 0 } },
        targets: {
          create: targets.map((t) => ({ connectionId: t.connectionId, network: t.network, status: "PUBLISHED", externalPostId: t.externalPostId ?? null, publishedAt: new Date(createdAt), metadata: t.metadata ?? undefined }))
        }
      }
    });
  await post("Court", "2026-10-04T10:00:00Z", vertical.id, [
    { connectionId: yt.id, network: "YOUTUBE", externalPostId: "yt1", metadata: { privacyStatus: "unlisted" } },
    { connectionId: ig.id, network: "INSTAGRAM", externalPostId: "ig1", metadata: { format: "REEL" } }
  ]);
  await post("Long", "2026-10-03T10:00:00Z", horizontal.id, [{ connectionId: yt.id, network: "YOUTUBE", externalPostId: "yt2" }]);
  await post("Photo", "2026-10-02T10:00:00Z", image.id, [
    { connectionId: ig.id, network: "INSTAGRAM", externalPostId: "ig2" },
    { connectionId: fb.id, network: "FACEBOOK", externalPostId: "fb2" }
  ]);
  await post("Story", "2026-10-01T10:00:00Z", image.id, [{ connectionId: ig.id, network: "INSTAGRAM", externalPostId: "ig3", metadata: { format: "STORY" } }]);

  const metric = (connectionId: string, network: string, postExternalId: string, views: number, likes: number, comments: number) =>
    prisma.postMetric.create({ data: { connectionId, network, postExternalId, views, likes, comments } });
  await metric(yt.id, "YOUTUBE", "yt1", 100, 10, 2);
  await metric(ig.id, "INSTAGRAM", "ig1", 50, 5, 1);
  await metric(yt.id, "YOUTUBE", "yt2", 7, 0, 0);
  return { brand };
}

describe.skipIf(!hasDatabase)("page Publications : tableau façon YouTube Studio", () => {
  it("filtre de format, réseau par réseau", async () => {
    const { brand } = await scene();
    const titles = async (s: string) => (await pageBrandPosts(brand.id, q(s))).posts.map((p) => p.title);
    expect(await titles("kind=SHORT")).toEqual(["Court"]);
    expect(await titles("kind=VIDEO")).toEqual(["Long"]);
    expect(await titles("kind=POST")).toEqual(["Photo"]);
    expect(await titles("kind=STORY")).toEqual(["Story"]);
    expect(await titles("kind=SHORT&network=YOUTUBE")).toEqual(["Court"]);
    expect(await titles("kind=POST&network=YOUTUBE")).toEqual([]);
    // Pagination avec un filtre de format : rien n'est perdu entre deux pages.
    const first = await pageBrandPosts(brand.id, q("kind=POST&limit=1"));
    expect(first.posts.map((p) => p.title)).toEqual(["Photo"]);
    expect(first.nextCursor).toBeNull();
    expect((await postPageSummary(brand.id, q("kind=SHORT"))).counts).toEqual({ ALL: 1, SCHEDULED: 0, PUBLISHED: 1, FAILED: 0, DRAFT: 0 });
  });

  it("tri par date dans les deux sens", async () => {
    const { brand } = await scene();
    expect((await pageBrandPosts(brand.id, q(""))).posts.map((p) => p.title)).toEqual(["Court", "Long", "Photo", "Story"]);
    const asc = await pageBrandPosts(brand.id, q("order=asc&limit=2"));
    expect(asc.posts.map((p) => p.title)).toEqual(["Story", "Photo"]);
    expect((await pageBrandPosts(brand.id, q(`order=asc&limit=2&cursor=${asc.nextCursor}`))).posts.map((p) => p.title)).toEqual(["Long", "Court"]);
  });

  it("vues, j'aime et commentaires additionnés sur les réseaux affichés ; formats et visibilité YouTube", async () => {
    const { brand } = await scene();
    const all = (await pageBrandPosts(brand.id, q(""))).posts;
    const court = all.find((p) => p.title === "Court")!;
    expect(court.metrics).toEqual({ views: 150, likes: 15, comments: 3 });
    expect(court.kinds).toEqual(["SHORT"]);
    expect(court.targets.find((t) => t.network === "YOUTUBE")).toMatchObject({ kind: "SHORT", privacy: "unlisted" });
    expect(all.find((p) => p.title === "Photo")!.metrics).toBeNull();
    const ytOnly = (await pageBrandPosts(brand.id, q("network=YOUTUBE"))).posts.find((p) => p.title === "Court")!;
    expect(ytOnly.metrics).toEqual({ views: 100, likes: 10, comments: 2 });
    // Les réglages bruts de chaque réseau ne partent pas au navigateur.
    expect(JSON.stringify(all)).not.toContain("metadata");
  });
});
