import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Communauté (10/10/2026, demandes de Lucas), sur une vraie base :
// @pseudo unique à la place du nom, forum façon YouTube (réponses sur un
// niveau, j'aime / je n'aime pas), profil public (bulle et page).
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId, email: "membre@test.fr" } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureHandle, setHandle } from "@/lib/community/handle";
import { loadThread, postReply, voteForum } from "@/lib/community/forum";
import { loadMemberProfile } from "@/lib/community/member-profile";
import { GET as VIDEOS } from "@/app/api/community/videos/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

async function member(name = "Lucas Nomme") {
  const { user, brand } = await makeBrand();
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  const handle = await ensureHandle(user.id);
  return { user: { ...user, name, handle }, brand };
}

describe.skipIf(!hasDatabase)("Communauté : pseudos, forum, profils", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(() => {
    session.userId = null;
  });

  it("pseudo attribué d'office (mot de l'espace + chiffres, jamais le nom), changeable, unique, mots réservés refusés", async () => {
    const a = await member();
    const b = await member("Autre");
    expect(a.user.handle).toMatch(/^(comete|orbite|nova|pulsar|nebuleuse|astre|etoile|galaxie|aurore|quasar|eclipse|meteore|zenith|cosmos|lune)\d{4,6}$/);
    expect(a.user.handle).not.toContain("lucas");
    expect(await ensureHandle(a.user.id)).toBe(a.user.handle); // déjà attribué : inchangé
    expect(await setHandle(a.user.id, "@Lucas.Été")).toEqual({ ok: true, handle: "lucas.ete" });
    expect(await setHandle(b.user.id, "LUCAS.ETE")).toMatchObject({ ok: false, status: 409 });
    expect(await setHandle(b.user.id, "ab")).toMatchObject({ ok: false, status: 400 });
    expect(await setHandle(b.user.id, "nebula_officiel")).toMatchObject({ ok: false, status: 400 });
    expect(await setHandle(b.user.id, "support")).toMatchObject({ ok: false, status: 400 });
  });

  it("forum : le pseudo s'affiche, jamais le nom ; réponse à une réponse rattachée au fil ; notifications", async () => {
    const author = await member("Prénom Nom Auteur");
    const replier = await member("Prénom Nom Répondant");
    const third = await member("Troisième");
    const thread = await prisma.forumThread.create({ data: { authorId: author.user.id, title: "Quelle heure pour publier ?", body: "Vos avis ?" } });

    const top = await postReply(replier.user.id, thread.id, "Le soir, vers 18 h.");
    expect(top.ok).toBe(true);
    if (!top.ok) return;
    expect(top.reply.author?.name).toBe(`@${replier.user.handle}`);
    expect(JSON.stringify(top.reply)).not.toContain("Prénom");

    // Réponse à la réponse, puis réponse à cette réponse : même fil (un seul niveau).
    const child = await postReply(author.user.id, thread.id, "Merci !", top.reply.id);
    expect(child.ok && child.reply.parentId).toBe(top.reply.id);
    if (!child.ok) return;
    const grandChild = await postReply(third.user.id, thread.id, `@${author.user.handle} pareil pour moi`, child.reply.id);
    expect(grandChild.ok && grandChild.reply.parentId).toBe(top.reply.id);

    // Notifications : l'auteur du sujet, la personne à qui l'on répond.
    const notes = async (userId: string) => (await prisma.notification.findMany({ where: { userId } })).map((n: { title: string }) => n.title);
    expect(await notes(author.user.id)).toContain(`@${replier.user.handle} a répondu à votre sujet`);
    expect(await notes(replier.user.id)).toContain(`@${author.user.handle} vous a répondu`);
    expect(await notes(author.user.id)).toContain(`@${third.user.handle} vous a répondu`);

    // Un message d'un autre sujet ne peut pas servir de parent.
    const other = await prisma.forumThread.create({ data: { authorId: author.user.id, title: "Autre", body: "…" } });
    expect(await postReply(replier.user.id, other.id, "Hors sujet", top.reply.id)).toMatchObject({ ok: false, status: 404 });

    const loaded = await loadThread(third.user.id, thread.id);
    expect(loaded?.author?.name).toBe(`@${author.user.handle}`);
    expect(loaded?.replies.map((r) => r.parentId)).toEqual([null, top.reply.id, top.reply.id]);
  });

  it("j'aime / je n'aime pas : un seul par personne, je n'aime pas jamais compté ni affiché, Réussites non plus", async () => {
    const author = await member();
    const fan = await member("Fan");
    const critic = await member("Critique");
    const thread = await prisma.forumThread.create({ data: { authorId: author.user.id, title: "Sujet", body: "…" } });
    const reply = await postReply(author.user.id, thread.id, "Ma réponse");
    if (!reply.ok) throw new Error("réponse");

    expect(await voteForum(fan.user.id, { replyId: reply.reply.id }, "like")).toMatchObject({ ok: true, likes: 1, myVote: "like" });
    expect(await voteForum(critic.user.id, { replyId: reply.reply.id }, "dislike")).toMatchObject({ ok: true, likes: 1, myVote: "dislike" });
    // Changer d'avis : le j'aime remplace le je n'aime pas.
    expect(await voteForum(critic.user.id, { replyId: reply.reply.id }, "like")).toMatchObject({ likes: 2, myVote: "like" });
    expect(await voteForum(critic.user.id, { replyId: reply.reply.id }, null)).toMatchObject({ likes: 1, myVote: null });
    expect(await voteForum(critic.user.id, { threadId: thread.id }, "dislike")).toMatchObject({ likes: 0, myVote: "dislike" });
    expect(await prisma.communityReaction.count({ where: { userId: critic.user.id } })).toBe(1);

    const view = await loadThread(fan.user.id, thread.id);
    expect(view).toMatchObject({ likes: 0, myVote: null });
    expect(view?.replies[0]).toMatchObject({ likes: 1, myVote: "like" });
    expect(JSON.stringify(view)).not.toMatch(/dislikes/);
    // Réussites (« Apprécié ») : seuls les j'aime comptent.
    const received = await prisma.communityReaction.count({
      where: { userId: { not: author.user.id }, emoji: { not: "dislike" }, OR: [{ thread: { authorId: author.user.id } }, { reply: { authorId: author.user.id } }] }
    });
    expect(received).toBe(1);
  });

  it("profil public : pseudo, rang, badges, activité ; bio et liens seulement si la page bio est publiée ; jamais le nom ni l'e-mail", async () => {
    const m = await member("Vrai Nom Secret");
    await prisma.forumThread.create({ data: { authorId: m.user.id, title: "Mon premier sujet", body: "…" } });
    const page = await prisma.linkPage.create({ data: { brandId: m.brand.id, published: false, bio: "Recettes du dimanche" } });
    await prisma.linkItem.createMany({
      data: [
        { linkPageId: page.id, label: "Ma chaîne", url: "https://www.youtube.com/@cafe", order: 0 },
        { linkPageId: page.id, label: "Instagram", url: "https://instagram.com/cafe", order: 1 },
        { linkPageId: page.id, label: "Piège", url: "javascript:alert(1)", order: 2 }
      ]
    });

    const hidden = await loadMemberProfile(m.user.handle as string);
    expect(hidden?.bio).toBeNull();
    await prisma.linkPage.update({ where: { id: page.id }, data: { published: true } });
    const p = await loadMemberProfile(`@${m.user.handle}`);
    expect(p).toMatchObject({ id: m.user.id, name: `@${m.user.handle}`, stats: { threads: 1, replies: 0 }, recentThreads: [{ title: "Mon premier sujet" }] });
    expect(p?.bio?.text).toBe("Recettes du dimanche");
    expect(p?.bio?.links).toEqual([
      { label: "Ma chaîne", url: "https://www.youtube.com/@cafe", network: "YOUTUBE" },
      { label: "Instagram", url: "https://instagram.com/cafe", network: "INSTAGRAM" }
    ]);
    const json = JSON.stringify(p);
    expect(json).not.toContain("Vrai Nom Secret");
    expect(json).not.toContain("@test.fr");
    // Par identifiant aussi (bulle d'un membre sans pseudo connu côté page).
    expect((await loadMemberProfile(m.user.id))?.handle).toBe(m.user.handle);
    expect(await loadMemberProfile("inconnu-du-tout")).toBeNull();
  });

  it("vidéos partagées : le pseudo, pas le nom", async () => {
    const m = await member("Nom Réel Vidéo");
    await prisma.sharedVideo.create({ data: { authorId: m.user.id, network: "YOUTUBE", title: "Latte art", externalUrl: "https://youtu.be/x" } });
    session.userId = m.user.id;
    const data = await (await VIDEOS()).json();
    expect(data.videos[0].author).toMatchObject({ id: m.user.id, name: `@${m.user.handle}`, handle: m.user.handle });
    expect(JSON.stringify(data)).not.toContain("Nom Réel");
    void NextRequest;
  });
});
