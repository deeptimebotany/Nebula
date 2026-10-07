import { beforeEach, describe, expect, it, vi } from "vitest";

// Premier commentaire (07/10/2026), sur une vraie base, avec de faux
// réseaux : son sort est noté réseau par réseau, un réseau qui ne le permet
// pas le dit, un réseau pas prêt est relancé par le cron, un envoi sans
// réponse n'est jamais doublé, un échec prévient l'auteur, « Réessayer »
// marche après une reconnexion.
type Step = "ok" | { status?: number; code?: string; raw?: unknown; message?: string };
const fake = vi.hoisted(() => ({
  comments: [] as { network: string; postId: string; text: string }[],
  script: [] as unknown[],
  recent: [] as { externalPostId: string; text?: string; publishedAt?: Date }[],
  publishScript: [] as unknown[],
  slow: 0
}));
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/social", async () => {
  const base = await import("@/lib/social/base");
  const fail = (network: string, step: Exclude<Step, "ok">) => new base.SocialApiError(network as "INSTAGRAM", step.message ?? "refus", step.status, step.raw ?? {}, step.code);
  const client = (network: string) => ({
    network,
    getAuthUrl: () => "",
    exchangeCodeForToken: async () => {
      throw new Error("non utilisé");
    },
    async publishPost() {
      const step = (fake.publishScript.shift() ?? "ok") as Step;
      if (step !== "ok") throw fail(network, step);
      return { externalPostId: `${network}-POST-1` };
    },
    async listRecentPosts() {
      return fake.recent;
    },
    // TikTok et Pinterest : pas de postComment (comme les vrais clients).
    ...(network === "TIKTOK" || network === "PINTEREST"
      ? {}
      : {
          async postComment(_c: unknown, externalPostId: string, text: string) {
            if (fake.slow) await new Promise((r) => setTimeout(r, fake.slow));
            const step = (fake.script.shift() ?? "ok") as Step;
            if (step !== "ok") throw fail(network, step);
            fake.comments.push({ network, postId: externalPostId, text });
          }
        }),
    fetchAnalytics: async () => ({ followers: 0, followersDelta: 0, engagementRate: 0, impressions: 0, reach: 0, postsCount: 0 })
  });
  return { getSocialClient: client, SOCIAL_CLIENTS: {} };
});

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { advanceProcessingTargets, publishPost } from "@/lib/publish";
import { publishFirstComment, retryWaitingFirstComments } from "@/lib/first-comment";
import { POST as postRetry } from "@/app/api/posts/[id]/first-comment/route";
import { forgetNetworkControlCache } from "@/lib/social/network-control";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const COMMENT = "Le lien est en description 👇";

async function setup(network: string, options: { scopes?: string; metadata?: object; firstComment?: string | null } = {}) {
  const { user, brand } = await makeBrand();
  const post = await prisma.post.create({
    data: {
      brandId: brand.id,
      createdById: user.id,
      caption: "Les coulisses du tournage",
      title: "Coulisses",
      status: "SCHEDULED",
      scheduledAt: new Date(Date.now() - 1000),
      firstComment: options.firstComment === undefined ? COMMENT : options.firstComment
    }
  });
  const connection = await prisma.socialConnection.create({
    data: { brandId: brand.id, network, externalAccountId: `${network}-${post.id}`, displayName: "Compte", accessToken: "tok", status: "CONNECTED", scopes: options.scopes ?? "" }
  });
  const target = await prisma.postTarget.create({
    data: { postId: post.id, connectionId: connection.id, network, status: "SCHEDULED", ...(options.metadata ? { metadata: options.metadata } : {}) }
  });
  return { user, post, connection, target };
}
const targetOf = (id: string) => prisma.postTarget.findUniqueOrThrow({ where: { id } });
const ytError = (status: number, reason: string) => ({ status, raw: { error: { code: status, errors: [{ reason }] } }, message: reason });
const fullTarget = (id: string) => prisma.postTarget.findUniqueOrThrow({ where: { id }, include: { connection: true, post: true } });

