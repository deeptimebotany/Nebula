import { beforeEach, describe, expect, it, vi } from "vitest";

// Réponse hors contrat pendant un envoi (lot 7) : le réseau a répondu « OK »
// mais sans l'identifiant attendu. La publication est peut-être en ligne :
// vérification, jamais de nouvel envoi automatique ; le propriétaire est
// prévenu ; le disjoncteur n'est pas déclenché.
type Step = "ok" | "unexpected";
const fake = vi.hoisted(() => ({ publishes: 0, lists: 0, script: [] as string[], recent: [] as { externalPostId: string; text?: string; permalink?: string; publishedAt?: Date }[] }));
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
      return base.throwUnexpected(network as "INSTAGRAM", "réponse dans un format inattendu (POST graph.facebook.com/v25.0/{id}/media_publish : champ « id » absent).", 200);
    },
    // LinkedIn ne permet pas de relire ses posts (voir linkedin.ts).
    ...(network === "LINKEDIN"
      ? {}
      : {
          async listRecentPosts() {
            fake.lists++;
            return fake.recent;
          }
        }),
    fetchAnalytics: async () => ({ followers: 0, followersDelta: 0, engagementRate: 0, impressions: 0, reach: 0, postsCount: 0 })
  });
  return { getSocialClient: client, SOCIAL_CLIENTS: {} };
});

import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL } from "@/lib/owner";
import { advanceProcessingTargets, publishPost } from "@/lib/publish";
import { forgetNetworkControlCache } from "@/lib/social/network-control";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const CAPTION = "Nouveau menu d'automne ☕ #cafe";

async function setup(network: "INSTAGRAM" | "LINKEDIN" = "INSTAGRAM") {
  const { user, brand } = await makeBrand();
  const post = await prisma.post.create({
    data: { brandId: brand.id, createdById: user.id, caption: CAPTION, status: "SCHEDULED", scheduledAt: new Date(Date.now() - 1000) }
  });
  const connection = await prisma.socialConnection.create({
    data: { brandId: brand.id, network, externalAccountId: `acc-${post.id}`, displayName: "Compte", accessToken: "tok", status: "CONNECTED" }
  });
  const target = await prisma.postTarget.create({ data: { postId: post.id, connectionId: connection.id, network, status: "SCHEDULED" } });
  return { post, target };
}
const targetOf = (id: string) => prisma.postTarget.findUniqueOrThrow({ where: { id } });
const makeDue = (id: string) => prisma.postTarget.update({ where: { id }, data: { nextCheckAt: new Date(Date.now() - 1000) } });

describe.skipIf(!hasDatabase)("réponse hors contrat pendant un envoi (lot 7)", () => {
  beforeEach(async () => {
    await resetDatabase();
    forgetNetworkControlCache();
    fake.publishes = 0;
    fake.lists = 0;
    fake.script = [];
    fake.recent = [];
  });

  it("vérification au lieu d'un échec, propriétaire prévenu, disjoncteur intact", async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Propriétaire" } });
    const { post, target } = await setup();
    fake.script = ["unexpected"];
    await publishPost(post.id);

    const t = await targetOf(target.id);
    expect(t.status).toBe("RETRY_WAIT");
    expect(t.errorCategory).toBe("VERIFY");
    expect(t.errorMessage).toMatch(/format inattendu.*aucun nouvel envoi/);

    const control = await prisma.networkControl.findUniqueOrThrow({ where: { network: "INSTAGRAM" } });
    expect(control.failureCount).toBe(0);
    expect(control.trippedUntil).toBeNull();
    expect(control.lastFailureCategory).toBe("UNEXPECTED_RESPONSE");

    const alert = await prisma.notification.findFirst({ where: { userId: owner.id, dedupeKey: "network-format:INSTAGRAM" } });
    expect(alert?.title).toMatch(/nouveau format/);
    expect(alert?.body).toMatch(/media_publish/);
  });

  it("publication retrouvée sur le réseau : publiée, sans second envoi", async () => {
    const { post, target } = await setup();
    fake.script = ["unexpected"];
    await publishPost(post.id);
    fake.recent = [{ externalPostId: "IG-777", text: CAPTION, permalink: "https://instagram.test/p/IG-777", publishedAt: new Date() }];
    await makeDue(target.id);
    await advanceProcessingTargets();
    const t = await targetOf(target.id);
    expect(t.status).toBe("PUBLISHED");
    expect(t.externalPostId).toBe("IG-777");
    expect(fake.publishes).toBe(1);
  });

  it("introuvable : échec « envoi non confirmé » ; la relance vérifie encore avant de renvoyer", async () => {
    const { post, target } = await setup();
    fake.script = ["unexpected"];
    await publishPost(post.id);
    await makeDue(target.id);
    await advanceProcessingTargets();
    let t = await targetOf(target.id);
    expect(t.status).toBe("FAILED");
    expect(t.errorMessage).toMatch(/n'a pas confirmé l'envoi et la publication n'apparaît pas/);
    fake.recent = [{ externalPostId: "IG-LATE", text: CAPTION, publishedAt: new Date() }];
    await publishPost(post.id);
    t = await targetOf(target.id);
    expect(t.status).toBe("PUBLISHED");
    expect(t.externalPostId).toBe("IG-LATE");
    expect(fake.publishes).toBe(1);
  });

  it("réseau sans vérification possible (LinkedIn) : échec « réponse inattendue », jamais renvoyé tout seul", async () => {
    const { post, target } = await setup("LINKEDIN");
    fake.script = ["unexpected"];
    await publishPost(post.id);
    const t = await targetOf(target.id);
    expect(t.status).toBe("FAILED");
    expect(t.errorCategory).toBe("UNEXPECTED_RESPONSE");
    await advanceProcessingTargets();
    expect(fake.publishes).toBe(1);
  });
});
