import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gemini payant (30/09/2026), sur une vraie base : quotas du MOIS par compte
// (remis à zéro le 1er, heure de Paris), analyses Rétention achetées après
// le quota, recharges idempotentes, âge confirmé (18 ans et plus), et
// Rétention IA qui regarde la vidéo — avec des réponses de Google simulées
// (aucun appel réseau).
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: () => undefined }), headers: () => new Headers() }));
vi.mock("@/lib/account-security", async (orig) => ({ ...(await orig<typeof import("@/lib/account-security")>()), sendVerificationEmail: vi.fn(async () => undefined) }));

// YouTube : courbe et fiche de la vidéo simulées.
const yt = vi.hoisted(() => ({
  meta: { title: "Mon vlog", description: "Une journée à Lyon", thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg", privacyStatus: "public" as string | null, durationSeconds: 600 as number | null }
}));
vi.mock("@/lib/social/youtube", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/youtube")>()),
  fetchRetention: vi.fn(async () => [
    { timeRatio: 0, watchRatio: 1 },
    { timeRatio: 0.1, watchRatio: 0.7 },
    { timeRatio: 0.2, watchRatio: 0.68 },
    { timeRatio: 0.4, watchRatio: 0.5 },
    { timeRatio: 1, watchRatio: 0.45 }
  ]),
  fetchVideoMetadata: vi.fn(async () => ({ ...yt.meta }))
}));
vi.mock("@/lib/social/base", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/base")>()),
  downloadMedia: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]).buffer, type: "image/jpeg" }))
}));

// Gemini : l'appel de Rétention est simulé ; `billed` imite une réponse
// facturée (jetons mesurés comme par la vraie porte de gemini.ts).
type RetentionParams = { systemInstruction: string; parts: Record<string, unknown>[]; thinking: string; video: boolean };
const ai = vi.hoisted(() => ({
  calls: [] as RetentionParams[],
  answer: "" as string,
  billed: true,
  refuseAgentic: false,
  thumb: vi.fn(async () => ({ base64: "aGVsbG8=", mimeType: "image/png" }))
}));
vi.mock("@/lib/ai/gemini", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/gemini")>();
  const { recordAiUsage } = await import("@/lib/ai/usage");
  return {
    ...real,
    isAiEnabled: () => true,
    generateThumbnail: ai.thumb,
    generateRetentionJson: vi.fn(async (params: RetentionParams) => {
      ai.calls.push(params);
      if (ai.refuseAgentic && params.parts.some((p) => p.media_processing)) {
        throw new Error('Invalid JSON payload received. Unknown name "media_processing" at \'contents[0].parts[1]\': Cannot find field.');
      }
      if (ai.billed) await recordAiUsage({ model: "gemini-3.8-flash", inputTokens: 60_500, videoTokens: 60_000, outputTokens: 1_020, images: 0, imageModel: false });
      return ai.answer;
    })
  };
});

import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { POST as postAnalyze } from "@/app/api/ai/analyze-channel-video/route";
import { POST as postRegister } from "@/app/api/auth/register/route";
import { POST as postAge } from "@/app/api/me/age/route";
import { POST as postPack } from "@/app/api/billing/retention-pack/route";
import { POST as postToolThumbnail } from "@/app/api/public/tools/thumbnail/route";
import { GET as getToolAccess } from "@/app/api/public/tools/access/route";
import { aiQuotaSnapshot, assertAiAllowed } from "@/lib/ai/guard";
import { accountCounterKey, parisMonth, reserveMonthly } from "@/lib/ai/counters";
import { getUserPlan } from "@/lib/billing/plan";
import { grantRetentionPack, revokeRefundedPack } from "@/lib/billing/retention-pack";
import { loadAiCostReport } from "@/lib/ai/cost-report";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const GOOD_ANSWER = JSON.stringify({
  summary: "L'intro est trop longue. 88 % des gens s'ennuient.",
  drops: [
    { id: "D1", scene: "Logo animé de 15 secondes.", cause: "Rien ne promet la suite." },
    { id: "D2", scene: "Plan fixe sur le bureau.", cause: "Le rythme retombe." }
  ],
  recommendations: ["Montrez le résultat dès la première seconde.", "Coupez les plans fixes de plus de 3 secondes."]
});