describe.skipIf(!hasDatabase)("premier commentaire : sort noté réseau par réseau", () => {
  beforeEach(async () => {
    await resetDatabase();
    forgetNetworkControlCache();
    fake.comments = [];
    fake.script = [];
    fake.recent = [];
    fake.publishScript = [];
    fake.slow = 0;
    session.userId = null;
    delete process.env.YOUTUBE_COMMENT_REPLY;
  });

  it("Instagram : publié juste après la publication, sous le bon post", async () => {
    const { post, target } = await setup("INSTAGRAM");
    await publishPost(post.id);
    const t = await targetOf(target.id);
    expect(t.status).toBe("PUBLISHED");
    expect(t).toMatchObject({ firstCommentStatus: "POSTED", firstCommentError: null, firstCommentAttempts: 1 });
    expect(fake.comments).toEqual([{ network: "INSTAGRAM", postId: "INSTAGRAM-POST-1", text: COMMENT }]);
  });

  it("sans premier commentaire : rien n'est noté ni envoyé", async () => {
    const { post, target } = await setup("INSTAGRAM", { firstComment: null });
    await publishPost(post.id);
    expect((await targetOf(target.id)).firstCommentStatus).toBeNull();
    expect(fake.comments).toHaveLength(0);
  });

  it("TikTok : pas possible, la raison est notée (avant : ignoré sans rien dire) ; pas de notification", async () => {
    const { user, post, target } = await setup("TIKTOK", { metadata: { tiktok: { privacyLevel: "SELF_ONLY" } } });
    await publishPost(post.id);
    const t = await targetOf(target.id);
    expect(t.firstCommentStatus).toBe("UNSUPPORTED");
    expect(t.firstCommentError).toMatch(/TikTok ne permet pas/);
    expect(await prisma.notification.count({ where: { userId: user.id, dedupeKey: `first-comment:${target.id}` } })).toBe(0);
  });

  it("YouTube sans l'autorisation de commenter (cas de Lucas) : non publié, raison claire, aucun appel", async () => {
    const { post, target } = await setup("YOUTUBE", { scopes: "youtube.upload,youtube.readonly", metadata: { privacyStatus: "unlisted" } });
    await publishPost(post.id);
    const t = await targetOf(target.id);
    expect(t.firstCommentStatus).toBe("UNSUPPORTED");
    expect(t.firstCommentError).toMatch(/autorisation de plus pour commenter/);
    expect(fake.comments).toHaveLength(0);
  });

  it("YouTube avec l'autorisation, vidéo pas encore traitée : nouvel essai par le cron, puis publié", async () => {
    process.env.YOUTUBE_COMMENT_REPLY = "true";
    const { post, target } = await setup("YOUTUBE", { scopes: "youtube.upload,youtube.readonly,youtube.force-ssl", metadata: { privacyStatus: "unlisted" } });
    fake.script = [ytError(404, "videoNotFound")];
    await publishPost(post.id);
    let t = await targetOf(target.id);
    expect(t.firstCommentStatus).toBe("WAITING");
    expect(t.firstCommentNextAt!.getTime()).toBeGreaterThan(Date.now() + 60_000);
    // Pas encore l'heure : rien.
    expect((await retryWaitingFirstComments()).retried).toBe(0);
    await prisma.postTarget.update({ where: { id: target.id }, data: { firstCommentNextAt: new Date(Date.now() - 1000) } });
    expect((await retryWaitingFirstComments()).retried).toBe(1);
    t = await targetOf(target.id);
    expect(t).toMatchObject({ firstCommentStatus: "POSTED", firstCommentAttempts: 2, firstCommentNextAt: null });
    expect(fake.comments).toEqual([{ network: "YOUTUBE", postId: "YOUTUBE-POST-1", text: COMMENT }]);
  });

  it("YouTube, vidéo privée : non publié (YouTube ne l'accepte pas), sans appel", async () => {
    const { post, target } = await setup("YOUTUBE", { scopes: "youtube.force-ssl", metadata: { privacyStatus: "private" } });
    await publishPost(post.id);
    expect((await targetOf(target.id)).firstCommentError).toMatch(/Vidéo privée/);
    expect(fake.comments).toHaveLength(0);
  });

  it("pas de réponse du réseau : jamais renvoyé, l'auteur est prévenu", async () => {
    const { user, post, target } = await setup("FACEBOOK");
    fake.script = [{ status: 504, code: "TIMEOUT", message: "le réseau n'a pas répondu à temps." }];
    await publishPost(post.id);
    const t = await targetOf(target.id);
    expect(t.firstCommentStatus).toBe("FAILED");
    expect(t.firstCommentError).toMatch(/a peut-être été publié/);
    expect((await retryWaitingFirstComments()).retried).toBe(0);
    const note = await prisma.notification.findFirst({ where: { userId: user.id, dedupeKey: `first-comment:${target.id}` } });
    expect(note).toMatchObject({ title: "Premier commentaire non publié", href: `/posts/${post.id}` });
    expect(note!.body).toMatch(/en ligne sur Facebook, mais pas son premier commentaire/);
    // La publication elle-même reste un succès.
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("PUBLISHED");
  });

  it("Bluesky : commentaire trop long refusé avant l'envoi", async () => {
    const { post, target } = await setup("BLUESKY", { firstComment: "a".repeat(301) });
    await publishPost(post.id);
    expect((await targetOf(target.id)).firstCommentError).toMatch(/trop long pour Bluesky \(300 caractères au plus\)/);
    expect(fake.comments).toHaveLength(0);
  });

  it("deux envois simultanés : un seul commentaire publié", async () => {
    const { post, target } = await setup("THREADS");
    await prisma.postTarget.update({ where: { id: target.id }, data: { status: "PUBLISHED", externalPostId: "TH-1" } });
    fake.slow = 150;
    const t = await fullTarget(target.id);
    const results = await Promise.all([publishFirstComment(t.post, t), publishFirstComment(t.post, t)]);
    expect(results.filter((r) => r === "POSTED")).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(fake.comments).toHaveLength(1);
  });

  it("publication retrouvée en ligne après un délai dépassé : son commentaire part à ce moment-là", async () => {
    const { post, target } = await setup("INSTAGRAM");
    fake.publishScript = [{ status: 504, code: "TIMEOUT", message: "Délai dépassé" }];
    await publishPost(post.id);
    expect((await targetOf(target.id)).status).toBe("RETRY_WAIT");
    expect(fake.comments).toHaveLength(0);
    fake.recent = [{ externalPostId: "IG-777", text: "Les coulisses du tournage", publishedAt: new Date() }];
    await prisma.postTarget.update({ where: { id: target.id }, data: { nextCheckAt: new Date(Date.now() - 1000) } });
    await advanceProcessingTargets();
    const t = await targetOf(target.id);
    expect(t).toMatchObject({ status: "PUBLISHED", firstCommentStatus: "POSTED" });
    expect(fake.comments).toEqual([{ network: "INSTAGRAM", postId: "IG-777", text: COMMENT }]);
  });

  it("envoi interrompu (fonction coupée) : échec prudent au bout de 15 min, jamais renvoyé", async () => {
    const { target } = await setup("LINKEDIN");
    await prisma.postTarget.update({ where: { id: target.id }, data: { status: "PUBLISHED", externalPostId: "urn:li:share:1", firstCommentStatus: "SENDING", firstCommentNextAt: new Date(Date.now() - 20 * 60_000) } });
    expect((await retryWaitingFirstComments()).stale).toBe(1);
    const t = await targetOf(target.id);
    expect(t.firstCommentStatus).toBe("FAILED");
    expect(t.firstCommentError).toMatch(/a peut-être été publié/);
    expect(fake.comments).toHaveLength(0);
  });

  it("« Réessayer » : après reconnexion de la chaîne YouTube, le commentaire part ; refusé pour un autre compte", async () => {
    process.env.YOUTUBE_COMMENT_REPLY = "true";
    const { user, post, connection, target } = await setup("YOUTUBE", { scopes: "youtube.upload,youtube.readonly", metadata: { privacyStatus: "unlisted" } });
    await publishPost(post.id);
    expect((await targetOf(target.id)).firstCommentStatus).toBe("UNSUPPORTED");
    const retry = (id: string) => postRetry(new NextRequest(`http://localhost/api/posts/${post.id}/first-comment`, { method: "POST", body: JSON.stringify({ targetId: id }), headers: { "content-type": "application/json" } }), { params: { id: post.id } });

    const { user: stranger } = await makeBrand();
    session.userId = stranger.id;
    expect((await retry(target.id)).status).toBe(404);

    session.userId = user.id;
    // Toujours sans l'autorisation : toujours non publié, raison renvoyée.
    let res = await retry(target.id);
    expect(await res.json()).toMatchObject({ status: "UNSUPPORTED", error: expect.stringMatching(/Reconnectez cette chaîne/) });
    // Chaîne reconnectée avec l'autorisation de commenter.
    await prisma.socialConnection.update({ where: { id: connection.id }, data: { scopes: "youtube.upload,youtube.readonly,youtube.force-ssl" } });
    res = await retry(target.id);
    expect(await res.json()).toEqual({ status: "POSTED", error: null });
    expect(fake.comments).toHaveLength(1);
    // Déjà publié : rien à réessayer, aucun second commentaire.
    res = await retry(target.id);
    expect((await res.json()).status).toBe("POSTED");
    expect(fake.comments).toHaveLength(1);
  });
});
