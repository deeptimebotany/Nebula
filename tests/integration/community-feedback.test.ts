import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Avis de la communauté (02/10/2026), sur une vraie base : demande de titres
// ou de miniatures, limite du Gratuit (2 par semaine), votes (jamais sur la
// sienne, résultats cachés avant de voter), avis écrits notifiés à l'auteur,
// fin à 72 h avec le résultat, suppression avec les images, modération.
const session = vi.hoisted(() => ({ userId: null as string | null, email: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId, email: session.email } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { mkdtempSync, existsSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET as list, POST as create } from "@/app/api/community/feedback/route";
import { DELETE as remove, GET as detail } from "@/app/api/community/feedback/[id]/route";
import { POST as vote } from "@/app/api/community/feedback/[id]/vote/route";
import { POST as comment } from "@/app/api/community/feedback/[id]/comments/route";
import { POST as report } from "@/app/api/community/reports/route";
import { closeDueFeedback, purgeOldFeedback } from "@/lib/community/feedback";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

// PNG 1 × 1 valide.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
let uploadDir = "";

const as = (user: { id: string; email: string }) => {
  session.userId = user.id;
  session.email = user.email;
};
// Les routes ont des paramètres différents ({ id } ou aucun).
const json = (handler: (req: NextRequest, ctx: any) => Promise<Response>, url: string, body: unknown, params: Record<string, string> = {}) =>
  handler(new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params });
function form(fields: Record<string, string | Blob>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return create(new NextRequest("http://localhost/api/community/feedback", { method: "POST", body: f }));
}
const listOf = async (scope: string) => (await (await list(new NextRequest(`http://localhost/api/community/feedback?scope=${scope}`))).json()) as { requests: { id: string; totalVotes: number | null; options: { id: string; votes: number | null }[]; myHearts: string[] }[]; quota: { used: number; limit: number } };

describe.skipIf(!hasDatabase)("avis de la communauté", () => {
  beforeAll(() => {
    uploadDir = mkdtempSync(path.join(tmpdir(), "avis-"));
    process.env.UPLOAD_DIR = uploadDir;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
  afterAll(() => rmSync(uploadDir, { recursive: true, force: true }));
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("titres : validations, création, limite du Gratuit (2 par semaine)", async () => {
    const { user } = await makeBrand();
    as(user);
    expect((await form({ kind: "TITLE", label0: "Un seul titre" })).status).toBe(400);
    expect((await form({ kind: "TITLE", label0: "Pareil", label1: "pareil" })).status).toBe(400);
    expect((await form({ kind: "AUTRE", label0: "A", label1: "B" })).status).toBe(400);
    const ok = await form({ kind: "TITLE", label0: "5 erreurs qui ruinent vos Reels", label1: "Vos Reels font un flop ? Voici pourquoi", context: "Pour une vidéo de 30 s", network: "INSTAGRAM" });
    expect(ok.status).toBe(200);
    expect((await form({ kind: "TITLE", label0: "Titre A", label1: "Titre B" })).status).toBe(200);
    const third = await form({ kind: "TITLE", label0: "Titre C", label1: "Titre D" });
    expect(third.status).toBe(429);
    expect((await third.json()).error).toMatch(/2 demandes d'avis par semaine/);
    expect((await listOf("mine")).quota).toMatchObject({ used: 2, limit: 2 });
  });

  it("miniatures : fichier envoyé, image de Nebula, image étrangère refusée ; images supprimées avec la demande", async () => {
    const { user } = await makeBrand();
    as(user);
    writeFileSync(path.join(uploadDir, "deja-la.png"), PNG);
    const foreign = await form({ kind: "THUMBNAIL", label0: "", file0: new Blob([PNG], { type: "image/png" }), label1: "", source1: "https://exemple.test/x.png" });
    expect(foreign.status).toBe(400);
    expect((await foreign.json()).error).toMatch(/ne vient pas de vos fichiers/);
    const notImage = await form({ kind: "THUMBNAIL", label0: "", file0: new Blob(["<svg/>"], { type: "image/svg+xml" }), label1: "", source1: "/uploads/deja-la.png" });
    expect(notImage.status).toBe(400);
    const res = await form({ kind: "THUMBNAIL", label0: "", file0: new Blob([PNG], { type: "image/png" }), label1: "", source1: "/uploads/deja-la.png" });
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const options = await prisma.feedbackOption.findMany({ where: { requestId: id }, orderBy: { position: "asc" } });
    expect(options).toHaveLength(2);
    const files = options.map((o) => path.join(uploadDir, path.basename(o.imageUrl as string)));
    expect(files.every((f) => existsSync(f))).toBe(true);
    // Une copie : l'image d'origine de Publier n'est pas touchée.
    expect(options[1].imageUrl).not.toBe("/uploads/deja-la.png");
    const del = await remove(new NextRequest(`http://localhost/api/community/feedback/${id}`, { method: "DELETE" }), { params: { id } });
    expect(del.status).toBe(200);
    expect(files.some((f) => existsSync(f))).toBe(false);
    expect(existsSync(path.join(uploadDir, "deja-la.png"))).toBe(true);
  });

  it("cœurs : jamais sur la sienne, résultats cachés avant le premier cœur, plusieurs cœurs, retirés d'un 2e clic", async () => {
    const author = (await makeBrand()).user;
    const voter = (await makeBrand()).user;
    const other = (await makeBrand()).user;
    as(author);
    const { id } = await (await form({ kind: "TITLE", label0: "Titre A", label1: "Titre B" })).json();
    const [a, b] = await prisma.feedbackOption.findMany({ where: { requestId: id }, orderBy: { position: "asc" } });
    expect((await json(vote, "/x", { optionId: a.id }, { id })).status).toBe(400);

    as(voter);
    const before = (await listOf("open")).requests.find((r) => r.id === id)!;
    expect(before.totalVotes).toBeNull();
    expect(before.myHearts).toEqual([]);
    expect(before.options.every((o) => o.votes === null)).toBe(true);
    const first = await (await json(vote, "/x", { optionId: a.id }, { id })).json();
    expect(first.request.totalVotes).toBe(1);
    expect(first.request.myHearts).toEqual([a.id]);
    // Un cœur de plus sur B : deux cœurs, toujours un seul votant.
    const both = await (await json(vote, "/x", { optionId: b.id }, { id })).json();
    expect(both.request.myHearts.sort()).toEqual([a.id, b.id].sort());
    expect(both.request.totalVotes).toBe(1);
    expect(both.request.options.map((o: { votes: number }) => o.votes)).toEqual([1, 1]);
    // 2e clic sur A : cœur retiré.
    const changed = await (await json(vote, "/x", { optionId: a.id }, { id })).json();
    expect(changed.request.myHearts).toEqual([b.id]);
    expect(await prisma.feedbackVote.count({ where: { requestId: id } })).toBe(1);

    as(other);
    await json(vote, "/x", { optionId: b.id }, { id });
    // L'auteur voit les totaux sans voter : cœurs par proposition, votants.
    as(author);
    const mine = (await listOf("mine")).requests[0];
    expect(mine.options.map((o) => o.votes)).toEqual([0, 2]);
    expect(mine.totalVotes).toBe(2);
  });

  it("avis écrit : notifié à l'auteur (une notification par demande) ; fin à 72 h avec le gagnant ; plus de vote ni d'avis", async () => {
    const author = (await makeBrand()).user;
    const voter = (await makeBrand()).user;
    as(author);
    const { id } = await (await form({ kind: "TITLE", label0: "Budget en couple : la méthode", label1: "On a arrêté de se disputer pour l'argent" })).json();
    const [, b] = await prisma.feedbackOption.findMany({ where: { requestId: id }, orderBy: { position: "asc" } });
    as(voter);
    await json(vote, "/x", { optionId: b.id }, { id });
    expect((await json(comment, "/x", { body: "Le B donne envie, il raconte une histoire." }, { id })).status).toBe(200);
    expect((await json(comment, "/x", { body: "Et une question dans le titre ?" }, { id })).status).toBe(200);
    const notes = await prisma.notification.findMany({ where: { userId: author.id, kind: "feedback" } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("2 avis sur votre demande");

    await prisma.feedbackRequest.update({ where: { id }, data: { closesAt: new Date(Date.now() - 1000) } });
    expect(await closeDueFeedback()).toEqual({ closed: 1 });
    expect(await closeDueFeedback()).toEqual({ closed: 0 });
    const result = await prisma.notification.findFirst({ where: { userId: author.id, dedupeKey: `feedback-result:${id}` } });
    expect(result?.body).toBe("« On a arrêté de se disputer pour l'argent » l'emporte : 1 cœur, 1 votant.");
    expect((await json(vote, "/x", { optionId: b.id }, { id })).status).toBe(409);
    expect((await json(comment, "/x", { body: "Trop tard ?" }, { id })).status).toBe(409);
    // Terminée : visible dans « Terminées », résultats pour tous.
    const third = (await makeBrand()).user;
    as(third);
    expect((await listOf("closed")).requests.find((r) => r.id === id)?.totalVotes).toBe(1);
  });

  it("modération : un autre membre ne supprime pas, signale ; purge à 30 jours", async () => {
    const author = (await makeBrand()).user;
    const stranger = (await makeBrand()).user;
    as(author);
    const { id } = await (await form({ kind: "TITLE", label0: "Titre A", label1: "Titre B" })).json();
    as(stranger);
    expect((await remove(new NextRequest(`http://localhost/x`, { method: "DELETE" }), { params: { id } })).status).toBe(403);
    expect((await json(report, "/api/community/reports", { targetType: "FEEDBACK", targetId: id, reason: "SPAM" })).status).toBe(200);
    const d = await (await detail(new NextRequest(`http://localhost/x`), { params: { id } })).json();
    expect(d.viewer.reported).toContain(`FEEDBACK:${id}`);

    await prisma.feedbackRequest.update({ where: { id }, data: { closedAt: new Date(Date.now() - 31 * 86_400_000) } });
    expect(await purgeOldFeedback()).toEqual({ purged: 1 });
    expect(await prisma.feedbackRequest.count()).toBe(0);
    expect(await prisma.communityReport.count({ where: { targetType: "FEEDBACK" } })).toBe(0);
  });
});