function req(url: string, body?: unknown, ip = "198.51.100.20") {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip }
  });
}

async function proChannel(plan: "PRO" | "AGENCY" = "PRO") {
  const { user, brand } = await makeBrand();
  await prisma.user.update({ where: { id: user.id }, data: { compPlan: plan, emailVerifiedAt: new Date() } });
  const connection = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "YOUTUBE", externalAccountId: `yt-${Math.random()}`, displayName: "Ma chaîne", accessToken: "AT" } });
  return { user, brand, connection };
}

const analyze = (connectionId: string, videoId = "abc", force = false) => postAnalyze(req("/api/ai/analyze-channel-video", { connectionId, videoId, force }));
const retentionCount = async () => (await prisma.aiMonthlyUsage.findFirst({ where: { kind: "retention", period: parisMonth() } }))?.count ?? 0;

function checkout(id: string, userId: string, paid = true): Stripe.Checkout.Session {
  return {
    id,
    mode: "payment",
    payment_status: paid ? "paid" : "unpaid",
    client_reference_id: userId,
    metadata: { userId, kind: "retention_pack", credits: "20" },
    amount_total: 399,
    currency: "eur",
    payment_intent: `pi_${id}`
  } as unknown as Stripe.Checkout.Session;
}

describe.skipIf(!hasDatabase)("Rétention IA : l'IA regarde la vidéo, Nebula calcule", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    ai.calls = [];
    ai.answer = GOOD_ANSWER;
    ai.billed = true;
    ai.refuseAgentic = false;
    yt.meta.privacyStatus = "public";
    yt.meta.durationSeconds = 600;
  });

  it("vidéo publique de 10 min : vidéo entière (mode agentique d'abord), chutes de Nebula, chiffre inventé retiré, jetons réels, 1 analyse", async () => {
    const { user, connection } = await proChannel();
    session.userId = user.id;
    const res = await analyze(connection.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ reused: false, usedCredit: false, quota: { retention: { limit: 15, used: 1, remaining: 14, per: "month" } } });

    // Ce qui est parti chez Google : l'URL publique, la réflexion « medium » (Pro).
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].parts[1]).toEqual({ file_data: { file_uri: "https://www.youtube.com/watch?v=abc" }, media_processing: "AGENTIC" });
    expect(ai.calls[0].thinking).toBe("medium");
    expect((ai.calls[0].parts[0] as { text: string }).text).toContain("D1 : à 1:00, les spectateurs restants passent de 100 % à 70 %");

    const insight = await prisma.videoInsight.findFirstOrThrow({ where: { connectionId: connection.id, videoId: "abc" } });
    expect(insight).toMatchObject({ mode: "video", model: "gemini-3.8-flash", durationSeconds: 600, promptTokens: 60_500, videoTokens: 60_000, outputTokens: 1_020 });
    expect(insight.summary).toBe("L'intro est trop longue."); // « 88 % » n'est pas un chiffre de Nebula
    const drops = JSON.parse(insight.dropOffPoints);
    expect(drops[0]).toMatchObject({ id: "D1", second: 60, before: 1, after: 0.7, scene: "Logo animé de 15 secondes." });
    expect(drops.map((d: { id: string; second: number }) => [d.id, d.second])).toEqual([["D1", 60], ["D2", 120], ["D3", 240], ["D4", 600]]);
    expect(drops[2]).toMatchObject({ before: 0.68, after: 0.5, scene: "" }); // pas d'explication de l'IA pour D3 : rien d'inventé

    // Mesure des coûts : une action, rangée sous le modèle appelé.
    const usage = await prisma.aiUsageDaily.findFirstOrThrow({ where: { kind: "retention" } });
    expect(usage).toMatchObject({ plan: "PRO", model: "gemini-3.8-flash", calls: 1, actions: 1, inputTokens: 60_500, videoTokens: 60_000 });
    // Ligne d'avant le 30/09/2026 (sans modèle ni actions) : comptée dans les coûts, pas dans le coût par action.
    await prisma.aiUsageDaily.create({ data: { day: usage.day, plan: "PRO", kind: "retention", model: "", calls: 10, inputTokens: 1_000_000, outputTokens: 0, images: 0 } });
    const report = await loadAiCostReport();
    const retention = report.last30.byKind.find((k) => k.kind === "retention");
    expect(retention).toMatchObject({ actions: 1, measured: true });
    expect(retention!.perActionUsd).toBeCloseTo((60_500 * 0.75 + 1_020 * 3.75) / 1_000_000, 5);
    expect(report.models.find((m) => m.model === "gemini-3.8-flash")?.roles).toEqual(expect.arrayContaining(["Rétention"]));
  });

  it("même vidéo : résultat réutilisé sans appel ni décompte ; « Refaire l'analyse » compte 1", async () => {
    const { user, connection } = await proChannel();
    session.userId = user.id;
    expect((await analyze(connection.id)).status).toBe(200);
    const again = await (await analyze(connection.id)).json();
    expect(again).toMatchObject({ reused: true, quota: { retention: { used: 1 } } });
    expect(ai.calls).toHaveLength(1);
    const redo = await (await analyze(connection.id, "abc", true)).json();
    expect(redo).toMatchObject({ reused: false, quota: { retention: { used: 2 } } });
    expect(ai.calls).toHaveLength(2);
    expect(await prisma.videoInsight.count()).toBe(2);
  });

  it("vidéo non listée : miniature seulement (hypothèses) ; vidéo de plus de 20 min : début + passages des chutes ; Agence : réflexion « high »", async () => {
    const { user, connection } = await proChannel("AGENCY");
    session.userId = user.id;
    yt.meta.privacyStatus = "unlisted";
    expect((await analyze(connection.id, "v1")).status).toBe(200);
    expect(ai.calls[0].parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: "AQID" } });
    expect(ai.calls[0].video).toBe(false);
    expect(ai.calls[0].thinking).toBe("high");
    expect((await prisma.videoInsight.findFirstOrThrow({ where: { videoId: "v1" } })).mode).toBe("thumbnail");

    yt.meta.privacyStatus = "public";
    yt.meta.durationSeconds = 3000;
    expect((await analyze(connection.id, "v2")).status).toBe(200);
    const clipParts = ai.calls[1].parts.slice(1);
    expect(clipParts[0]).toEqual({ file_data: { file_uri: "https://www.youtube.com/watch?v=v2" }, video_metadata: { start_offset: "0s", end_offset: "60s" } });
    expect(clipParts.every((p) => (p.video_metadata as { end_offset: string } | undefined)?.end_offset)).toBe(true);
    expect(ai.calls[1].video).toBe(true);
    expect((await prisma.videoInsight.findFirstOrThrow({ where: { videoId: "v2" } })).mode).toBe("clips");
  });

  it("réponse hors contrat : message clair, rien n'est décompté (même facturée par Google)", async () => {
    const { user, connection } = await proChannel();
    session.userId = user.id;
    ai.answer = "Voici mon analyse : la vidéo est bien.";
    const res = await analyze(connection.id);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/format inattendu.*Rien n'a été décompté\.$/);
    expect(await retentionCount()).toBe(0);
    expect(await prisma.videoInsight.count()).toBe(0);
    // Google a répondu : l'appel est mesuré (coût réel), sans action aboutie.
    expect(await prisma.aiUsageDaily.findFirst({ where: { kind: "retention" } })).toMatchObject({ calls: 1, actions: 0 });
  });

  it("quota du mois épuisé : analyses achetées ensuite (rendues si échec), puis 429 avec l'offre de recharge", async () => {
    const { user, connection } = await proChannel();
    session.userId = user.id;
    await reserveMonthly(accountCounterKey(user.id), parisMonth(), "retention", 15, 15);
    await prisma.user.update({ where: { id: user.id }, data: { retentionCredits: 2 } });

    const first = await (await analyze(connection.id, "c1")).json();
    expect(first).toMatchObject({ usedCredit: true, quota: { retention: { remaining: 0 }, retentionCredits: 1 } });

    ai.answer = "illisible";
    expect((await analyze(connection.id, "c2")).status).toBe(500);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).retentionCredits).toBe(1); // rendue

    ai.answer = GOOD_ANSWER;
    expect((await analyze(connection.id, "c3")).status).toBe(200);
    const refused = await analyze(connection.id, "c4");
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body).toMatchObject({ reason: "ai_monthly_limit", retentionPack: true });
    expect(body.error).toMatch(/vos 15 analyses Rétention de ce mois-ci : le compteur repart le 1er .+ Vous pouvez ajouter 20 analyses pour 3,99 €/);
    expect(await retentionCount()).toBe(15);
  });

  it("Google refuse le mode agentique pour une URL YouTube : mode normal en basse résolution, sans erreur visible", async () => {
    const { user, connection } = await proChannel();
    session.userId = user.id;
    ai.refuseAgentic = true;
    const res = await analyze(connection.id, "ag");
    expect(res.status).toBe(200);
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1].parts[1]).toEqual({ file_data: { file_uri: "https://www.youtube.com/watch?v=ag" } });
    expect(ai.calls[1].video).toBe(true);
    expect(await retentionCount()).toBe(1);
  });
});

