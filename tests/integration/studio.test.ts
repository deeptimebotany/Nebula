import { beforeEach, describe, expect, it, vi } from "vitest";

// Studio IA (produit n°9), sur une vraie base : faits lus en base, palier
// Gratuit bloqué (402 « studio »), quota du jour compté sur l'historique
// (un échec de l'IA ne coûte rien), historique borné à 50 sans jamais effacer
// les générations du jour, publications citées gardées avec leurs chiffres,
// routes protégées par l'appartenance à la marque. L'IA est simulée.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET as getStudio, POST as postStudio } from "@/app/api/studio/route";
import { GET as getGeneration } from "@/app/api/studio/generations/[id]/route";
import { generateStudio, HISTORY_KEEP, studioDb, type LlmCall } from "@/lib/studio/generate";
import { PLAN_LIMITS } from "@/lib/plans";
import type { StudioPageDTO } from "@/lib/studio/types";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const PRO = { limits: PLAN_LIMITS.PRO };
const FREE = { limits: PLAN_LIMITS.FREE };

async function seedBrand(opts: { comp?: "PRO" | "AGENCY" } = {}) {
  const { user, brand } = await makeBrand();
  if (opts.comp) await prisma.user.update({ where: { id: user.id }, data: { compPlan: opts.comp } });
  const yt = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "YOUTUBE", externalAccountId: "yt", displayName: "Café Nebula", accessToken: "AT" } });
  const now = Date.now();
  const rows = [
    { id: "a", title: "Le cappuccino parfait", views: 9000, d: 5 },
    { id: "b", title: "Latte art", views: 1000, d: 12 },
    { id: "c", title: "Moka", views: 1200, d: 19 },
    { id: "d", title: "Cold brew", views: 800, d: 26 }
  ];
  for (const r of rows) {
    await prisma.postMetric.create({
      data: { connectionId: yt.id, network: "YOUTUBE", postExternalId: r.id, title: r.title, permalink: `https://youtu.be/${r.id}`, views: r.views, likes: 40, comments: 3, publishedAt: new Date(now - r.d * DAY) }
    });
  }
  await prisma.videoInsight.create({
    data: {
      connectionId: yt.id,
      videoId: "a",
      summary: "…",
      dropOffPoints: "[]",
      recommendations: JSON.stringify(["Accroche trop lente"]),
      retentionCurve: JSON.stringify([{ timeRatio: 0, watchRatio: 1 }, { timeRatio: 0.1, watchRatio: 0.6 }, { timeRatio: 0.4, watchRatio: 0.45 }, { timeRatio: 1, watchRatio: 0.2 }])
    }
  });
  return { user, brand, yt };
}

const ideasJson = JSON.stringify({
  ideas: [
    { title: "Le flat white expliqué", angle: "Montrer la différence avec le latte.", format: "court", network: "YOUTUBE", basedOn: 1, hooks: ["Vous faites sûrement cette erreur avec votre lait"] },
    { title: "Coulisses de la torréfaction", angle: "Suivre un grain.", format: "long", network: "TIKTOK", basedOn: 9, hooks: ["Ce grain vert va devenir votre café du matin"] }
  ]
});

const scriptJson = JSON.stringify({
  title: "Le café amer, c'est fini",
  hook: "Votre café est amer ? Ce n'est pas le grain.",
  sections: [0, 1, 2, 3].map((i) => ({ label: `Partie ${i + 1}`, content: "Explication ".repeat(12) })),
  cta: "Abonnez-vous pour la suite.",
  description: "Trois réglages pour un café moins amer.",
  hashtags: ["café", "#barista"]
});

async function insertRows(brandId: string, userId: string, n: number, at: Date) {
  for (let i = 0; i < n; i++) {
    await studioDb.create({ data: { brandId, userId, kind: "ideas", input: { network: null, theme: "" }, output: { kind: "ideas", ideas: [{ title: `Ancienne ${i}`, angle: "a", format: "court", network: null, basedOn: null, hooks: [] }] }, createdAt: new Date(at.getTime() + i * 1000) } });
  }
}

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, init?.body !== undefined ? { method: init.method ?? "POST", body: JSON.stringify(init.body), headers: { "content-type": "application/json" } } : undefined);
}

