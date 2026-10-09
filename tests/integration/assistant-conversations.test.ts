import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Conversations de « Demander à Nebula » (09/10/2026), sur une vraie base :
// enregistrement à chaque réponse, liste par personne et par marque,
// réouverture, suppression, jamais celles d'un autre membre, purge à 90 jours.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST as chat } from "@/app/api/ai/chat/route";
import { GET as list } from "@/app/api/ai/conversations/route";
import { DELETE as remove, GET as getOne } from "@/app/api/ai/conversations/[id]/route";
import { purgeOldConversations, saveConversation } from "@/lib/ai/assistant-conversations";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const post = (body: unknown) =>
  chat(new NextRequest("http://localhost/api/ai/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe.skipIf(!hasDatabase)("conversations de l'assistant", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(() => {
    session.userId = null;
  });

  it("enregistrée à chaque réponse (ici une réponse maison, sans Gemini), puis continuée", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    const first = await (await post({ brandId: brand.id, messages: [{ role: "user", text: "Qui es-tu ?" }], save: true, conversationId: null })).json();
    expect(first.conversationId).toEqual(expect.any(String));
    const second = await (
      await post({ brandId: brand.id, messages: [{ role: "user", text: "Qui es-tu ?" }, { role: "model", text: first.reply }, { role: "user", text: "merci merci merci merci merci" }], save: true, conversationId: first.conversationId })
    ).json();
    expect(second.conversationId).toBe(first.conversationId);
    const rows = await prisma.assistantConversation.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: user.id, brandId: brand.id, title: "Qui es-tu ?" });
    expect(rows[0].messages).toHaveLength(4);
  });

  it("sans save : rien n'est enregistré (discussion d'une fiche de publication)", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    await post({ brandId: brand.id, messages: [{ role: "user", text: "Qui es-tu ?" }] });
    expect(await prisma.assistantConversation.count()).toBe(0);
  });

  it("liste, réouverture et suppression : seulement les siennes, pour la marque demandée", async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    // b devient membre de la marque de a : il ne voit pas pour autant les conversations de a.
    await prisma.membership.create({ data: { userId: b.user.id, brandId: a.brand.id, role: "EDITOR" } });
    const mine = await saveConversation({ userId: a.user.id, brandId: a.brand.id, messages: [{ role: "user", text: "Mon idée" }, { role: "model", text: "Réponse" }] });
    await saveConversation({ userId: b.user.id, brandId: a.brand.id, messages: [{ role: "user", text: "Son idée" }, { role: "model", text: "Réponse" }] });

    session.userId = a.user.id;
    const listed = await (await list(new NextRequest(`http://localhost/api/ai/conversations?brandId=${a.brand.id}`))).json();
    expect(listed.conversations.map((c: { title: string }) => c.title)).toEqual(["Mon idée"]);
    expect((await (await getOne(new NextRequest("http://localhost/x"), { params: { id: mine! } })).json()).conversation.messages).toHaveLength(2);

    session.userId = b.user.id;
    expect((await getOne(new NextRequest("http://localhost/x"), { params: { id: mine! } })).status).toBe(404);
    expect((await remove(new NextRequest("http://localhost/x", { method: "DELETE" }), { params: { id: mine! } })).status).toBe(404);
    // Marque dont on n'est pas membre : refus.
    session.userId = a.user.id;
    expect((await list(new NextRequest(`http://localhost/api/ai/conversations?brandId=${b.brand.id}`))).status).toBeGreaterThanOrEqual(400);

    expect((await remove(new NextRequest("http://localhost/x", { method: "DELETE" }), { params: { id: mine! } })).status).toBe(200);
    expect(await prisma.assistantConversation.count({ where: { userId: a.user.id } })).toBe(0);
  });

  it("purge : effacées 90 jours après le dernier message", async () => {
    const { user, brand } = await makeBrand();
    const id = await saveConversation({ userId: user.id, brandId: brand.id, messages: [{ role: "user", text: "Vieille" }, { role: "model", text: "R" }] });
    await saveConversation({ userId: user.id, brandId: brand.id, messages: [{ role: "user", text: "Récente" }, { role: "model", text: "R" }] });
    await prisma.$executeRawUnsafe(`UPDATE "AssistantConversation" SET "updatedAt" = now() - interval '91 days' WHERE id = '${id}'`);
    expect(await purgeOldConversations()).toBe(1);
    expect((await prisma.assistantConversation.findMany()).map((c: { title: string }) => c.title)).toEqual(["Récente"]);
  });
});
