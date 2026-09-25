import { beforeEach, describe, expect, it, vi } from "vitest";

// Faux réseau avec liste des dernières publications (lot 6).
type Step = "ok" | { status?: number; code?: string };
const fake = vi.hoisted(() => ({ publishes: 0, lists: 0, script: [] as unknown[], recent: [] as { externalPostId: string; text?: string; permalink?: string; publishedAt?: Date }[] }));
vi.mock("@/lib/social", async () => {
  const base = await import("@/lib/social/base");
  const client = (network: string) => ({
    network,
    getAuthUrl: () => "",
    exchangeCodeForToken: async () => {
      throw new Error("non utilisé");
    },
    async publishPost() {
      fake.publishes++;
      const step = (fake.script.shift() ?? "ok") as Step;
      if (step === "ok") return { externalPostId: `ext-${fake.publishes}` };
      throw new base.SocialApiError(network as "INSTAGRAM", "Délai dépassé", step.status, {}, step.code);
    },
    async listRecentPosts() {
      fake.lists++;
      return fake.recent;
    },
    fetchAnalytics: async () => ({ followers: 0, followersDelta: 0, engagementRate: 0, impressions: 0, reach: 0, postsCount: 0 })
  });
  return { getSocialClient: client, SOCIAL_CLIENTS: {} };
});

import { prisma } from "@/lib/prisma";
import { advanceProcessingTargets, publishPost, recoverInterruptedPublications } from "@/lib/publish";
import { forgetNetworkControlCache } from "@/lib/social/network-control";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const CAPTION = "Les coulisses du tournage, épisode 3 #nebula";

async function setup() {
  const { user, brand } = await makeBrand();
  const post = await prisma.post.create({
    data: { brandId: brand.id, createdById: user.id, caption: CAPTION, status: "SCHEDULED", scheduledAt: new Date(Date.now() - 1000) }
  });
  const connection = await prisma.socialConnection.create({
    data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: `ig-${post.id}`, displayName: "Compte", accessToken: "tok", status: "CONNECTED" }
  });
  const target = await prisma.postTarget.create({ data: { postId: post.id, connectionId: connection.id, network: "INSTAGRAM", status: "SCHEDULED" } });
  return { post, connection, target };
}
const targetOf = (id: string) => prisma.postTarget.findUniqueOrThrow({ where: { id } });
const postStatus = async (id: string) => (await prisma.post.findUniqueOrThrow({ where: { id } })).status;
const makeDue = (id: string) => prisma.postTarget.update({ where: { id }, data: { nextCheckAt: new Date(Date.now() - 1000) } });
const online = (id: string, text = CAPTION) => ({ externalPostId: id, text, permalink: `https://instagram.test/p/${id}`, publishedAt: new Date() });