describe.skipIf(!hasDatabase)("quotas du mois, âge et recharges", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    ai.thumb.mockClear();
    process.env.NEXTAUTH_SECRET = "secret-de-test-assez-long-pour-hkdf-0123456789";
  });
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_RETENTION_PACK;
  });

  it("le 1er du mois à minuit (heure de Paris), le quota repart à zéro", async () => {
    const { user } = await makeBrand();
    await prisma.user.update({ where: { id: user.id }, data: { compPlan: "PRO" } });
    const info = await getUserPlan(user.id);
    const lastEvening = new Date("2026-10-31T22:30:00Z"); // 31 octobre, 23 h 30 à Paris
    const firstNight = new Date("2026-10-31T23:30:00Z"); // 1er novembre, 0 h 30 à Paris
    for (const now of [lastEvening, lastEvening, firstNight]) {
      const gate = await assertAiAllowed({ userId: user.id, plan: info, kind: "image", now });
      if (!gate.ok) throw new Error(gate.error);
      await gate.run(async () => "ok");
    }
    const rows = await prisma.aiMonthlyUsage.findMany({ orderBy: { period: "asc" } });
    expect(rows.map((r) => [r.period, r.kind, r.count])).toEqual([
      ["2026-10", "image", 2],
      ["2026-11", "image", 1]
    ]);
    const snap = await aiQuotaSnapshot(user.id, info, firstNight);
    expect(snap.image).toEqual({ limit: 20, used: 1, remaining: 19, per: "month" });
    expect(snap.resetsOn).toBe("2026-12-01");
  });

  it("âge non confirmé : IA refusée (403) sans rien compter ; « J'ai 18 ans ou plus » débloque", async () => {
    const { user } = await makeBrand();
    await prisma.user.update({ where: { id: user.id }, data: { compPlan: "PRO", ageConfirmedAt: null } });
    const info = await getUserPlan(user.id);
    const refused = await assertAiAllowed({ userId: user.id, plan: info, kind: "image" });
    expect(refused).toMatchObject({ ok: false, status: 403, reason: "age_unconfirmed" });
    expect(await prisma.aiMonthlyUsage.count()).toBe(0);

    session.userId = user.id;
    expect((await postAge(req("/api/me/age", { adult: false }))).status).toBe(400);
    expect((await postAge(req("/api/me/age", { adult: true }))).status).toBe(200);
    const confirmed = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).ageConfirmedAt;
    expect(confirmed).not.toBeNull();
    // Une seconde confirmation ne change pas la date.
    await postAge(req("/api/me/age", { adult: true }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).ageConfirmedAt).toEqual(confirmed);
    expect((await assertAiAllowed({ userId: user.id, plan: info, kind: "image" })).ok).toBe(true);
  });

  it("inscription : la case « 18 ans ou plus » est obligatoire et datée", async () => {
    const base = { name: "Alex Martin", email: "alex@exemple.fr", password: "MotDePasse-Test-1", acceptTerms: true };
    const minor = await postRegister(req("/api/auth/register", base, "192.0.2.40") as unknown as Request);
    expect(minor.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
    const adult = await postRegister(req("/api/auth/register", { ...base, isAdult: true }, "192.0.2.41") as unknown as Request);
    expect(adult.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "alex@exemple.fr" } })).ageConfirmedAt).not.toBeNull();
  });

  it("Gratuit : pas de miniature IA dans les outils (402, rien consommé, pas d'appel) ; le quota affiché le dit", async () => {
    const { user } = await makeBrand();
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    session.userId = user.id;
    const res = await postToolThumbnail(req("/api/public/tools/thumbnail", { imageBase64: "a".repeat(200), imageMimeType: "image/png" }));
    expect(res.status).toBe(402);
    expect(ai.thumb).not.toHaveBeenCalled();
    expect(await prisma.aiMonthlyUsage.count()).toBe(0);
    expect(await (await getToolAccess()).json()).toMatchObject({ plan: "FREE", quota: { thumbnail: { limit: 0, remaining: 0 } } });
  });

  it("recharge : un paiement crédite 20 analyses une seule fois, même si Stripe renvoie l'événement ; remboursement : retirées sans passer sous zéro", async () => {
    const { user } = await makeBrand();
    expect(await grantRetentionPack(checkout("cs_1", user.id, false))).toBe("ignored"); // paiement pas encore encaissé
    expect(await grantRetentionPack(checkout("cs_1", user.id))).toBe("granted");
    expect(await grantRetentionPack(checkout("cs_1", user.id))).toBe("already");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).retentionCredits).toBe(20);
    expect(await prisma.aiCreditPurchase.findFirst()).toMatchObject({ credits: 20, amountCents: 399, currency: "eur", stripePaymentIntentId: "pi_cs_1" });
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1);

    // 15 analyses déjà utilisées, puis remboursement de moitié, puis total.
    await prisma.user.update({ where: { id: user.id }, data: { retentionCredits: 5 } });
    const charge = (refunded: number) => ({ payment_intent: "pi_cs_1", amount: 399, amount_refunded: refunded }) as unknown as Stripe.Charge;
    expect(await revokeRefundedPack(charge(200))).toBe(10);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).retentionCredits).toBe(0);
    expect(await revokeRefundedPack(charge(399))).toBe(10);
    expect(await revokeRefundedPack(charge(399))).toBe(0); // événement rejoué
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).retentionCredits).toBe(0);
    expect((await prisma.aiCreditPurchase.findFirstOrThrow()).refundedAt).not.toBeNull();
  });

  it("achat d'une recharge : case de renonciation obligatoire, réservé à Pro et Agence", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_exemple";
    process.env.STRIPE_PRICE_RETENTION_PACK = "price_exemple";
    const { user } = await makeBrand();
    session.userId = user.id;
    const noBox = await postPack(req("/api/billing/retention-pack", { waiveWithdrawal: false }));
    expect(noBox.status).toBe(400);
    expect((await noBox.json()).error).toBe("Cochez la case pour utiliser les analyses tout de suite.");
    const free = await postPack(req("/api/billing/retention-pack", { waiveWithdrawal: true }));
    expect(free.status).toBe(402);
    expect(await free.json()).toMatchObject({ reason: "retention" });
  });
});
