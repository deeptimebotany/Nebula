import { beforeEach, describe, expect, it, vi } from "vitest";

// Modération de la Communauté (30/09/2026), sur une vraie base : signaler
// (une fois par personne et par contenu, jamais le sien), alerte dans la
// cloche du propriétaire du site, suppression par l'auteur ou le propriétaire.
const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.user ? { user: session.user } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL } from "@/lib/owner";
import { POST as postReport } from "@/app/api/community/reports/route";
import { GET as getThread, DELETE as deleteThread } from "@/app/api/community/threads/[id]/route";
import { DELETE as deleteReply } from "@/app/api/community/threads/[id]/replies/[replyId]/route";
import { DELETE as deleteVideo } from "@/app/api/community/videos/[id]/route";
import { hasDatabase, resetDatabase } from "./helpers";

function req(url: string, body?: unknown, method = "POST") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

let seq = 0;
async function user(email?: string) {
  seq++;
  return prisma.user.create({ data: { email: email ?? `membre${seq}-${Date.now()}@test.fr`, name: `Membre ${seq}` } });
}
const as = (u: { id: string; email: string }) => (session.user = { id: u.id, email: u.email });

describe.skipIf(!hasDatabase)("Communauté : signaler et modérer", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.user = null;
  });

  it("signalement : un par personne et par contenu, jamais le sien, une alerte au propriétaire", async () => {
    const owner = await user(OWNER_EMAIL);
    const alice = await user();
    const bob = await user();
    const carla = await user();
    const thread = await prisma.forumThread.create({ data: { authorId: alice.id, title: "Mon astuce", body: "Achetez mes abonnés ici" } });

    as(alice);
    const own = await postReport(req("/api/community/reports", { targetType: "THREAD", targetId: thread.id, reason: "SPAM" }));
    expect(own.status).toBe(400);

    as(bob);
    expect((await postReport(req("/api/community/reports", { targetType: "THREAD", targetId: thread.id }))).status).toBe(400);
    const first = await postReport(req("/api/community/reports", { targetType: "THREAD", targetId: thread.id, reason: "SPAM", details: "  Vente   d'abonnés  " }));
    expect(first.status).toBe(200);
    const again = await postReport(req("/api/community/reports", { targetType: "THREAD", targetId: thread.id, reason: "OTHER" }));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ already: true });

    as(carla);
    expect((await postReport(req("/api/community/reports", { targetType: "THREAD", targetId: thread.id, reason: "MISLEADING" }))).status).toBe(200);

    const reports = await prisma.communityReport.findMany({ where: { targetId: thread.id }, orderBy: { createdAt: "asc" } });
    expect(reports.map((r) => [r.reporterId, r.reason])).toEqual([
      [bob.id, "SPAM"],
      [carla.id, "MISLEADING"]
    ]);
    expect(reports[0].details).toBe("Vente d'abonnés");

    // Une seule notification dans la cloche du propriétaire, remise à jour.
    const notes = await prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Communauté : sujet signalé", href: `/community/${thread.id}`, readAt: null });
    expect(notes[0].body).toContain("2 signalements au total");
    expect(await prisma.notification.count({ where: { userId: { not: owner.id } } })).toBe(0);

    // La discussion dit à Bob qu'il l'a déjà signalée.
    as(bob);
    const detail = await (await getThread(req(`/api/community/threads/${thread.id}`, undefined, "GET"), { params: { id: thread.id } })).json();
    expect(detail.viewer).toEqual({ canModerate: false, reported: [`THREAD:${thread.id}`] });
  });

  it("réponse et lien partagé signalables ; contenu disparu : 404", async () => {
    await user(OWNER_EMAIL);
    const alice = await user();
    const bob = await user();
    const thread = await prisma.forumThread.create({ data: { authorId: bob.id, title: "Question", body: "Comment programmer ?" } });
    const reply = await prisma.forumReply.create({ data: { threadId: thread.id, authorId: alice.id, body: "Insulte" } });
    const video = await prisma.sharedVideo.create({ data: { authorId: alice.id, network: "YOUTUBE", title: "Ma vidéo", externalUrl: "https://youtube.com/watch?v=x" } });
    as(bob);
    expect((await postReport(req("/api/community/reports", { targetType: "REPLY", targetId: reply.id, reason: "HARASSMENT" }))).status).toBe(200);
    expect((await postReport(req("/api/community/reports", { targetType: "VIDEO", targetId: video.id, reason: "OFFENSIVE" }))).status).toBe(200);
    expect((await postReport(req("/api/community/reports", { targetType: "VIDEO", targetId: "inconnu", reason: "SPAM" }))).status).toBe(404);
    const titles = (await prisma.notification.findMany({ orderBy: { createdAt: "asc" } })).map((n) => [n.title, n.href]);
    expect(titles).toEqual([
      ["Communauté : réponse signalée", `/community/${thread.id}#reponse-${reply.id}`],
      ["Communauté : lien partagé signalé", `/community?onglet=videos#video-${video.id}`]
    ]);
  });

  it("suppression : l'auteur ou le propriétaire, jamais un autre membre ; les signalements partent avec", async () => {
    const owner = await user(OWNER_EMAIL);
    const alice = await user();
    const bob = await user();
    const thread = await prisma.forumThread.create({ data: { authorId: alice.id, title: "Spam", body: "…" } });
    const reply = await prisma.forumReply.create({ data: { threadId: thread.id, authorId: alice.id, body: "Encore" } });
    const bobReply = await prisma.forumReply.create({ data: { threadId: thread.id, authorId: bob.id, body: "Réponse de Bob" } });
    const video = await prisma.sharedVideo.create({ data: { authorId: alice.id, network: "TIKTOK", title: "Clip", externalUrl: "https://tiktok.com/@a/video/1" } });
    await prisma.communityReport.createMany({
      data: [
        { reporterId: bob.id, targetType: "THREAD", targetId: thread.id, reason: "SPAM" },
        { reporterId: bob.id, targetType: "REPLY", targetId: reply.id, reason: "SPAM" }
      ]
    });

    as(bob);
    expect((await deleteThread(req(`/api/community/threads/${thread.id}`, undefined, "DELETE"), { params: { id: thread.id } })).status).toBe(403);
    expect((await deleteReply(req("/x", undefined, "DELETE"), { params: { id: thread.id, replyId: reply.id } })).status).toBe(403);
    expect((await deleteVideo(req("/x", undefined, "DELETE"), { params: { id: video.id } })).status).toBe(403);
    // Sa propre réponse : oui.
    expect((await deleteReply(req("/x", undefined, "DELETE"), { params: { id: thread.id, replyId: bobReply.id } })).status).toBe(200);
    // Mauvaise discussion : 404.
    expect((await deleteReply(req("/x", undefined, "DELETE"), { params: { id: "autre", replyId: reply.id } })).status).toBe(404);

    as(owner);
    const detail = await (await getThread(req(`/api/community/threads/${thread.id}`, undefined, "GET"), { params: { id: thread.id } })).json();
    expect(detail.viewer.canModerate).toBe(true);
    expect((await deleteVideo(req("/x", undefined, "DELETE"), { params: { id: video.id } })).status).toBe(200);
    expect((await deleteThread(req(`/api/community/threads/${thread.id}`, undefined, "DELETE"), { params: { id: thread.id } })).status).toBe(200);
    expect(await prisma.forumThread.count()).toBe(0);
    expect(await prisma.forumReply.count()).toBe(0);
    expect(await prisma.sharedVideo.count()).toBe(0);
    expect(await prisma.communityReport.count()).toBe(0);
  });
});
