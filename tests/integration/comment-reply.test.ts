import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Répondre à un commentaire depuis Nebula (01/10/2026), sur une vraie base :
// la page reçoit ce que chaque compte permet ; la réponse part sur le réseau
// et marque le commentaire « Vous avez répondu » ; un lecteur, une autre
// marque, un compte en veille ou une réponse trop longue ne partent jamais.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const ai = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/lib/ai/gemini", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/gemini")>()),
  isAiEnabled: () => true,
  generateCommentReply: vi.fn(async (input: unknown) => {
    ai.calls.push(input);
    return "Merci beaucoup pour ton message !";
  })
}));
vi.mock("@/lib/ai/guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/guard")>()),
  gateAppAi: vi.fn(async () => ({ ok: true, allowance: { run: (fn: () => unknown) => fn() }, info: {} }))
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { API_VERSIONS } from "@/lib/social/versions";
import { POST as reply } from "@/app/api/engagement/[id]/reply/route";
import { GET as list } from "@/app/api/engagement/route";
import { POST as suggest } from "@/app/api/ai/comment-reply/route";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const G = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;

const post = (handler: typeof reply, id: string, body: unknown) =>
  handler(new NextRequest(`http://localhost/api/engagement/${id}/reply`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: { id } });

async function setup() {
  const { user, brand } = await makeBrand();
  session.userId = user.id;
  const conn = (network: string, scopes = "", extra: Record<string, unknown> = {}) =>
    prisma.socialConnection.create({
      data: { brandId: brand.id, network, externalAccountId: `${network}-acc`, displayName: `Compte ${network}`, accessToken: `tok-${network}`, scopes, ...extra }
    });
  const ig = await conn("INSTAGRAM", "instagram_basic,instagram_manage_comments");
  const yt = await conn("YOUTUBE", "youtube.upload,youtube.readonly");
  const comment = (connectionId: string, network: string, externalId: string) =>
    prisma.engagementItem.create({
      data: { connectionId, network, externalId, postExternalId: "POST-1", authorName: "fan", text: "Trop beau ce menu !", permalink: "https://www.instagram.com/p/ABC/", publishedAt: new Date() }
    });
  return { user, brand, ig, yt, igComment: await comment(ig.id, "INSTAGRAM", "1785800001"), ytComment: await comment(yt.id, "YOUTUBE", "UgzTOP") };
}

