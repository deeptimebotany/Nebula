import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Brief « Essai 14 jours » (29/09/2026), sur une vraie base : palier Essai,
// porte unique de l'IA (adresse confirmée, quotas par compte, budget
// global), anti-abus de l'essai, fin d'essai propre et réactivation.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// L'inscription lit les cookies d'attribution : hors requête Next, rien.
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: () => undefined }), headers: () => new Headers() }));
// Pas d'e-mail envoyé dans les tests.
vi.mock("@/lib/account-security", async (orig) => ({ ...(await orig<typeof import("@/lib/account-security")>()), sendVerificationEmail: vi.fn(async () => undefined) }));
// Pas d'appel à Google : réponses fixes, comptées.
const gemini = vi.hoisted(() => ({ copy: vi.fn(async () => "Un titre"), thumb: vi.fn(async () => ({ base64: "aGVsbG8=", mimeType: "image/png" })) }));
vi.mock("@/lib/ai/gemini", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/gemini")>()),
  isAiEnabled: () => true,
  generateCopy: gemini.copy,
  generateThumbnail: gemini.thumb
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST as postGenerateCopy } from "@/app/api/ai/generate-copy/route";
import { POST as postRegister } from "@/app/api/auth/register/route";
import { DELETE as deleteAccount } from "@/app/api/settings/account/route";
import { POST as postAnalyticsSync } from "@/app/api/analytics/sync/route";
import { POST as postActiveBrand } from "@/app/api/billing/active-brand/route";
import { aiPeriodFor, assertAiAllowed, BUDGET_KEY } from "@/lib/ai/guard";
import { recordAiUsage } from "@/lib/ai/usage";
import { accountCounterKey, parisDay, reserveMonthly } from "@/lib/ai/counters";
import { getUserPlan } from "@/lib/billing/plan";
import { generateStudio } from "@/lib/studio/generate";
import { applyTrialExpirations } from "@/lib/billing/trial-expiry";
import { countReschedulable, reactivateAfterUpgrade, rescheduleDormantPosts } from "@/lib/billing/free-limits";
import { createPost } from "@/lib/posts/create-post";
import { PLAN_LIMITS } from "@/lib/plans";
import { hasDatabase, resetDatabase } from "./helpers";

const DAY = 86_400_000;
let seq = 0;

function req(url: string, body?: unknown, method = "POST", ip = "198.51.100.10") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip }
  });
}

async function makeUser(opts: { trialDays?: number | null; verified?: boolean; brands?: number } = {}) {
  seq++;
  const user = await prisma.user.create({
    data: {
      email: `essai${seq}-${Date.now()}@test.fr`,
      name: "Essai",
      passwordHash: "x",
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      ageConfirmedAt: new Date(),
      trialEndsAt: opts.trialDays === null ? null : new Date(Date.now() + (opts.trialDays ?? 10) * DAY)
    }
  });
  const brands = [];
  for (let i = 0; i < (opts.brands ?? 1); i++) {
    const brand = await prisma.brand.create({ data: { name: `Marque ${i + 1}`, slug: `essai-${seq}-${i}-${Date.now()}`, createdAt: new Date(Date.now() - (30 - i) * DAY) } });
    await prisma.membership.create({ data: { userId: user.id, brandId: brand.id, role: "OWNER" } });
    brands.push(brand);
  }
  return { user, brands };
}

async function connect(brandId: string, network: string) {
  return prisma.socialConnection.create({ data: { brandId, network, externalAccountId: `${network}-${Math.random()}`, displayName: network, accessToken: "tok" } });
}

async function post(brandId: string, userId: string, connectionId: string, inDays: number, status = "SCHEDULED") {
  return prisma.post.create({
    data: {
      brandId,
      createdById: userId,
      caption: "Bonjour",
      status,
      scheduledAt: new Date(Date.now() + inDays * DAY),
      targets: { create: { connectionId, network: "YOUTUBE", status: status === "SCHEDULED" ? "SCHEDULED" : "PENDING" } }
    }
  });
}

