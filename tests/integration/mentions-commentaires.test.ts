import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mentions et commentaires (10/10/2026, demandes de Lucas), sur une vraie base :
//  - @pseudo dans la Communauté : ligne CommunityMention, notification (sans
//    doublon avec « vous a répondu »), onglet Mentions, suggestions ;
//  - l'auteur d'un sujet ou d'une demande d'avis supprime les messages des
//    autres sous son contenu (une réponse part avec ses réponses) ;
//  - commentaires des réseaux : j'aime (Facebook), suppression (Instagram,
//    Facebook), contenu commenté (titre, miniature) dans la liste.
const session = vi.hoisted(() => ({ userId: null as string | null, email: "membre@test.fr" }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId, email: session.email } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { API_VERSIONS } from "@/lib/social/versions";
import { ensureHandle, setHandle } from "@/lib/community/handle";
import { postReply } from "@/lib/community/forum";
import { commentFeedback } from "@/lib/community/feedback";
import { listMentions, markMentionsRead, suggestMembers } from "@/lib/community/mentions";
import { deleteCommunityContent } from "@/lib/community/moderation";
import { POST as createThread } from "@/app/api/community/threads/route";
import { GET as listComments } from "@/app/api/engagement/route";
import { POST as likeRoute } from "@/app/api/engagement/[id]/like/route";
import { DELETE as deleteRoute } from "@/app/api/engagement/[id]/route";
import { POST as supportMessage } from "@/app/api/support/message/route";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const G = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;

async function member(handle: string, name = "Vrai Nom") {
  const { user, brand } = await makeBrand();
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  await ensureHandle(user.id);
  await setHandle(user.id, handle);
  return { id: user.id, handle, brand };
}

const titles = async (userId: string) => (await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((n: { title: string }) => n.title);

describe.skipIf(!hasDatabase)("Mentions @pseudo de la Communauté", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("réponse : mention enregistrée et notifiée, sans doublon avec « vous a répondu », ni soi-même, ni pseudo inconnu, ni e-mail", async () => {
    const author = await member("cafe.nebula");
    const lea = await member("lea.montage");
    const theo = await member("theo.voyage");
    const thread = await prisma.forumThread.create({ data: { authorId: author.id, title: "Quelle heure pour publier ?", body: "Vos avis ?" } });

    const top = await postReply(lea.id, thread.id, "Je dirais 18 h, @Theo.Voyage tu en penses quoi ? @inconnu42 @lea.montage contact@cafe.nebula.fr");
    expect(top.ok).toBe(true);
    if (!top.ok) return;
    expect(await prisma.communityMention.findMany({ select: { userId: true } })).toEqual([{ userId: theo.id }]);
    expect(await titles(theo.id)).toEqual(["@lea.montage vous a mentionné"]);
    expect(await titles(author.id)).toEqual(["@lea.montage a répondu à votre sujet"]);

    // Répondre à quelqu'un en le mentionnant : une seule notification (« vous a répondu »).
    await postReply(theo.id, thread.id, "@lea.montage merci !", top.reply.id);
    expect(await titles(lea.id)).toEqual(["@theo.voyage vous a répondu"]);
    const forLea = await listMentions(lea.id);
    expect(forLea.unread).toBe(1);
    expect(forLea.mentions[0]).toMatchObject({ kind: "reply", context: "Quelle heure pour publier ?", href: expect.stringContaining(`/community/${thread.id}#reponse-`), read: false });
    expect(forLea.mentions[0].author?.name).toBe("@theo.voyage");
    expect(JSON.stringify(forLea)).not.toContain("Vrai Nom");
    expect(await markMentionsRead(lea.id)).toBe(1);
    expect((await listMentions(lea.id)).unread).toBe(0);
  });

  it("nouveau sujet et avis écrit : mentions enregistrées ; supprimer le message efface la mention", async () => {
    const a = await member("cafe.nebula");
    const b = await member("nova.cuisine");
    session.userId = a.id;
    const res = await createThread(
      new NextRequest("http://localhost/api/community/threads", { method: "POST", body: JSON.stringify({ title: "Collab ?", body: "Qui veut tourner avec @nova.cuisine ?", category: "GENERAL" }), headers: { "content-type": "application/json" } })
    );
    const { thread } = (await res.json()) as { thread: { id: string } };
    expect((await listMentions(b.id)).mentions[0]).toMatchObject({ kind: "thread", context: "Collab ?", href: `/community/${thread.id}` });

    const request = await prisma.feedbackRequest.create({ data: { authorId: b.id, kind: "TITLE", closesAt: new Date(Date.now() + 86_400_000), options: { create: [{ label: "A" }, { label: "B" }] } } });
    const comment = await commentFeedback(a.id, request.id, "Le B, et demande à @nova.cuisine aussi");
    expect(comment.ok).toBe(true);
    // L'autrice de la demande, mentionnée, n'a qu'une notification (« Nouvel avis »).
    expect(await titles(b.id)).toEqual(["@cafe.nebula vous a mentionné", "Nouvel avis sur votre demande"]);
    expect(await prisma.communityMention.count({ where: { userId: b.id } })).toBe(2);
    if (comment.ok) await prisma.feedbackComment.delete({ where: { id: comment.comment.id } });
    expect(await prisma.communityMention.count({ where: { userId: b.id } })).toBe(1);
  });

  it("suggestions : début du pseudo, jamais soi-même, ni le nom ni l'e-mail", async () => {
    const me = await member("lea.moi");
    await member("lea.montage");
    await member("leon.photo");
    await member("theo.voyage");
    const list = await suggestMembers(me.id, "@Lea");
    expect(list.map((m) => m.handle)).toEqual(["lea.montage"]);
    expect((await suggestMembers(me.id, "le")).map((m) => m.handle)).toEqual(["lea.montage", "leon.photo"]);
    expect(await suggestMembers(me.id, "")).toEqual([]);
    expect(JSON.stringify(list)).not.toMatch(/Vrai Nom|@test\.fr/);
  });
});

describe.skipIf(!hasDatabase)("Communauté : l'auteur supprime les messages des autres sous son contenu", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("sujet : une réponse et ses réponses ; un autre membre ne peut pas", async () => {
    const owner = await member("cafe.nebula");
    const other = await member("lea.montage");
    const third = await member("theo.voyage");
    const thread = await prisma.forumThread.create({ data: { authorId: owner.id, title: "Sujet", body: "…" } });
    const top = await postReply(other.id, thread.id, "Hors sujet, @theo.voyage");
    if (!top.ok) throw new Error("réponse");
    await postReply(third.id, thread.id, "Réponse en dessous", top.reply.id);
    await prisma.communityReport.create({ data: { reporterId: owner.id, targetType: "REPLY", targetId: top.reply.id, reason: "SPAM" } });

    expect(await deleteCommunityContent({ userId: third.id, email: "x@test.fr" }, "REPLY", top.reply.id)).toMatchObject({ ok: false, status: 403 });
    expect(await deleteCommunityContent({ userId: owner.id, email: "x@test.fr" }, "REPLY", top.reply.id)).toEqual({ ok: true });
    expect(await prisma.forumReply.count({ where: { threadId: thread.id } })).toBe(0);
    expect(await prisma.communityReport.count()).toBe(0);
    expect(await prisma.communityMention.count()).toBe(0);
  });

  it("demande d'avis : son autrice supprime un avis écrit dessous", async () => {
    const owner = await member("nova.cuisine");
    const other = await member("pixel.ines");
    const request = await prisma.feedbackRequest.create({ data: { authorId: owner.id, kind: "TITLE", closesAt: new Date(Date.now() + 86_400_000), options: { create: [{ label: "A" }, { label: "B" }] } } });
    const c = await prisma.feedbackComment.create({ data: { requestId: request.id, authorId: other.id, body: "Aucun des deux" } });
    expect(await deleteCommunityContent({ userId: owner.id, email: "x@test.fr" }, "FEEDBACK_COMMENT", c.id)).toEqual({ ok: true });
    expect(await prisma.feedbackComment.count()).toBe(0);
  });
});

