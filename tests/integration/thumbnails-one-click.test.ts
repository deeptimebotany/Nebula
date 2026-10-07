import { beforeEach, describe, expect, it, vi } from "vitest";

// Miniatures « en un clic » (07/10/2026), sur une vraie base : l'analyse de
// la vidéo ne décompte rien (elle vérifie seulement qu'il reste des
// miniatures), chaque miniature créée ensuite compte pour une (3 par clic,
// choix de Lucas), un compte presque au bout de son quota n'en crée que ce
// qu'il lui reste, et les refus arrivent AVANT tout appel à Google.
// Réponses de Google simulées (aucun appel réseau).
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: () => undefined }), headers: () => new Headers() }));

const ANALYSIS = {
  summary: "Recette de tarte aux pommes en 3 étapes, avec la dégustation à la fin.",
  audience: "Débutants en pâtisserie",
  promise: "Réussir une tarte croustillante du premier coup",
  concepts: [
    { second: 42.5, moment: "La tarte sort du four", angle: "Résultat", hook: "CROUSTILLANTE", imagePrompt: "Rapprocher la tarte, lumière chaude.", why: ["Le résultat final arrête le défilement.", "Promesse claire."] },
    { second: 12, moment: "La pâte se déchire", angle: "Contraste", hook: "L'ERREUR", imagePrompt: "Gros plan sur la pâte déchirée.", why: ["L'erreur intrigue."] },
    { second: 88, moment: "Première bouchée", angle: "Émotion", hook: "", imagePrompt: "Visage en gros plan, fond flouté.", why: ["Le visage crée l'identification."] }
  ],
  durationSeconds: 95,
  truncated: false
};

const ai = vi.hoisted(() => ({
  analyze: vi.fn(),
  thumb: vi.fn(async () => ({ base64: "aGVsbG8=", mimeType: "image/png" }))
}));
vi.mock("@/lib/ai/thumbnail-analysis", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/thumbnail-analysis")>()), analyzeVideoForThumbnails: ai.analyze }));
vi.mock("@/lib/ai/gemini", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/gemini")>()), isAiEnabled: () => true, generateThumbnail: ai.thumb }));
vi.mock("@/lib/storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage")>()),
  saveUploadedFile: vi.fn(async () => ({ url: `https://blob.test/ia-${Math.random().toString(36).slice(2)}.png`, filename: "ia.png", mimeType: "image/png", sizeBytes: 5 }))
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST as postAnalyzeVideo } from "@/app/api/media/[id]/thumbnails/analyze/route";
import { POST as postAiThumbnail } from "@/app/api/media/[id]/thumbnails/ai/route";
import { accountCounterKey, parisMonth, reserveMonthly } from "@/lib/ai/counters";
import { recordAiUsage } from "@/lib/ai/usage";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

function req(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
const imagesUsed = async () => (await prisma.aiMonthlyUsage.findFirst({ where: { kind: "image", period: parisMonth() } }))?.count ?? 0;

async function proVideo(plan: "PRO" | "AGENCY" | null = "PRO", type: "VIDEO" | "IMAGE" = "VIDEO") {
  const { user, brand } = await makeBrand();
  await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), ...(plan ? { compPlan: plan } : {}) } });
  const media = await prisma.mediaAsset.create({
    data: { brandId: brand.id, url: "https://x.test/tarte.mp4", filename: "tarte.mp4", mimeType: type === "VIDEO" ? "video/mp4" : "image/png", type, sizeBytes: 1_000, width: 1920, height: 1080 }
  });
  session.userId = user.id;
  return { user, brand, media };
}
const analyze = (id: string, body: unknown = { title: "Tarte aux pommes", networks: ["YOUTUBE"] }) => postAnalyzeVideo(req(`/api/media/${id}/thumbnails/analyze`, body), { params: { id } });
const create = (id: string, hook: string) =>
  postAiThumbnail(req(`/api/media/${id}/thumbnails/ai`, { frameBase64: "a".repeat(200), frameMimeType: "image/jpeg", title: "Tarte", aspect: "16:9", brief: { hook, imagePrompt: "Rapprocher." } }), { params: { id } });