describe.skipIf(!hasDatabase)("Studio IA : génération, quota, historique, routes", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    delete process.env.GEMINI_API_KEY;
  });

  it("Gratuit : aperçu seulement, 402 « studio » sans appeler l'IA", async () => {
    const { user, brand } = await seedBrand();
    const llm = vi.fn<LlmCall>();
    const r = await generateStudio({ userId: user.id, brandId: brand.id, brandName: brand.name, kind: "ideas", input: { network: null, theme: "" }, llm, plan: FREE });
    expect(r).toMatchObject({ ok: false, status: 402, reason: "studio" });
    expect(llm).not.toHaveBeenCalled();
  });

  it("idées : faits réels envoyés à l'IA, référence vérifiée, chiffres cités gardés, quota décompté", async () => {
    const { user, brand } = await seedBrand();
    let sentPrompt = "";
    const llm: LlmCall = async (_system, prompt) => {
      sentPrompt = prompt;
      return ideasJson;
    };
    const r = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "Café Nebula", kind: "ideas", input: { network: "YOUTUBE", theme: "lait" }, llm, plan: PRO });
    if (!r.ok) throw new Error(r.error);
    expect(sentPrompt).toContain("Le cappuccino parfait");
    expect(sentPrompt).not.toContain("AT"); // aucun jeton
    expect(r.generation.output).toMatchObject({ kind: "ideas", ideas: [{ basedOn: 1, network: "YOUTUBE" }, { basedOn: null, network: null }] });
    expect(r.generation.sources).toHaveLength(1);
    expect(r.generation.sources[0]).toMatchObject({ ref: 1, title: "Le cappuccino parfait", value: 9000 });
    expect(r.quota).toMatchObject({ limit: 15, used: 1, remaining: 14 });
    expect(await studioDb.count({ where: { userId: user.id } })).toBe(1);
  });

  it("script : repères de rétention calculés d'après les vraies courbes", async () => {
    const { user, brand } = await seedBrand();
    const r = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "Café Nebula", kind: "script", input: { subject: "Le café amer", format: "long", network: "YOUTUBE" }, llm: async () => scriptJson, plan: PRO });
    if (!r.ok) throw new Error(r.error);
    if (r.generation.output.kind !== "script") throw new Error("script attendu");
    const script = r.generation.output.script;
    expect(script.hashtags).toEqual(["#café", "#barista"]);
    expect(script.sections[0].retentionNote).toContain("40 %"); // 40 % partis dans les 10 premiers %
    expect(r.generation.sources).toEqual([]);
  });

  it("échec de l'IA (panne ou réponse illisible) : rien n'est décompté", async () => {
    const { user, brand } = await seedBrand();
    const down = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => { throw new Error("Le service d'IA ne répond pas."); }, plan: PRO });
    expect(down).toMatchObject({ ok: false, status: 502 });
    expect((down as { error: string }).error).toMatch(/Rien n'a été décompté\.$/);
    const garbled = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => "Voici mes idées : …", plan: PRO });
    expect(garbled).toMatchObject({ ok: false, status: 502 });
    expect((garbled as { error: string }).error).toContain("format inattendu");
    expect(await studioDb.count({ where: { userId: user.id } })).toBe(0);
  });

  it("quota du jour : 15 en Pro, les générations d'hier ne comptent pas ; rafale bornée", { timeout: 45_000 }, async () => {
    const { user, brand } = await seedBrand();
    await insertRows(brand.id, user.id, 3, new Date(Date.now() - 2 * DAY));
    await insertRows(brand.id, user.id, 15, new Date(Date.now() - 60_000));
    const r = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => ideasJson, plan: PRO });
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect((r as { error: string }).error).toContain("vos 15 générations du jour");
    const agency = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => ideasJson, plan: { limits: PLAN_LIMITS.AGENCY } });
    expect(agency).toMatchObject({ ok: true, quota: { limit: 40, used: 16, remaining: 24 } });

    // Rafale : 8 essais en 10 minutes au plus, même ratés. La fenêtre est un
    // créneau fixe de 10 min : on évite de chevaucher sa fin (test instable sinon).
    const left = 600_000 - (Date.now() % 600_000);
    if (left < 8_000) await new Promise((r) => setTimeout(r, left + 250));
    const other = await seedBrand();
    const fail: LlmCall = async () => "illisible";
    for (let i = 0; i < 8; i++) {
      expect(await generateStudio({ userId: other.user.id, brandId: other.brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: fail, plan: PRO })).toMatchObject({ status: 502 });
    }
    const burst = await generateStudio({ userId: other.user.id, brandId: other.brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: fail, plan: PRO });
    expect(burst).toMatchObject({ ok: false, status: 429 });
    expect((burst as { error: string }).error).toContain("Beaucoup de demandes");
  });

  it("historique : 50 par marque, les plus anciennes effacées, jamais celles du jour", async () => {
    const { user, brand } = await seedBrand();
    await insertRows(brand.id, user.id, 55, new Date(Date.now() - 3 * DAY));
    const r = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => ideasJson, plan: PRO });
    expect(r.ok).toBe(true);
    expect(await studioDb.count({ where: { brandId: brand.id } })).toBe(HISTORY_KEEP);
    expect(await studioDb.count({ where: { brandId: brand.id, output: { path: ["ideas", "0", "title"], equals: "Ancienne 0" } } })).toBe(0);

    // Plusieurs membres sur une marque : les lignes du jour restent (le quota se compte dessus).
    const teammate = await prisma.user.create({ data: { email: `equipe-${Date.now()}@test.fr`, name: "Équipe" } });
    await prisma.membership.create({ data: { userId: teammate.id, brandId: brand.id, role: "MEMBER" } });
    await insertRows(brand.id, teammate.id, 55, new Date(Date.now() - 120_000));
    const again = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => ideasJson, plan: PRO });
    expect(again).toMatchObject({ ok: true, quota: { used: 2 } });
    expect(await studioDb.count({ where: { userId: teammate.id } })).toBe(55);
    expect(await studioDb.count({ where: { brandId: brand.id, createdAt: { lt: new Date(Date.now() - 2 * DAY) } } })).toBe(0);
  });

  it("routes : faits visibles en Gratuit, génération refusée (402), membres seulement, résultat relu gratuitement", async () => {
    const { user, brand } = await seedBrand();
    const outsider = await seedBrand();

    session.userId = null;
    expect((await getStudio(req(`/api/studio?brandId=${brand.id}`))).status).toBe(401);

    session.userId = outsider.user.id;
    expect((await getStudio(req(`/api/studio?brandId=${brand.id}`))).status).toBe(404);

    session.userId = user.id;
    const page = (await (await getStudio(req(`/api/studio?brandId=${brand.id}`))).json()) as StudioPageDTO;
    expect(page.facts.topPosts[0]).toMatchObject({ title: "Le cappuccino parfait" });
    expect(page.quota).toMatchObject({ limit: 0, aiConfigured: false });
    expect(page.history).toEqual([]);

    const free = await postStudio(req("/api/studio", { body: { brandId: brand.id, kind: "ideas", input: { network: "YOUTUBE", theme: "" } } }));
    expect(free.status).toBe(402);
    expect(await free.json()).toMatchObject({ reason: "studio" });

    const bad = await postStudio(req("/api/studio", { body: { brandId: brand.id, kind: "script", input: { subject: "a", format: "court" } } }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "Décrivez le sujet de la vidéo en quelques mots." });

    // Pro, sans clé Gemini : 503 explicite, rien n'est décompté.
    await prisma.user.update({ where: { id: user.id }, data: { compPlan: "PRO" } });
    const noKey = await postStudio(req("/api/studio", { body: { brandId: brand.id, kind: "ideas", input: { network: null, theme: "" } } }));
    expect(noKey.status).toBe(503);

    const made = await generateStudio({ userId: user.id, brandId: brand.id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => ideasJson, plan: PRO });
    if (!made.ok) throw new Error(made.error);
    const one = await getGeneration(req(`/api/studio/generations/${made.generation.id}?brandId=${brand.id}`), { params: { id: made.generation.id } });
    expect(one.status).toBe(200);
    expect(((await one.json()) as { generation: { id: string } }).generation.id).toBe(made.generation.id);

    session.userId = outsider.user.id;
    const leak = await getGeneration(req(`/api/studio/generations/${made.generation.id}?brandId=${outsider.brand.id}`), { params: { id: made.generation.id } });
    expect(leak.status).toBe(404);

    session.userId = user.id;
    const after = (await (await getStudio(req(`/api/studio?brandId=${brand.id}`))).json()) as StudioPageDTO;
    expect(after.quota).toMatchObject({ limit: 15, used: 1, remaining: 14 });
    expect(after.history).toEqual([{ id: made.generation.id, kind: "ideas", createdAt: made.generation.createdAt, title: "Le flat white expliqué (+1)" }]);
  });

  it("suppression d'une marque ou d'un compte : l'historique part avec", async () => {
    const { user, brand } = await seedBrand();
    await insertRows(brand.id, user.id, 2, new Date());
    await prisma.brand.delete({ where: { id: brand.id } });
    expect(await studioDb.count({ where: { userId: user.id } })).toBe(0);
  });
});
