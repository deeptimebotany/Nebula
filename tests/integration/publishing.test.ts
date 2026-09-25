import { beforeEach, describe, expect, it, vi } from "vitest";

// Faux réseaux : l'identifiant du compte décide du comportement.
const fake = vi.hoisted(() => ({ publish: 0, resume: 0, byAccount: {} as Record<string, number> }));
vi.mock("@/lib/social", async () => {
  const base = await import("@/lib/social/base");
  const client = (network: string) => ({
    network,
    getAuthUrl: () => "",
    exchangeCodeForToken: async () => {
      throw new Error("non utilisé");
    },
    async publishPost(connection: { externalAccountId: string }) {
      fake.publish++;
      fake.byAccount[connection.externalAccountId] = (fake.byAccount[connection.externalAccountId] ?? 0) + 1;
      const kind = connection.externalAccountId.split(":")[0];
      if (kind === "slow") await new Promise((r) => setTimeout(r, 300));
      if (kind === "pending") return { pending: true, checkpoint: { step: "fake", container: "K1" }, retryInMs: 1 };
      if (kind === "fail") throw new base.SocialApiError(network as "INSTAGRAM", "Refusé", 400);
      return { externalPostId: `ext-${fake.publish}` };
    },
    async resumePublish(_c: unknown, _i: unknown, checkpoint: { container?: string }) {
      fake.resume++;
      await new Promise((r) => setTimeout(r, 200));
      return { externalPostId: `resumed-${checkpoint.container}` };
    },
    fetchAnalytics: async () => ({ followers: 0, followersDelta: 0, engagementRate: 0, impressions: 0, reach: 0, postsCount: 0 })
  });
  return { getSocialClient: client, SOCIAL_CLIENTS: {} };
});

import { prisma } from "@/lib/prisma";
import { advanceProcessingTargets, publishPost, PublishInProgressError, recoverInterruptedPublications, runDuePosts } from "@/lib/publish";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

async function setup(kinds: string[], opts: { status?: string; connStatus?: string } = {}) {
  const { user, brand } = await makeBrand();
  const post = await prisma.post.create({
    data: { brandId: brand.id, createdById: user.id, caption: "Test", status: opts.status ?? "SCHEDULED", scheduledAt: new Date(Date.now() - 1000) }
  });
  const targets = [];
  for (const [i, kind] of kinds.entries()) {
    const c = await prisma.socialConnection.create({
      data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: `${kind}:${post.id}:${i}`, displayName: "C", accessToken: "tok", status: opts.connStatus ?? "CONNECTED" }
    });
    targets.push(await prisma.postTarget.create({ data: { postId: post.id, connectionId: c.id, network: "INSTAGRAM", status: "SCHEDULED" } }));
  }
  return { user, post, targets };
}
const statusOf = async (id: string) => (await prisma.post.findUnique({ where: { id } }))?.status;

describe.skipIf(!hasDatabase)("publication fiable (lot 2)", () => {
  beforeEach(async () => {
    await resetDatabase();
    fake.publish = 0;
    fake.resume = 0;
    fake.byAccount = {};
  });

  it("trois passages du cron en même temps : une seule publication", async () => {
    const { user, post } = await setup(["slow"]);
    await Promise.all([runDuePosts(), runDuePosts(), runDuePosts()]);
    expect(fake.publish).toBe(1);
    expect(await statusOf(post.id)).toBe("PUBLISHED");
    expect(await prisma.notification.count({ where: { userId: user.id, kind: "publish_ok" } })).toBe(1);
  });

  it("« Publier maintenant » pendant un envoi : refusé", async () => {
    const { post } = await setup(["ok"], { status: "PUBLISHING" });
    await expect(publishPost(post.id)).rejects.toBeInstanceOf(PublishInProgressError);
  });

  it("vidéo en traitement : terminée par le cron, reprise une seule fois", async () => {
    const { post, targets } = await setup(["pending"], { status: "DRAFT" });
    expect((await publishPost(post.id)).status).toBe("PROCESSING");
    expect((await prisma.postTarget.findUnique({ where: { id: targets[0].id } }))?.status).toBe("PROCESSING");
    await new Promise((r) => setTimeout(r, 20));
    await Promise.all([advanceProcessingTargets(), advanceProcessingTargets()]);
    expect(fake.resume).toBe(1);
    expect((await prisma.postTarget.findUnique({ where: { id: targets[0].id } }))?.externalPostId).toBe("resumed-K1");
    expect(await statusOf(post.id)).toBe("PUBLISHED");
  });

  it("publication interrompue : échec explicite, rien de renvoyé", async () => {
    const { post, targets } = await setup(["ok", "ok"], { status: "PUBLISHING" });
    await prisma.post.update({ where: { id: post.id }, data: { publishingStartedAt: new Date(Date.now() - 20 * 60_000) } });
    await prisma.postTarget.update({ where: { id: targets[0].id }, data: { status: "PUBLISHING", startedAt: new Date(Date.now() - 20 * 60_000) } });
    await prisma.postTarget.update({ where: { id: targets[1].id }, data: { status: "PENDING" } });
    await recoverInterruptedPublications();
    const [t1, t2] = await Promise.all(targets.map((t) => prisma.postTarget.findUnique({ where: { id: t.id } })));
    expect(t1?.errorMessage).toMatch(/Vérifiez/);
    expect(t2?.errorMessage).toMatch(/relancez/);
    expect(fake.publish).toBe(0);
    expect(await statusOf(post.id)).toBe("FAILED");
  });

  it("compte déconnecté : pas d'envoi", async () => {
    const { post, targets } = await setup(["ok"], { status: "DRAFT", connStatus: "DISCONNECTED" });
    await publishPost(post.id);
    expect((await prisma.postTarget.findUnique({ where: { id: targets[0].id } }))?.errorMessage).toMatch(/déconnecté/);
    expect(fake.publish).toBe(0);
  });

  it("échec partiel puis relance : seul le réseau en échec est renvoyé", async () => {
    const { post, targets } = await setup(["ok", "fail"], { status: "DRAFT" });
    expect((await publishPost(post.id)).status).toBe("PARTIAL");
    await publishPost(post.id);
    const conns = await prisma.socialConnection.findMany({ where: { id: { in: targets.map((t) => t.connectionId) } } });
    const ok = conns.find((c) => c.externalAccountId.startsWith("ok"))!;
    const ko = conns.find((c) => c.externalAccountId.startsWith("fail"))!;
    expect(fake.byAccount[ok.externalAccountId]).toBe(1);
    expect(fake.byAccount[ko.externalAccountId]).toBe(2);
  });
});
