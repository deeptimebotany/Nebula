import { beforeEach, describe, expect, it, vi } from "vitest";

// Format de la publication (07/10/2026), sur une vraie base : le format
// choisi dans Publier est vérifié à la création (vidéo horizontale en Reel
// Facebook, vidéo trop longue en story…), transmis au réseau à l'envoi, et
// une story n'a pas de premier commentaire. Faux réseaux (aucun appel).
const fake = vi.hoisted(() => ({ inputs: [] as { network: string; format?: string; shareToFeed?: boolean; caption: string }[], comments: 0 }));
vi.mock("@/lib/social", async () => {
  const client = (network: string) => ({
    network,
    getAuthUrl: () => "",
    exchangeCodeForToken: async () => {
      throw new Error("non utilisé");
    },
    async publishPost(_c: unknown, input: { format?: string; instagram?: { shareToFeed?: boolean }; caption: string }) {
      fake.inputs.push({ network, format: input.format, shareToFeed: input.instagram?.shareToFeed, caption: input.caption });
      return { externalPostId: `${network}-1` };
    },
    async postComment() {
      fake.comments++;
    },
    fetchAnalytics: async () => ({ followers: 0, followersDelta: 0, engagementRate: 0, impressions: 0, reach: 0, postsCount: 0 })
  });
  return { getSocialClient: client, SOCIAL_CLIENTS: {} };
});

import { prisma } from "@/lib/prisma";
import { createPost } from "@/lib/posts/create-post";
import { forgetNetworkControlCache } from "@/lib/social/network-control";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

async function setup(media: { width: number; height: number; durationSeconds: number }) {
  const { user, brand } = await makeBrand();
  await prisma.user.update({ where: { id: user.id }, data: { compPlan: "PRO" } });
  const [ig, fb] = await Promise.all(
    (["INSTAGRAM", "FACEBOOK"] as const).map((network) =>
      prisma.socialConnection.create({ data: { brandId: brand.id, network, externalAccountId: `${network}-${Date.now()}-${Math.random()}`, displayName: "Café", accessToken: "tok", scopes: network === "FACEBOOK" ? "page_token" : "" } })
    )
  );
  const video = await prisma.mediaAsset.create({
    data: { brandId: brand.id, url: "https://x.test/v.mp4", filename: "v.mp4", mimeType: "video/mp4", type: "VIDEO", sizeBytes: 1000, ...media }
  });
  return { user, brand, ig, fb, video };
}
const base = (brandId: string, mediaId: string) => ({ brandId, title: "", caption: "Latte art en 30 secondes", firstComment: "Lien en bio 👇", mediaAssetIds: [mediaId], publishNow: false });

describe.skipIf(!hasDatabase)("format de la publication : vérifié, enregistré, transmis", () => {
  beforeEach(async () => {
    await resetDatabase();
    forgetNetworkControlCache();
    fake.inputs = [];
    fake.comments = 0;
  });

  it("vidéo horizontale en Reel Facebook : refusée à la création, avec la raison", async () => {
    const { user, brand, fb, video } = await setup({ width: 1920, height: 1080, durationSeconds: 30 });
    const res = await createPost(user.id, { ...base(brand.id, video.id), targets: [{ connectionId: fb.id, network: "FACEBOOK", metadata: { format: "REEL" } }] });
    expect(res).toMatchObject({ ok: false, status: 400, reason: "post_format", error: "Facebook (Reel) : Facebook n'accepte en Reel qu'une vidéo verticale (9:16)." });
    expect(await prisma.post.count()).toBe(0);
  });

  it("vidéo de 75 s en story Instagram : refusée (60 s au plus)", async () => {
    const { user, brand, ig, video } = await setup({ width: 1080, height: 1920, durationSeconds: 75 });
    const res = await createPost(user.id, { ...base(brand.id, video.id), targets: [{ connectionId: ig.id, network: "INSTAGRAM", metadata: { format: "STORY" } }] });
    expect(res).toMatchObject({ ok: false, reason: "post_format", error: expect.stringMatching(/Instagram \(Story\) : Vidéo trop longue \(1 min 15 s, 60 s au plus\)/) });
  });

  it("Reel Instagram (seulement dans l'onglet Reels) et Story Facebook : envoyés tels quels ; la story n'a pas de premier commentaire", async () => {
    const { user, brand, ig, fb, video } = await setup({ width: 1080, height: 1920, durationSeconds: 30 });
    const res = await createPost(user.id, {
      ...base(brand.id, video.id),
      publishNow: true,
      targets: [
        { connectionId: ig.id, network: "INSTAGRAM", metadata: { format: "REEL", instagram: { shareToFeed: false } } },
        { connectionId: fb.id, network: "FACEBOOK", metadata: { format: "STORY" } }
      ]
    });
    expect(res.ok).toBe(true);
    expect(fake.inputs.sort((a, b) => a.network.localeCompare(b.network))).toEqual([
      { network: "FACEBOOK", format: "STORY", shareToFeed: undefined, caption: "Latte art en 30 secondes" },
      { network: "INSTAGRAM", format: "REEL", shareToFeed: false, caption: "Latte art en 30 secondes" }
    ]);
    const targets = await prisma.postTarget.findMany({ where: { postId: (res as { postId: string }).postId } });
    const byNetwork = Object.fromEntries(targets.map((t) => [t.network, t]));
    expect(byNetwork.INSTAGRAM.firstCommentStatus).toBe("POSTED");
    expect(byNetwork.FACEBOOK).toMatchObject({ firstCommentStatus: "UNSUPPORTED", firstCommentError: expect.stringMatching(/story n'a pas de commentaires/) });
    expect(fake.comments).toBe(1);
  });

  it("sans format (API, import CSV) : pas de contrôle, le réseau garde son comportement d'avant", async () => {
    const { user, brand, fb, video } = await setup({ width: 1920, height: 1080, durationSeconds: 30 });
    const res = await createPost(user.id, { ...base(brand.id, video.id), publishNow: true, targets: [{ connectionId: fb.id, network: "FACEBOOK" }] });
    expect(res.ok).toBe(true);
    expect(fake.inputs[0]).toMatchObject({ network: "FACEBOOK", format: undefined });
  });
});