describe.skipIf(!hasDatabase)("« déjà en ligne ? » (lot 6)", () => {
  beforeEach(async () => {
    await resetDatabase();
    forgetNetworkControlCache();
    fake.publishes = 0;
    fake.lists = 0;
    fake.script = [];
    fake.recent = [];
  });

  it("délai dépassé puis publication trouvée : marquée publiée, sans second envoi", async () => {
    const { post, target } = await setup();
    fake.script = [{ status: 504, code: "TIMEOUT" }];
    await publishPost(post.id);
    let t = await targetOf(target.id);
    expect(t.status).toBe("RETRY_WAIT");
    expect(t.errorCategory).toBe("VERIFY");
    expect(t.lastAttemptAt).not.toBeNull();
    fake.recent = [online("IG-999")];
    await makeDue(target.id);
    await advanceProcessingTargets();
    t = await targetOf(target.id);
    expect(t.status).toBe("PUBLISHED");
    expect(t.externalPostId).toBe("IG-999");
    expect(t.externalUrl).toBe("https://instagram.test/p/IG-999");
    expect(fake.publishes).toBe(1);
    expect(await postStatus(post.id)).toBe("PUBLISHED");
  });

  it("délai dépassé et introuvable : échec expliqué, toujours pas de second envoi", async () => {
    const { post, target } = await setup();
    fake.script = [{ status: 504, code: "TIMEOUT" }];
    await publishPost(post.id);
    await makeDue(target.id);
    await advanceProcessingTargets();
    const t = await targetOf(target.id);
    expect(t.status).toBe("FAILED");
    expect(t.errorCategory).toBe("TIMEOUT");
    expect(t.errorMessage).toMatch(/n'apparaît pas/);
    expect(fake.publishes).toBe(1);
  });

  it("relance manuelle d'un envoi incertain : vérifie avant de renvoyer", async () => {
    const { post, target } = await setup();
    fake.script = [{ status: 504, code: "TIMEOUT" }];
    await publishPost(post.id);
    await makeDue(target.id);
    await advanceProcessingTargets(); // introuvable → échec
    // Entre-temps, la publication est apparue : la relance la retrouve.
    fake.recent = [online("IG-LATE")];
    await publishPost(post.id);
    const t = await targetOf(target.id);
    expect(t.status).toBe("PUBLISHED");
    expect(t.externalPostId).toBe("IG-LATE");
    expect(fake.publishes).toBe(1);
  });

  it("relance manuelle toujours introuvable : renvoi normal", async () => {
    const { post, target } = await setup();
    fake.script = [{ status: 504, code: "TIMEOUT" }];
    await publishPost(post.id);
    await makeDue(target.id);
    await advanceProcessingTargets();
    await publishPost(post.id);
    expect(fake.publishes).toBe(2);
    expect((await targetOf(target.id)).status).toBe("PUBLISHED");
  });

  it("une publication déjà rattachée à une autre publication Nebula n'est pas reprise", async () => {
    const { post, connection, target } = await setup();
    const other = await prisma.post.create({ data: { brandId: post.brandId, createdById: post.createdById, caption: CAPTION, status: "PUBLISHED" } });
    await prisma.postTarget.create({ data: { postId: other.id, connectionId: connection.id, network: "INSTAGRAM", status: "PUBLISHED", externalPostId: "IG-TWIN" } });
    fake.script = [{ status: 504, code: "TIMEOUT" }];
    await publishPost(post.id);
    fake.recent = [online("IG-TWIN")];
    await makeDue(target.id);
    await advanceProcessingTargets();
    expect((await targetOf(target.id)).status).toBe("FAILED");
  });

  it("envoi interrompu (fonction coupée) : retrouvé par le cron au lieu d'un échec", async () => {
    const { post, target } = await setup();
    const old = new Date(Date.now() - 20 * 60_000);
    await prisma.post.update({ where: { id: post.id }, data: { status: "PUBLISHING", publishingStartedAt: old } });
    await prisma.postTarget.update({ where: { id: target.id }, data: { status: "PUBLISHING", startedAt: old, lastAttemptAt: old } });
    fake.recent = [{ ...online("IG-CUT"), publishedAt: new Date(old.getTime() + 30_000) }];
    await recoverInterruptedPublications();
    const t = await targetOf(target.id);
    expect(t.status).toBe("PUBLISHED");
    expect(t.externalPostId).toBe("IG-CUT");
    expect(await postStatus(post.id)).toBe("PUBLISHED");
  });

  it("envoi interrompu introuvable : échec « interrompu », vérifié à la relance", async () => {
    const { post, target } = await setup();
    const old = new Date(Date.now() - 20 * 60_000);
    await prisma.post.update({ where: { id: post.id }, data: { status: "PUBLISHING", publishingStartedAt: old } });
    await prisma.postTarget.update({ where: { id: target.id }, data: { status: "PUBLISHING", startedAt: old, lastAttemptAt: old } });
    await recoverInterruptedPublications();
    const t = await targetOf(target.id);
    expect(t.status).toBe("FAILED");
    expect(t.errorCategory).toBe("INTERRUPTED");
    expect(fake.lists).toBe(1);
  });
});
