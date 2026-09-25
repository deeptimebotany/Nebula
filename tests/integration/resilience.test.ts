import { beforeEach, describe, expect, it, vi } from "vitest";

// Faux réseau : la file `script` décide du résultat de chaque envoi.
type Step = "ok" | "pending" | { status?: number; code?: string; retryAfterMs?: number };
const fake = vi.hoisted(() => ({ calls: 0, script: [] as unknown[] }));
vi.mock("@/lib/social", async () => {
  const base = await import("@/lib/social/base");
  const run = (network: string) => {
    fake.calls++;
    const step = (fake.script.shift() ?? "ok") as Step;
    if (step === "ok") return { externalPostId: `ext-${fake.calls}` };
    if (step === "pending") return { pending: true, checkpoint: { step: "fake", container: "K" }, retryInMs: 1 };
    const e = new base.SocialApiError(network as "INSTAGRAM", "Refus du réseau", step.status, {}, step.code);
    if (step.retryAfterMs) e.retryAfterMs = step.retryAfterMs;
    throw e;
  };
  const client = (network: string) => ({
    network,
    getAuthUrl: () => "",
    exchangeCodeForToken: async () => {
      throw new Error("non utilisé");
    },
    publishPost: async () => run(network),
    resumePublish: async () => run(network),
    fetchAnalytics: async () => ({ followers: 0, followersDelta: 0, engagementRate: 0, impressions: 0, reach: 0, postsCount: 0 })
  });
  return { getSocialClient: client, SOCIAL_CLIENTS: {} };
});

import { prisma } from "@/lib/prisma";
import { advanceProcessingTargets, publishPost, retryWaitingTargetsNow, stopWaitingTargets } from "@/lib/publish";
import { BREAKER_THRESHOLD, forgetNetworkControlCache, updateNetworkControl, wakeWaitingTargets } from "@/lib/social/network-control";
import { OWNER_EMAIL } from "@/lib/owner";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

async function setup(opts: { network?: string; connStatus?: string } = {}) {
  const network = opts.network ?? "TIKTOK";
  const { user, brand } = await makeBrand();
  const post = await prisma.post.create({
    data: { brandId: brand.id, createdById: user.id, caption: "Test", status: "SCHEDULED", scheduledAt: new Date(Date.now() - 1000) }
  });
  const connection = await prisma.socialConnection.create({
    data: { brandId: brand.id, network, externalAccountId: `acc-${post.id}`, displayName: "Compte", accessToken: "tok", status: opts.connStatus ?? "CONNECTED" }
  });
  const target = await prisma.postTarget.create({ data: { postId: post.id, connectionId: connection.id, network, status: "SCHEDULED" } });
  return { user, brand, post, connection, target };
}
const targetOf = (id: string) => prisma.postTarget.findUniqueOrThrow({ where: { id } });
const postStatus = async (id: string) => (await prisma.post.findUniqueOrThrow({ where: { id } })).status;
/** Rend la relance prévue « due » tout de suite. */
const makeDue = (id: string) => prisma.postTarget.update({ where: { id }, data: { nextCheckAt: new Date(Date.now() - 1000) } });