describe.skipIf(!hasDatabase)("miniatures en un clic : analyse de la vidéo, puis 3 miniatures", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    ai.analyze.mockReset();
    ai.analyze.mockImplementation(async () => {
      // Jetons d'une vraie analyse : comptés dans le coût des miniatures, sans action.
      await recordAiUsage({ model: "gemini-3.8-flash", inputTokens: 9_800, videoTokens: 9_500, outputTokens: 1_400, images: 0, imageModel: false });
      return ANALYSIS;
    });
    ai.thumb.mockClear();
  });

  it("Pro : l'analyse ne décompte rien ; les 3 miniatures créées ensuite comptent 3", async () => {
    const { media } = await proVideo();
    const res = await analyze(media.id);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ summary: ANALYSIS.summary, imagesAllowed: 3 });
    expect(data.concepts).toHaveLength(3);
    expect(await imagesUsed()).toBe(0);
    // Ce que la route transmet : la vidéo et ce que Publier sait d'elle.
    const [source, input] = ai.analyze.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(source).toMatchObject({ url: "https://x.test/tarte.mp4", mimeType: "video/mp4" });
    expect(input).toMatchObject({ title: "Tarte aux pommes", networks: ["YOUTUBE"], orientation: "horizontal" });
    // Coût de l'analyse rangé avec les miniatures (/admin/ia).
    expect(await prisma.aiUsageDaily.findFirst({ where: { kind: "image", model: "gemini-3.8-flash" } })).toMatchObject({ calls: 1, inputTokens: 9_800 });

    for (const c of ANALYSIS.concepts) expect((await create(media.id, c.hook)).status).toBe(200);
    expect(ai.thumb).toHaveBeenCalledTimes(3);
    expect((ai.thumb.mock.calls[0] as unknown[])[0]).toMatchObject({ aspect: "16:9", brief: { hook: "CROUSTILLANTE" } });
    expect(await imagesUsed()).toBe(3);
  });

  it("presque au bout du quota (19 sur 20) : une seule miniature possible, annoncée par l'analyse", async () => {
    const { user, media } = await proVideo();
    await reserveMonthly(accountCounterKey(user.id), parisMonth(), "image", 20, 19);
    const data = await (await analyze(media.id)).json();
    expect(data.imagesAllowed).toBe(1);
    expect(await imagesUsed()).toBe(19);
  });

  it("quota épuisé : refus 429 avant tout envoi de la vidéo à Google", async () => {
    const { user, media } = await proVideo();
    await reserveMonthly(accountCounterKey(user.id), parisMonth(), "image", 20, 20);
    const res = await analyze(media.id);
    expect(res.status).toBe(429);
    expect((await res.json()).reason).toBe("ai_monthly_limit");
    expect(ai.analyze).not.toHaveBeenCalled();
  });

  it("Gratuit : 402, rien n'est envoyé à Google", async () => {
    const { media } = await proVideo(null);
    expect((await analyze(media.id)).status).toBe(402);
    expect(ai.analyze).not.toHaveBeenCalled();
  });

  it("vidéo verticale : orientation transmise ; durée lue par le navigateur si la base ne l'a pas", async () => {
    const { media } = await proVideo();
    await prisma.mediaAsset.update({ where: { id: media.id }, data: { width: null, height: null } });
    await analyze(media.id, { width: 1080, height: 1920, durationSeconds: 61.4 });
    expect(ai.analyze.mock.calls[0][1]).toMatchObject({ orientation: "vertical", durationSeconds: 61.4 });
  });

  it("image, média d'un autre compte ou sans session : refusés", async () => {
    const { media: image } = await proVideo("PRO", "IMAGE");
    expect((await analyze(image.id)).status).toBe(400);
    const { media: other } = await proVideo();
    const { user: stranger } = await makeBrand();
    session.userId = stranger.id;
    expect((await analyze(other.id)).status).toBe(404);
    session.userId = null;
    expect((await analyze(other.id)).status).toBe(401);
    expect(ai.analyze).not.toHaveBeenCalled();
  });

  it("analyse impossible : message clair (502), rien n'est décompté", async () => {
    const { media } = await proVideo();
    ai.analyze.mockImplementation(async () => {
      throw new Error("Google n'a pas pu lire cette vidéo (format non pris en charge ?). Essayez avec un fichier MP4.");
    });
    const res = await analyze(media.id);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/format non pris en charge/);
    expect(await imagesUsed()).toBe(0);
  });

  it("rafale : 10 analyses par heure et par compte, la 11e attend (rien décompté)", async () => {
    const { media } = await proVideo("AGENCY");
    for (let i = 0; i < 10; i++) expect((await analyze(media.id)).status).toBe(200);
    const res = await analyze(media.id);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/beaucoup d'analyses/);
    expect(ai.analyze).toHaveBeenCalledTimes(10);
    expect(await imagesUsed()).toBe(0);
  });
});