describe.skipIf(!hasDatabase)("Commentaires des réseaux : j'aime, suppression, contenu commenté", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    process.env.META_APP_SECRET = "app-secret";
  });
  afterEach(() => vi.unstubAllGlobals());

  async function setup() {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    const conn = (network: string, scopes = "") =>
      prisma.socialConnection.create({ data: { brandId: brand.id, network, externalAccountId: `${network}-acc`, displayName: `Compte ${network}`, accessToken: `tok-${network}`, scopes } });
    const ig = await conn("INSTAGRAM", "instagram_basic,instagram_manage_comments");
    const fb = await conn("FACEBOOK", "pages_manage_engagement,page_token");
    const yt = await conn("YOUTUBE", "youtube.readonly");
    const item = (connectionId: string, network: string, externalId: string, extra: Record<string, unknown> = {}) =>
      prisma.engagementItem.create({ data: { connectionId, network, externalId, postExternalId: `POST-${network}`, authorName: "fan", text: "Super !", publishedAt: new Date(), ...extra } });
    return {
      user,
      brand,
      ig,
      fb,
      yt,
      igItem: await item(ig.id, "INSTAGRAM", "1785800001", { postTitle: "Menu d'automne", postThumbnailUrl: "https://scontent.cdninstagram.com/menu.jpg" }),
      fbItem: await item(fb.id, "FACEBOOK", "987_111"),
      ytItem: await item(yt.id, "YOUTUBE", "UgzTOP", { postExternalId: "dQw4w9WgXcQ" })
    };
  }
  const like = (id: string, value: boolean) => likeRoute(new NextRequest(`http://localhost/api/engagement/${id}/like`, { method: "POST", body: JSON.stringify({ like: value }), headers: { "content-type": "application/json" } }), { params: { id } });
  const del = (id: string) => deleteRoute(new NextRequest(`http://localhost/api/engagement/${id}`, { method: "DELETE" }), { params: { id } });

  it("la liste donne ce que chaque compte permet et le contenu commenté (réseau, statistiques, YouTube)", async () => {
    const s = await setup();
    await prisma.postMetric.create({ data: { connectionId: s.fb.id, network: "FACEBOOK", postExternalId: "POST-FACEBOOK", title: "Brunch du dimanche", thumbnailUrl: "https://scontent.xx.fbcdn.net/brunch.jpg" } });
    const body = (await (await listComments(new NextRequest(`http://localhost/api/engagement?brandId=${s.brand.id}`))).json()) as {
      connections: { network: string; actions: { like: boolean; remove: boolean; likeHow: string | null } }[];
      items: { network: string; postTitle: string | null; postThumbnailUrl: string | null }[];
    };
    const actions = Object.fromEntries(body.connections.map((c) => [c.network, c.actions]));
    expect(actions.INSTAGRAM).toMatchObject({ like: false, remove: true });
    expect(actions.INSTAGRAM.likeHow).toContain("Instagram ne permet pas");
    expect(actions.FACEBOOK).toMatchObject({ like: true, remove: true, likeHow: null });
    expect(actions.YOUTUBE).toMatchObject({ like: false, remove: false });
    const byNet = Object.fromEntries(body.items.map((i) => [i.network, i]));
    expect(byNet.INSTAGRAM).toMatchObject({ postTitle: "Menu d'automne", postThumbnailUrl: "https://scontent.cdninstagram.com/menu.jpg" });
    expect(byNet.FACEBOOK).toMatchObject({ postTitle: "Brunch du dimanche", postThumbnailUrl: "https://scontent.xx.fbcdn.net/brunch.jpg" });
    expect(byNet.YOUTUBE.postThumbnailUrl).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  it("Facebook : j'aime puis retrait, au nom de la Page", async () => {
    const s = await setup();
    const net = installNetwork([
      { method: "POST", url: `${G}/987_111/likes`, body: { success: true } },
      { method: "DELETE", url: `${G}/987_111/likes`, body: { success: true } }
    ]);
    expect(await (await like(s.fbItem.id, true)).json()).toMatchObject({ ok: true, likedAt: expect.any(String) });
    expect((await prisma.engagementItem.findUnique({ where: { id: s.fbItem.id } }))?.ownerLikedAt).toBeTruthy();
    expect(net.sent[0].form?.get("access_token")).toBe("tok-FACEBOOK");
    expect(await (await like(s.fbItem.id, false)).json()).toMatchObject({ ok: true, likedAt: null });
    expect(net.sent).toHaveLength(2);
  });

  it("Instagram : pas de j'aime ; suppression sur le réseau puis dans Nebula", async () => {
    const s = await setup();
    const net = installNetwork([{ method: "DELETE", url: `${G}/1785800001`, body: { success: true } }]);
    expect((await like(s.igItem.id, true)).status).toBe(400);
    const res = await del(s.igItem.id);
    expect(await res.json()).toEqual({ ok: true, deleted: true });
    expect(net.sent).toHaveLength(1);
    expect(await prisma.engagementItem.findUnique({ where: { id: s.igItem.id } })).toBeNull();
  });

  it("commentaire déjà supprimé sur le réseau : retiré de Nebula ; YouTube : jamais envoyé ; lecteur : refusé", async () => {
    const s = await setup();
    const net = installNetwork([{ method: "DELETE", url: `${G}/987_111`, status: 400, body: { error: { message: "Object with ID '987_111' does not exist", code: 100, error_subcode: 33 } } }]);
    expect((await del(s.fbItem.id)).status).toBe(200);
    expect(await prisma.engagementItem.findUnique({ where: { id: s.fbItem.id } })).toBeNull();
    expect((await del(s.ytItem.id)).status).toBe(400);
    expect(net.sent).toHaveLength(1);

    const viewer = await makeBrand();
    await prisma.membership.create({ data: { userId: viewer.user.id, brandId: s.brand.id, role: "VIEWER" } });
    session.userId = viewer.user.id;
    expect((await del(s.igItem.id)).status).toBe(403);
    // Une autre marque : introuvable.
    const stranger = await makeBrand();
    session.userId = stranger.user.id;
    expect((await del(s.igItem.id)).status).toBe(404);
  });
});

describe.skipIf(!hasDatabase)("Écrire à l'équipe (Soutenir Nebula)", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });
  const send = (body: unknown) => supportMessage(new NextRequest("http://localhost/api/support/message", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

  it("message enregistré pour l'équipe, avec l'adresse du compte ; jamais sans être connecté", async () => {
    expect((await send({ kind: "idee", message: "Un mode sombre encore plus sombre ?" })).status).toBe(401);
    const m = await member("lea.montage", "Léa Martin");
    session.userId = m.id;
    expect((await send({ kind: "bug", message: "court" })).status).toBe(400);
    expect((await send({ kind: "bug", message: "Le bouton Publier ne répond plus sur téléphone." })).status).toBe(200);
    const saved = await prisma.contactMessage.findFirst();
    const user = await prisma.user.findUnique({ where: { id: m.id }, select: { email: true } });
    expect(saved).toMatchObject({ subject: "Application · Un bug", email: user?.email, name: "Léa Martin · @lea.montage", message: "Le bouton Publier ne répond plus sur téléphone." });
  });
});