describe.skipIf(!hasDatabase)("résilience des API (lot 5)", () => {
  beforeEach(async () => {
    await resetDatabase();
    forgetNetworkControlCache();
    fake.calls = 0;
    fake.script = [];
  });

  it("limite de débit : relance automatique, puis publication", async () => {
    const { post, target } = await setup();
    fake.script = [{ status: 429 }];
    await publishPost(post.id);
    let t = await targetOf(target.id);
    expect(t.status).toBe("RETRY_WAIT");
    expect(t.errorCategory).toBe("RATE_LIMITED");
    expect(t.autoRetries).toBe(1);
    expect(t.errorMessage).toMatch(/nouvel essai automatique vers .* \(1\/3\)/);
    expect(await postStatus(post.id)).toBe("PUBLISHING");
    // Pas encore l'heure : rien ne se passe.
    await advanceProcessingTargets();
    expect(fake.calls).toBe(1);
    await makeDue(target.id);
    await advanceProcessingTargets();
    t = await targetOf(target.id);
    expect(t.status).toBe("PUBLISHED");
    expect(t.errorCategory).toBeNull();
    expect(await postStatus(post.id)).toBe("PUBLISHED");
  });

  it("panne qui dure : 3 relances au plus, puis échec expliqué", async () => {
    const { post, target } = await setup();
    fake.script = [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }];
    await publishPost(post.id);
    for (let i = 0; i < 3; i++) {
      await makeDue(target.id);
      await advanceProcessingTargets();
    }
    const t = await targetOf(target.id);
    expect(fake.calls).toBe(4);
    expect(t.status).toBe("FAILED");
    expect(t.errorCategory).toBe("TRANSIENT");
    expect(await postStatus(post.id)).toBe("FAILED");
  });

  it("délai dépassé : jamais renvoyé automatiquement (risque de doublon)", async () => {
    const { post, target } = await setup();
    fake.script = [{ status: 504, code: "TIMEOUT" }];
    await publishPost(post.id);
    const t = await targetOf(target.id);
    expect(t.status).toBe("FAILED");
    expect(t.errorCategory).toBe("TIMEOUT");
    expect(fake.calls).toBe(1);
  });

  it("connexion expirée : compte « à reconnecter », une seule alerte, rétabli après succès", async () => {
    const { user, post, connection, target } = await setup();
    fake.script = [{ status: 401 }];
    await publishPost(post.id);
    expect((await targetOf(target.id)).errorCategory).toBe("AUTH_EXPIRED");
    expect((await prisma.socialConnection.findUniqueOrThrow({ where: { id: connection.id } })).status).toBe("EXPIRED");
    expect(await prisma.notification.count({ where: { userId: user.id, kind: "reconnect" } })).toBe(1);
    // Deuxième échec : pas de nouvelle alerte « reconnecter ».
    fake.script = [{ status: 401 }];
    await publishPost(post.id);
    expect(await prisma.notification.count({ where: { userId: user.id, kind: "reconnect" } })).toBe(1);
    // Le réseau accepte à nouveau : le compte redevient connecté.
    await publishPost(post.id);
    expect((await prisma.socialConnection.findUniqueOrThrow({ where: { id: connection.id } })).status).toBe("CONNECTED");
    expect(await postStatus(post.id)).toBe("PUBLISHED");
  });

  it("réseau suspendu à la main : attente sans appel, départ à la reprise", async () => {
    const { post, target } = await setup();
    await updateNetworkControl("TIKTOK", { publishEnabled: false, message: "Maintenance TikTok." });
    await publishPost(post.id);
    let t = await targetOf(target.id);
    expect(fake.calls).toBe(0);
    expect(t.status).toBe("RETRY_WAIT");
    expect(t.errorCategory).toBe("PAUSED");
    expect(t.errorMessage).toMatch(/suspendue temporairement.*Maintenance TikTok/);
    await updateNetworkControl("TIKTOK", { publishEnabled: true });
    expect(await wakeWaitingTargets("TIKTOK")).toBe(1);
    await advanceProcessingTargets();
    t = await targetOf(target.id);
    expect(t.status).toBe("PUBLISHED");
    expect(fake.calls).toBe(1);
  });

  it("disjoncteur : pannes répétées → envois suspendus, propriétaire prévenu", async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
    const posts = [];
    for (let i = 0; i < BREAKER_THRESHOLD; i++) posts.push(await setup());
    fake.script = Array.from({ length: BREAKER_THRESHOLD }, () => ({ status: 502 }));
    for (const p of posts) await publishPost(p.post.id);
    const control = await prisma.networkControl.findUniqueOrThrow({ where: { network: "TIKTOK" } });
    expect(control.trippedUntil && control.trippedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.notification.count({ where: { userId: owner.id, kind: "reminder" } })).toBe(1);
    // Publication suivante : pas d'appel au réseau pendant la coupure.
    const next = await setup();
    const callsBefore = fake.calls;
    await publishPost(next.post.id);
    expect(fake.calls).toBe(callsBefore);
    expect((await targetOf(next.target.id)).errorCategory).toBe("PAUSED");
    // Les autres réseaux ne sont pas touchés.
    const ig = await setup({ network: "INSTAGRAM" });
    await publishPost(ig.post.id);
    expect(await postStatus(ig.post.id)).toBe("PUBLISHED");
  });

  it("« Réessayer maintenant » et « Arrêter les nouveaux essais »", async () => {
    const a = await setup();
    fake.script = [{ status: 429 }];
    await publishPost(a.post.id);
    expect((await targetOf(a.target.id)).status).toBe("RETRY_WAIT");
    expect(await retryWaitingTargetsNow(a.post.id)).toEqual({ retried: 1 });
    expect(await postStatus(a.post.id)).toBe("PUBLISHED");

    const b = await setup();
    fake.script = [{ status: 429 }];
    await publishPost(b.post.id);
    expect(await stopWaitingTargets(b.post.id)).toEqual({ stopped: 1 });
    const t = await targetOf(b.target.id);
    expect(t.status).toBe("FAILED");
    expect(t.errorMessage).toMatch(/Nouveaux essais arrêtés/);
    expect(await postStatus(b.post.id)).toBe("FAILED");
  });
});