describe.skipIf(!hasDatabase)("Répondre aux commentaires depuis Nebula", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    ai.calls.length = 0;
    delete process.env.YOUTUBE_COMMENT_REPLY;
    process.env.META_APP_SECRET = "app-secret";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("la page reçoit ce que chaque compte permet, sans ses permissions", async () => {
    const s = await setup();
    const res = await list(new NextRequest(`http://localhost/api/engagement?brandId=${s.brand.id}`));
    const { connections } = (await res.json()) as { connections: { network: string; reply: { mode: string; maxLength?: number }; scopes?: string }[] };
    expect(connections.find((c) => c.network === "INSTAGRAM")?.reply).toEqual({ mode: "api", maxLength: 2200 });
    expect(connections.find((c) => c.network === "YOUTUBE")?.reply).toMatchObject({ mode: "manual" });
    for (const c of connections) expect(c).not.toHaveProperty("scopes");
  });

  it("TikTok (pas de commentaires par l'API) : compte signalé, anciennes lignes jamais renvoyées (03/10/2026)", async () => {
    const s = await setup();
    const tt = await prisma.socialConnection.create({
      data: { brandId: s.brand.id, network: "TIKTOK", externalAccountId: "TIKTOK-acc", displayName: "Compte TIKTOK", accessToken: "tok-TIKTOK" }
    });
    await prisma.engagementItem.create({
      data: { connectionId: tt.id, network: "TIKTOK", externalId: "TT-1", postExternalId: "POST-TT", authorName: "fan", text: "ancien", publishedAt: new Date() }
    });
    const body = (await (await list(new NextRequest(`http://localhost/api/engagement?brandId=${s.brand.id}`))).json()) as {
      connections: { id: string; supportsEngagement: boolean }[];
      items: { connectionId: string }[];
    };
    expect(body.connections.find((c) => c.id === tt.id)?.supportsEngagement).toBe(false);
    expect(body.items.map((i) => i.connectionId).sort()).toEqual([s.ig.id, s.yt.id].sort());
    const one = (await (await list(new NextRequest(`http://localhost/api/engagement?connectionId=${tt.id}`))).json()) as { items: unknown[] };
    expect(one.items).toEqual([]);
  });

  it("réponse envoyée : sur Instagram, commentaire lu et « Vous avez répondu »", async () => {
    const s = await setup();
    const net = installNetwork([{ method: "POST", url: `${G}/1785800001/replies`, body: { id: "1787000009" } }]);
    const res = await post(reply, s.igComment.id, { text: "  Merci beaucoup ! 🙏 " });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, externalId: "1787000009" });
    expect(net.sent[0].form?.get("message")).toBe("Merci beaucoup ! 🙏");
    expect(net.sent[0].form?.get("access_token")).toBe("tok-INSTAGRAM");
    const after = await prisma.engagementItem.findUnique({ where: { id: s.igComment.id } });
    expect(after?.read).toBe(true);
    expect(after?.ownerRepliedAt).toBeInstanceOf(Date);
  });

  it("refus du réseau : message clair, rien de marqué", async () => {
    const s = await setup();
    installNetwork([{ method: "POST", url: `${G}/1785800001/replies`, status: 400, body: { error: { message: "Unsupported post request. Object with ID '1785800001' does not exist", code: 100, error_subcode: 33 } } }]);
    const res = await post(reply, s.igComment.id, { text: "Merci !" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/n'existe plus sur Instagram/);
    expect((await prisma.engagementItem.findUnique({ where: { id: s.igComment.id } }))?.ownerRepliedAt).toBeNull();
  });

  it("YouTube sans autorisation, texte vide ou trop long : aucun appel réseau", async () => {
    const s = await setup();
    const net = installNetwork([]);
    expect((await post(reply, s.ytComment.id, { text: "Merci" })).status).toBe(400);
    expect((await post(reply, s.igComment.id, { text: "   " })).status).toBe(400);
    const long = await post(reply, s.igComment.id, { text: "a".repeat(2201) });
    expect(long.status).toBe(400);
    expect((await long.json()).error).toMatch(/2200 caractères/);
    expect(net.sent).toHaveLength(0);
  });

  it("lecteur de la marque, autre marque, compte en veille : refusés sans appel réseau", async () => {
    const s = await setup();
    const net = installNetwork([]);
    await prisma.membership.updateMany({ where: { userId: s.user.id, brandId: s.brand.id }, data: { role: "VIEWER" } });
    expect((await post(reply, s.igComment.id, { text: "Merci" })).status).toBe(403);
    await prisma.membership.updateMany({ where: { userId: s.user.id, brandId: s.brand.id }, data: { role: "OWNER" } });

    const intruder = await makeBrand();
    session.userId = intruder.user.id;
    expect((await post(reply, s.igComment.id, { text: "Merci" })).status).toBe(404);

    session.userId = s.user.id;
    await prisma.socialConnection.update({ where: { id: s.ig.id }, data: { dormantAt: new Date() } });
    expect((await post(reply, s.igComment.id, { text: "Merci" })).status).toBe(402);
    expect(net.sent).toHaveLength(0);
  });

  it("proposition de l'IA : le commentaire est passé comme donnée ; autre marque refusée", async () => {
    const s = await setup();
    const call = (id: string) =>
      suggest(new NextRequest("http://localhost/api/ai/comment-reply", { method: "POST", body: JSON.stringify({ engagementId: id, tone: "sober" }), headers: { "content-type": "application/json" } }));
    const res = await call(s.igComment.id);
    expect(await res.json()).toEqual({ reply: "Merci beaucoup pour ton message !" });
    expect(ai.calls[0]).toMatchObject({ network: "Instagram", comment: "Trop beau ce menu !", maxLength: 2200, tone: "sober" });
    const intruder = await makeBrand();
    session.userId = intruder.user.id;
    expect((await call(s.igComment.id)).status).toBe(404);
  });
});