describe.skipIf(!hasDatabase)("palier Essai et porte de l'IA (lots E1, E2)", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    gemini.copy.mockClear();
    gemini.thumb.mockClear();
    process.env.NEXTAUTH_SECRET = "secret-de-test-assez-long-pour-hkdf-0123456789";
  });
  afterEach(() => {
    delete process.env.TRIAL_AI_DAILY_TEXT_CALLS;
  });

  it("compte en essai : palier TRIAL ; sans adresse confirmée, IA refusée (403) sans appel à Gemini", async () => {
    const { user, brands } = await makeUser({ verified: false });
    expect((await getUserPlan(user.id)).plan).toBe("TRIAL");
    session.userId = user.id;
    const res = await postGenerateCopy(req("/api/ai/generate-copy", { brandId: brands[0].id, field: "title" }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("email_unverified");
    expect(gemini.copy).not.toHaveBeenCalled();
    // Rien de réservé.
    expect(await prisma.publicToolUsage.count({ where: { tool: { startsWith: "ai-" } } })).toBe(0);
  });

  it("quotas de l'essai comptés sur toutes les marques du compte : 20 textes par jour ; 5 miniatures et 15 Studio sur tout l'essai", async () => {
    const { user, brands } = await makeUser({ brands: 2 });
    session.userId = user.id;
    for (let i = 0; i < 20; i++) {
      const res = await postGenerateCopy(req("/api/ai/generate-copy", { brandId: brands[i % 2].id, field: "title" }));
      expect(res.status).toBe(200);
    }
    const refused = await postGenerateCopy(req("/api/ai/generate-copy", { brandId: brands[1].id, field: "title" }));
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.reason).toBe("trial_ai_limit");
    expect(body.error).toMatch(/^Limite de générations de texte atteinte pour aujourd'hui.*En Pro, vous en avez beaucoup plus/);
    expect(body.error).not.toMatch(/\b(20|60)\b/);
    expect(gemini.copy).toHaveBeenCalledTimes(20);

    // Miniatures IA (06/10/2026 : l'outil public est retiré, la règle est vérifiée sur la porte de l'IA).
    const trialPlan = await getUserPlan(user.id);
    for (let i = 0; i < 5; i++) {
      const gate = await assertAiAllowed({ userId: user.id, plan: trialPlan, kind: "image" });
      if (!gate.ok) throw new Error(gate.error);
      await gate.run(async () => "ok");
    }
    const sixthImage = await assertAiAllowed({ userId: user.id, plan: trialPlan, kind: "image" });
    expect(sixthImage).toMatchObject({ ok: false, status: 429, reason: "trial_ai_limit", error: expect.stringMatching(/^Limite de miniatures de l'essai atteinte\. En Pro, vous en avez beaucoup plus chaque mois\.$/) });
    // Compté sur la période de l'essai (clé « essai:<dernier jour> »), pas le mois.
    const monthly = await prisma.aiMonthlyUsage.findMany();
    expect(monthly.map((m) => [m.period.startsWith("essai:"), m.kind, m.count])).toEqual([[true, "image", 5]]);

    const info = await getUserPlan(user.id);
    const ideas = JSON.stringify({ ideas: [{ title: "Le flat white expliqué", angle: "Montrer la différence avec le latte.", format: "court", network: "YOUTUBE", basedOn: null, hooks: ["Vous faites sûrement cette erreur avec votre lait"] }] });
    // 10 générations déjà faites pendant l'essai (la rafale du Studio borne à 8 par 10 min), puis 5 vraies.
    await reserveMonthly(accountCounterKey(user.id), aiPeriodFor(info).key, "studio", 15, 10);
    for (let i = 0; i < 5; i++) {
      const r = await generateStudio({ userId: user.id, brandId: brands[i % 2].id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => ideas, plan: info });
      expect(r.ok).toBe(true);
    }
    const sixteenth = await generateStudio({ userId: user.id, brandId: brands[0].id, brandName: "B", kind: "ideas", input: { network: null, theme: "" }, llm: async () => ideas, plan: info });
    expect(sixteenth).toMatchObject({ ok: false, status: 429, reason: "trial_ai_limit" });
    expect((sixteenth as { error: string }).error).toMatch(/^Limite de générations du Studio de l'essai atteinte\. En Pro, vous en avez beaucoup plus chaque mois\./);
  });

  it("budget global atteint : 429 trial_ai_busy pour l'essai ; un compte Pro passe sans être compté", async () => {
    process.env.TRIAL_AI_DAILY_TEXT_CALLS = "2";
    const trial = await makeUser();
    const pro = await makeUser({ trialDays: null });
    await prisma.subscription.create({ data: { userId: pro.user.id, plan: "PRO", status: "ACTIVE", maxBrands: 3 } });
    session.userId = trial.user.id;
    expect((await postGenerateCopy(req("/api/ai/generate-copy", { brandId: trial.brands[0].id, field: "title" }))).status).toBe(200);
    expect((await postGenerateCopy(req("/api/ai/generate-copy", { brandId: trial.brands[0].id, field: "title" }))).status).toBe(200);
    const busy = await postGenerateCopy(req("/api/ai/generate-copy", { brandId: trial.brands[0].id, field: "title" }));
    expect(busy.status).toBe(429);
    expect(await busy.json()).toMatchObject({ reason: "trial_ai_busy", error: "L'IA de l'essai a atteint sa limite du jour. Elle revient à minuit. En Pro, elle reste disponible." });
    // Une alerte au propriétaire, une seule fois par jour (dédoublonnée) : pas de compte propriétaire ici, rien ne casse.
    session.userId = pro.user.id;
    expect((await postGenerateCopy(req("/api/ai/generate-copy", { brandId: pro.brands[0].id, field: "title" }))).status).toBe(200);
    const budget = await prisma.publicToolUsage.findFirst({ where: { ipHash: BUDGET_KEY, tool: "budget:trial:text", day: parisDay() } });
    expect(budget?.count).toBe(2);
    expect(await prisma.publicToolUsage.count({ where: { tool: { startsWith: "budget:free" } } })).toBe(0);
  });

  it("réservation rendue si l'appel échoue sans réponse facturée ; budget gardé si Google a répondu", async () => {
    const { user } = await makeUser();
    const info = await getUserPlan(user.id);
    const day = parisDay();
    const gate = await assertAiAllowed({ userId: user.id, plan: info, kind: "text" });
    if (!gate.ok) throw new Error("refusé");
    await expect(gate.run(async () => { throw new Error("réseau"); })).rejects.toThrow("réseau");
    expect((await prisma.publicToolUsage.findFirst({ where: { ipHash: BUDGET_KEY, day, tool: "budget:trial:text" } }))?.count).toBe(0);
    expect((await prisma.publicToolUsage.findFirst({ where: { tool: "ai-text", day } }))?.count).toBe(0);

    const billed = await assertAiAllowed({ userId: user.id, plan: info, kind: "text" });
    if (!billed.ok) throw new Error("refusé");
    await expect(
      billed.run(async () => {
        await recordAiUsage({ model: "gemini-3.8-flash", inputTokens: 100, outputTokens: 20, images: 0, imageModel: false });
        throw new Error("réponse illisible");
      })
    ).rejects.toThrow();
    // Le compte n'est pas décompté ; le budget global garde ce que Google a facturé.
    expect((await prisma.publicToolUsage.findFirst({ where: { tool: "ai-text", day } }))?.count).toBe(0);
    expect((await prisma.publicToolUsage.findFirst({ where: { ipHash: BUDGET_KEY, day, tool: "budget:trial:text" } }))?.count).toBe(1);
    const usage = await prisma.aiUsageDaily.findFirst({ where: { day, plan: "TRIAL", kind: "text" } });
    expect(usage).toMatchObject({ calls: 1, inputTokens: 100, outputTokens: 20, model: "gemini-3.8-flash", actions: 0 });
  });
});

describe.skipIf(!hasDatabase)("anti-abus de l'essai (lot E3)", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    process.env.NEXTAUTH_SECRET = "secret-de-test-assez-long-pour-hkdf-0123456789";
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  const signup = (email: string, ip: string) =>
    postRegister(req("/api/auth/register", { name: "Alex Martin", email, password: "MotDePasse-Test-1", acceptTerms: true, isAdult: true }, "POST", ip) as unknown as Request);

  it("même adresse canonique, ou compte supprimé puis recréé : pas d'essai, compte créé en Gratuit", async () => {
    expect((await signup("Alex.Martin+pro@gmail.com", "192.0.2.1")).status).toBe(200);
    const first = await prisma.user.findUniqueOrThrow({ where: { email: "alex.martin+pro@gmail.com" } });
    expect(first.trialEndsAt).not.toBeNull();

    const res = await signup("alexmartin@googlemail.com", "192.0.2.2");
    expect(res.status).toBe(200);
    expect((await res.json()).trialDays).toBe(0);
    const second = await prisma.user.findUniqueOrThrow({ where: { email: "alexmartin@googlemail.com" } });
    expect(second).toMatchObject({ trialEndsAt: null, trialDeniedReason: "email_used" });
    expect((await getUserPlan(second.id)).plan).toBe("FREE");

    // Suppression puis recréation du premier compte : toujours pas d'essai.
    session.userId = first.id;
    expect((await deleteAccount(req("/api/settings/account", { password: "MotDePasse-Test-1" }, "DELETE"))).status).toBe(200);
    session.userId = null;
    expect((await signup("alex.martin+pro@gmail.com", "192.0.2.3")).status).toBe(200);
    const again = await prisma.user.findUniqueOrThrow({ where: { email: "alex.martin+pro@gmail.com" } });
    expect(again.trialEndsAt).toBeNull();
    expect(again.trialDeniedReason).toBe("email_used");
    // Le registre ne garde que des empreintes.
    const grants = await prisma.trialGrant.findMany();
    expect(grants.length).toBe(1);
    expect(JSON.stringify(grants)).not.toMatch(/alex|gmail/i);
  });

  it("troisième inscription depuis la même adresse IP en 30 jours : pas d'essai ; adresse jetable : pas d'essai", async () => {
    for (const n of [1, 2]) {
      expect((await signup(`personne${n}@exemple.fr`, "203.0.113.50")).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { email: `personne${n}@exemple.fr` } })).trialEndsAt).not.toBeNull();
    }
    expect((await signup("personne3@exemple.fr", "203.0.113.50")).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { email: "personne3@exemple.fr" } })).toMatchObject({ trialEndsAt: null, trialDeniedReason: "ip_limit" });

    expect((await signup("jetable@yopmail.com", "203.0.113.99")).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { email: "jetable@yopmail.com" } })).toMatchObject({ trialEndsAt: null, trialDeniedReason: "disposable" });
    // Le cron d'essai offert aux anciens comptes ne les rattrape jamais.
    const { grantTrialToLegacyAccounts } = await import("@/lib/billing/trial-expiry");
    await grantTrialToLegacyAccounts();
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "jetable@yopmail.com" } })).trialEndsAt).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("fin d'essai propre et réactivation (lot E4)", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  async function setup() {
    const { user, brands } = await makeUser({ brands: 3 });
    const [a, b, c] = brands;
    const ca = await connect(a.id, "YOUTUBE");
    const cb = await connect(b.id, "YOUTUBE");
    await connect(c.id, "TIKTOK");
    // B est la plus utilisée ; A a une publication proche et une lointaine.
    for (let i = 0; i < 3; i++) await post(b.id, user.id, cb.id, 2 + i);
    const soonA = await post(a.id, user.id, ca.id, 5);
    const farA = await post(a.id, user.id, ca.id, 20);
    const page = await prisma.linkPage.create({ data: { brandId: a.id, title: "Bio A", published: true } });
    for (let i = 0; i < 6; i++) await prisma.linkItem.create({ data: { linkPageId: page.id, label: `Lien ${i}`, url: `https://exemple.fr/${i}`, order: i } });
    return { user, a, b, c, soonA, farA, page };
  }

  async function snapshot() {
    return {
      brands: await prisma.brand.count(),
      posts: await prisma.post.count(),
      connections: await prisma.socialConnection.count(),
      links: await prisma.linkItem.count()
    };
  }

  it("fin d'essai : la plus utilisée reste active, les autres en veille ; 7 jours de grâce ; page bio en ligne en Gratuit ; rien de supprimé ; cron idempotent", async () => {
    const s = await setup();
    const before = await snapshot();
    await prisma.user.update({ where: { id: s.user.id }, data: { trialEndsAt: new Date(Date.now() - 60_000) } });

    expect((await applyTrialExpirations()).applied).toBe(1);
    const brands = await prisma.brand.findMany({ orderBy: { createdAt: "asc" } });
    expect(brands.find((x) => x.id === s.b.id)?.dormantAt).toBeNull();
    expect(brands.find((x) => x.id === s.a.id)?.dormantAt).not.toBeNull();
    expect(brands.find((x) => x.id === s.c.id)?.dormantAt).not.toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } })).freeActiveBrandId).toBe(s.b.id);

    expect(await prisma.post.findUniqueOrThrow({ where: { id: s.soonA.id } })).toMatchObject({ status: "SCHEDULED" });
    const far = await prisma.post.findUniqueOrThrow({ where: { id: s.farA.id } });
    expect(far.status).toBe("DRAFT");
    expect(far.scheduledAt).toBeNull();
    expect(far.dormantScheduledAt?.getTime()).toBeGreaterThan(Date.now() + 19 * DAY);

    const page = await prisma.linkPage.findUniqueOrThrow({ where: { id: s.page.id }, include: { links: { orderBy: { order: "asc" } } } });
    expect(page.published).toBe(true);
    expect(page.links.filter((l) => l.enabled)).toHaveLength(PLAN_LIMITS.FREE.maxBioLinks);

    // Notification dans la cloche.
    const bell = await prisma.notification.findMany({ where: { userId: s.user.id } });
    expect(bell.some((n) => /repassée en brouillon/.test(n.body))).toBe(true);

    expect(await snapshot()).toEqual(before);

    // Deuxième passage (cron relancé, ou fonction appelée à nouveau) : même état.
    const state = JSON.stringify(await prisma.brand.findMany({ orderBy: { id: "asc" }, select: { id: true, dormantAt: true } }));
    await prisma.user.update({ where: { id: s.user.id }, data: { trialExpiredAppliedAt: null } });
    await applyTrialExpirations();
    expect(JSON.stringify(await prisma.brand.findMany({ orderBy: { id: "asc" }, select: { id: true, dormantAt: true } }))).toBe(state);
    expect(await snapshot()).toEqual(before);
  });

  it("marque en veille : 402 à la création d'une publication, aucune synchronisation lancée", async () => {
    const s = await setup();
    await prisma.user.update({ where: { id: s.user.id }, data: { trialEndsAt: new Date(Date.now() - 60_000) } });
    await applyTrialExpirations();
    const conn = await prisma.socialConnection.findFirstOrThrow({ where: { brandId: s.a.id } });
    const r = await createPost(s.user.id, { brandId: s.a.id, title: "", caption: "x", mediaAssetIds: [], targets: [{ connectionId: conn.id, network: "YOUTUBE" }], publishNow: false });
    expect(r).toMatchObject({ ok: false, status: 402, reason: "dormant_brand" });

    session.userId = s.user.id;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await postAnalyticsSync(req("/api/analytics/sync", { brandId: s.a.id }));
    expect(res.status).toBe(402);
    expect((await res.json()).reason).toBe("dormant_brand");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect((await prisma.socialConnection.findUniqueOrThrow({ where: { id: conn.id } })).lastSyncedAt).toBeNull();
  });

  it("choix de la marque active : libre pendant l'essai ; en Gratuit, échange une fois tous les 30 jours", async () => {
    const s = await setup();
    session.userId = s.user.id;
    expect((await postActiveBrand(req("/api/billing/active-brand", { brandId: s.c.id }))).status).toBe(200);
    expect((await postActiveBrand(req("/api/billing/active-brand", { brandId: s.a.id }))).status).toBe(200);
    await prisma.user.update({ where: { id: s.user.id }, data: { trialEndsAt: new Date(Date.now() - 60_000) } });
    await applyTrialExpirations();
    expect((await prisma.brand.findUniqueOrThrow({ where: { id: s.a.id } })).dormantAt).toBeNull();
    // A choisie : sa publication lointaine reste programmée.
    expect((await prisma.post.findUniqueOrThrow({ where: { id: s.farA.id } })).status).toBe("SCHEDULED");

    // Échange vers B : B active, A en veille.
    expect((await postActiveBrand(req("/api/billing/active-brand", { brandId: s.b.id }))).status).toBe(200);
    expect((await prisma.brand.findUniqueOrThrow({ where: { id: s.b.id } })).dormantAt).toBeNull();
    expect((await prisma.brand.findUniqueOrThrow({ where: { id: s.a.id } })).dormantAt).not.toBeNull();
    expect((await prisma.post.findUniqueOrThrow({ where: { id: s.farA.id } })).status).toBe("DRAFT");
    // Un second échange dans les 30 jours est refusé.
    const again = await postActiveBrand(req("/api/billing/active-brand", { brandId: s.a.id }));
    expect(again.status).toBe(429);
    expect((await again.json()).changeableAt).toBeTruthy();
  });

  it("abonnement : marques réactivées, reprogrammation proposée ; webhook reçu deux fois sans effet de plus", async () => {
    const s = await setup();
    await prisma.user.update({ where: { id: s.user.id }, data: { trialEndsAt: new Date(Date.now() - 60_000) } });
    await applyTrialExpirations();
    await prisma.subscription.create({ data: { userId: s.user.id, plan: "PRO", status: "ACTIVE", maxBrands: 3 } });

    const first = await reactivateAfterUpgrade(s.user.id);
    expect(first).toMatchObject({ reactivatedBrands: 2, reschedulable: 1 });
    expect(await prisma.brand.count({ where: { dormantAt: { not: null } } })).toBe(0);
    const second = await reactivateAfterUpgrade(s.user.id);
    expect(second).toMatchObject({ reactivatedBrands: 0, reschedulable: 1 });

    const done = await rescheduleDormantPosts(s.user.id);
    expect(done.rescheduled).toBe(1);
    const far = await prisma.post.findUniqueOrThrow({ where: { id: s.farA.id }, include: { targets: true } });
    expect(far.status).toBe("SCHEDULED");
    expect(far.scheduledAt?.getTime()).toBeGreaterThan(Date.now() + 19 * DAY);
    expect(far.dormantScheduledAt).toBeNull();
    expect(far.targets[0].status).toBe("SCHEDULED");
    expect(await countReschedulable(s.user.id)).toBe(0);
    expect((await rescheduleDormantPosts(s.user.id)).rescheduled).toBe(0);
  });

  it("essais en cours au déploiement : toutes les marques déjà créées restent actives jusqu'à la fin", async () => {
    const { user, brands } = await makeUser({ brands: 3 });
    const conn = await connect(brands[2].id, "YOUTUBE");
    const r = await createPost(user.id, { brandId: brands[2].id, title: "", caption: "x", mediaAssetIds: [], targets: [{ connectionId: conn.id, network: "YOUTUBE" }], publishNow: false });
    expect(r.ok).toBe(true);
    // Mais pas de 3e marque de plus à la création : 2 au plus pendant l'essai.
    expect((await getUserPlan(user.id)).maxBrands).toBe(2);
  });
});

