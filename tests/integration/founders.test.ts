import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Offres fondateurs (02/10/2026), sur une vraie base, Stripe simulé (aucun
// appel réseau) : coupon « 10 € pendant 3 mois » appliqué seulement à qui y
// a droit, badge posé par le webhook, « Fondateur Premium » (100 € une fois,
// Pro 1 marque pendant 1 an) accordé une seule fois, remboursement, rappels
// J-30 / J-7, fin de l'année (Gratuit sans rien perdre, question « quel
// forfait vous faut-il ? »), suite sans chevauchement.
const session = vi.hoisted(() => ({ userId: null as string | null, email: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId, email: session.email } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const fake = vi.hoisted(() => {
  const state = { coupon: null as null | Record<string, unknown>, failNextWithCoupon: false };
  return {
    state,
    client: {
      coupons: {
        retrieve: vi.fn(async (id: string) => {
          if (!state.coupon || state.coupon.id !== id) throw Object.assign(new Error("No such coupon"), { code: "resource_missing" });
          return state.coupon;
        }),
        create: vi.fn(async (params: Record<string, unknown>) => {
          state.coupon = { ...params, valid: true };
          return state.coupon;
        })
      },
      checkout: {
        sessions: {
          create: vi.fn(async (params: { discounts?: unknown[] }) => {
            if (state.failNextWithCoupon && params.discounts) {
              state.failNextWithCoupon = false;
              throw new Error("This coupon has reached its maximum number of redemptions.");
            }
            return { id: "cs_new", url: "https://checkout.stripe.test/c/cs_new" };
          })
        }
      },
      subscriptions: { retrieve: vi.fn() },
      webhooks: { constructEvent: vi.fn((body: string) => JSON.parse(body)) }
    }
  };
});
vi.mock("@/lib/billing/stripe", () => ({ isBillingEnabled: () => true, stripe: () => fake.client }));

import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL } from "@/lib/owner";
import { POST as postCheckout } from "@/app/api/billing/checkout/route";
import { POST as postWebhook } from "@/app/api/billing/webhook/route";
import { POST as postPremium } from "@/app/api/billing/founder-premium/route";
import { POST as postEnd } from "@/app/api/billing/founder-end/route";
import { GET as getFounders } from "@/app/api/billing/founders/route";
import { addMonthsUtc, founderPlaces, grantFounderPremium, markMonthlyFounder, resetFounderCouponCache, revokeRefundedFounderPremium, runFounderJobs } from "@/lib/billing/founders";
import { getUserPlan } from "@/lib/billing/plan";
import { assertBrandWritable } from "@/lib/billing/trial-expiry";
import { publicAuthor, AUTHOR_SELECT } from "@/lib/reussites/public-author";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const req = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const webhook = (event: unknown) => postWebhook(new NextRequest("http://localhost/api/billing/webhook", { method: "POST", body: JSON.stringify(event), headers: { "stripe-signature": "t=1,v1=test" } }));
const checkoutCalls = () => fake.client.checkout.sessions.create.mock.calls.map((c) => c[0] as Record<string, any>);

function premiumSession(id: string, userId: string, paid = true): Stripe.Checkout.Session {
  return { id, mode: "payment", payment_status: paid ? "paid" : "unpaid", client_reference_id: userId, metadata: { userId, kind: "founder_premium" }, amount_total: 10000, payment_intent: `pi_${id}` } as unknown as Stripe.Checkout.Session;
}

async function login(userId: string, email: string) {
  session.userId = userId;
  session.email = email;
}

describe.skipIf(!hasDatabase)("offres fondateurs", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    session.email = null;
    fake.state.coupon = null;
    fake.state.failNextWithCoupon = false;
    resetFounderCouponCache();
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_exemple";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_exemple";
    process.env.STRIPE_PRICE_PRO_1_MONTHLY = "price_pro1_m";
    process.env.STRIPE_PRICE_PRO_1_YEARLY = "price_pro1_y";
    process.env.STRIPE_PRICE_PRO_5_MONTHLY = "price_pro5_m";
    delete process.env.STRIPE_FOUNDER_COUPON;
    delete process.env.STRIPE_PRICE_FOUNDER_PREMIUM;
    // Horloge fixée pendant la vente (qui s'arrête le 1er janvier 2027) :
    // ces tests restent valables après cette date. L'heure avance quand même.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-15T10:00:00Z"), shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("places publiques ; droits d'un compte jamais abonné", async () => {
    let res = await getFounders();
    expect(await res.json()).toMatchObject({ open: true, monthly: { total: 100, left: 100, priceMonthly: 10, months: 3, regularPrice: 12 }, premium: { total: 100, left: 100, priceCents: 10000, months: 12 }, me: null });
    const { user } = await makeBrand();
    await login(user.id, user.email);
    res = await getFounders();
    expect((await res.json()).me).toMatchObject({ kind: null, monthlyEligible: true, premiumEligible: true, premiumBlocked: null });
  });

  it("Fondateur : coupon créé une fois (2 € × 3 mois, 100 utilisations), seulement sur Pro 1 marque mensuel et un premier abonnement", async () => {
    const { user } = await makeBrand();
    await login(user.id, user.email);
    const res = await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 1, founder: true }));
    expect(await res.json()).toMatchObject({ coupon: "founder" });
    expect(fake.client.coupons.create).toHaveBeenCalledTimes(1);
    expect(fake.client.coupons.create.mock.calls[0][0]).toMatchObject({ id: "nebula-fondateur-3-mois", amount_off: 200, currency: "eur", duration: "repeating", duration_in_months: 3, max_redemptions: 100 });
    // Plus utilisable chez Stripe après la fin de la vente (1er janvier 2027, 0 h à Paris).
    expect(fake.client.coupons.create.mock.calls[0][0].redeem_by).toBe(Date.UTC(2026, 11, 31, 23) / 1000);
    expect(checkoutCalls()[0]).toMatchObject({ mode: "subscription", line_items: [{ price: "price_pro1_m" }], discounts: [{ coupon: "nebula-fondateur-3-mois" }], subscription_data: { metadata: { founder: "1", maxBrands: "1" } } });

    // Deuxième passage : coupon relu, pas recréé.
    await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 1, founder: true }));
    expect(fake.client.coupons.create).toHaveBeenCalledTimes(1);

    // Ni en annuel, ni sur 5 marques, ni sans la case.
    await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "year", maxBrands: 1, founder: true }));
    await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 5, founder: true }));
    await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 1 }));
    for (const call of checkoutCalls().slice(2)) {
      expect(call.discounts).toBeUndefined();
      expect(call.allow_promotion_codes).toBe(true);
      expect(call.subscription_data.metadata.founder).toBe("0");
    }

    // Déjà payé une fois : plus droit à l'offre.
    await prisma.user.update({ where: { id: user.id }, data: { firstPaidAt: new Date() } });
    await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 1, founder: true }));
    expect(checkoutCalls().at(-1)?.subscription_data.metadata.founder).toBe("0");
  });

  it("fin de la vente le 1er janvier 2027 à 0 h (Paris) : plus d'offre pour personne, les fondateurs gardent tout", async () => {
    const { user } = await makeBrand();
    const premium = await makeBrand();
    await grantFounderPremium(premiumSession("cs_avant", premium.user.id), new Date("2026-12-20T10:00:00Z"));
    {
      // Dernière seconde du 31 décembre : encore ouvert.
      vi.setSystemTime(new Date("2026-12-31T23:59:59+01:00"));
      await login(user.id, user.email);
      expect((await (await getFounders()).json()) as Record<string, unknown>).toMatchObject({ saleOpen: true, saleEndsAt: "2026-12-31T23:00:00.000Z", me: { monthlyEligible: true, premiumEligible: true } });

      vi.setSystemTime(new Date("2027-01-01T00:00:00+01:00"));
      const after = await (await getFounders()).json();
      expect(after).toMatchObject({ saleOpen: false, me: { monthlyEligible: false, premiumEligible: false, premiumBlocked: "L'offre Fondateur Premium a pris fin le 1er janvier 2027." } });
      // Paiement Pro 1 marque : prix normal, pas de coupon.
      await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 1, founder: true }));
      expect(fake.client.coupons.create).not.toHaveBeenCalled();
      expect(checkoutCalls().at(-1)?.discounts).toBeUndefined();
      expect(checkoutCalls().at(-1)?.subscription_data.metadata.founder).toBe("0");
      // Premium : refusé avec la date.
      const refused = await postPremium(req("/api/billing/founder-premium", { waiveWithdrawal: true }));
      expect(refused.status).toBe(409);
      expect((await refused.json()).error).toBe("L'offre Fondateur Premium a pris fin le 1er janvier 2027.");
      // Un paiement ouvert avant minuit et réglé après est honoré.
      const late = await makeBrand();
      expect(await grantFounderPremium(premiumSession("cs_minuit", late.user.id))).toBe("granted");

      // Le Fondateur Premium d'avant garde son année.
      await login(premium.user.id, premium.user.email);
      expect((await (await getFounders()).json()).me).toMatchObject({ kind: "PREMIUM", premiumUntil: "2027-12-20T10:00:00.000Z", premiumBlocked: "Vous êtes déjà Fondateur Premium : merci !" });
      expect((await getUserPlan(premium.user.id)).plan).toBe("PRO");
    }
  });

  it("coupon épuisé chez Stripe : paiement au prix normal, sans erreur", async () => {
    const { user } = await makeBrand();
    await login(user.id, user.email);
    fake.state.failNextWithCoupon = true;
    const res = await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 1, founder: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ coupon: null, url: "https://checkout.stripe.test/c/cs_new" });
    expect(checkoutCalls()).toHaveLength(2);
    expect(checkoutCalls()[1].subscription_data.metadata.founder).toBe("0");
  });

  it("webhook : abonnement actif pris avec l'offre → badge « Fondateur » à vie, place comptée", async () => {
    const { user } = await makeBrand();
    const sub = {
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      cancel_at_period_end: false,
      metadata: { userId: user.id, plan: "PRO", interval: "month", maxBrands: "1", usedBonus: "0", usedOffer: "0", founder: "1" },
      items: { data: [{ price: { id: "price_pro1_m", recurring: { interval: "month" } }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] }
    };
    expect((await webhook({ type: "customer.subscription.created", data: { object: sub } })).status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u).toMatchObject({ founderKind: "MONTHLY" });
    expect(u.founderSince).not.toBeNull();
    expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toMatchObject({ plan: "PRO", maxBrands: 1, status: "ACTIVE" });
    expect((await founderPlaces()).monthly).toEqual({ total: 100, taken: 1, left: 99 });
    // Rejoué : rien ne change ; la notification est unique.
    await webhook({ type: "customer.subscription.updated", data: { object: sub } });
    expect(await prisma.notification.count({ where: { userId: user.id, dedupeKey: "founder:welcome" } })).toBe(1);
    expect(await markMonthlyFounder(user.id, { status: "active", metadata: { founder: "1" } })).toBe(false);
    // Communauté : le badge suit l'auteur.
    const author = publicAuthor(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: AUTHOR_SELECT }));
    expect(author?.founder).toBe(true);
    // Abonnement sans l'offre : pas de badge.
    const other = await makeBrand();
    await markMonthlyFounder(other.user.id, { status: "active", metadata: { founder: "0" } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } })).founderKind).toBeNull();
  });

  it("Fondateur Premium : case obligatoire, paiement unique de 100 € qui expire après 30 min, refusé à un abonné", async () => {
    const { user } = await makeBrand();
    await login(user.id, user.email);
    const noBox = await postPremium(req("/api/billing/founder-premium", { waiveWithdrawal: false }));
    expect(noBox.status).toBe(400);
    expect((await noBox.json()).error).toBe("Cochez la case pour profiter de Pro tout de suite.");
    const ok = await postPremium(req("/api/billing/founder-premium", { waiveWithdrawal: true }));
    expect(ok.status).toBe(200);
    const call = checkoutCalls()[0];
    expect(call).toMatchObject({ mode: "payment", line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: 10000 } }], metadata: { kind: "founder_premium", userId: user.id }, success_url: expect.stringContaining("/billing?founder=success") });
    expect(call.expires_at - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(29 * 60);

    await prisma.subscription.create({ data: { userId: user.id, plan: "PRO", status: "ACTIVE", maxBrands: 1 } });
    const paid = await postPremium(req("/api/billing/founder-premium", { waiveWithdrawal: true }));
    expect(paid.status).toBe(409);
    expect((await paid.json()).error).toMatch(/abonnement en cours/);
  });

  it("Fondateur Premium payé : Pro 1 marque 12 mois, une seule fois par session, double paiement signalé, marque en trop en lecture seule", async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
    const { user, brand } = await makeBrand();
    const second = await prisma.brand.create({ data: { name: "Deuxième", slug: `deux-${Date.now()}` } });
    await prisma.membership.create({ data: { userId: user.id, brandId: second.id, role: "OWNER" } });

    const now = new Date();
    expect(await grantFounderPremium(premiumSession("cs_p1", user.id, false), now)).toBe("ignored");
    // Par le webhook, comme en production.
    expect((await webhook({ type: "checkout.session.completed", data: { object: premiumSession("cs_p1", user.id) } })).status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u).toMatchObject({ compPlan: "PRO", compMaxBrands: 1, compNote: "Fondateur Premium", founderKind: "PREMIUM", founderPremiumSessionId: "cs_p1", founderPremiumPaymentId: "pi_cs_p1" });
    expect(Math.abs(u.founderPremiumUntil!.getTime() - addMonthsUtc(now, 12).getTime())).toBeLessThan(60_000);
    const info = await getUserPlan(user.id);
    expect(info).toMatchObject({ plan: "PRO", maxBrands: 1, paid: false });
    expect(info.comp).not.toBeNull();
    expect(await prisma.partnerGrant.findFirst({ where: { userId: user.id } })).toMatchObject({ plan: "PRO", maxBrands: 1, months: 12, note: "Fondateur Premium (100 € payés)" });
    expect((await founderPlaces()).premium.left).toBe(99);

    expect(await grantFounderPremium(premiumSession("cs_p1", user.id))).toBe("already");
    expect(await grantFounderPremium(premiumSession("cs_p2", user.id))).toBe("duplicate");
    expect(await prisma.notification.findFirst({ where: { userId: owner.id, dedupeKey: "founder-duplicate:cs_p2" } })).not.toBeNull();

    // 2 marques pour Pro 1 marque : la plus ancienne publie, l'autre en lecture seule, avec la marche à suivre.
    expect(await assertBrandWritable(brand.id)).toEqual({ ok: true });
    const ro = await assertBrandWritable(second.id);
    expect(ro).toMatchObject({ ok: false, reason: "second_brand" });
    expect((ro as { message: string }).message).toMatch(/Choisir ce que je garde/);

    // Déjà Premium : l'offre ne se reprend pas, et l'offre mensuelle non plus.
    await login(user.id, user.email);
    const me = (await (await getFounders()).json()).me;
    expect(me).toMatchObject({ kind: "PREMIUM", monthlyEligible: false, premiumEligible: false, premiumBlocked: "Vous êtes déjà Fondateur Premium : merci !" });
    expect(me.premiumUntil).toBe(u.founderPremiumUntil!.toISOString());
  });

  it("Premium qui prend la suite en Pro 1 marque : premier prélèvement à la fin de l'année ; un autre palier démarre tout de suite", async () => {
    const { user } = await makeBrand();
    await grantFounderPremium(premiumSession("cs_s", user.id));
    const until = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).founderPremiumUntil!;
    await login(user.id, user.email);
    await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 1, founder: true }));
    await postCheckout(req("/api/billing/checkout", { plan: "PRO", interval: "month", maxBrands: 5 }));
    const [same, bigger] = checkoutCalls();
    expect(same.subscription_data.trial_end).toBe(Math.floor(until.getTime() / 1000));
    expect(same.subscription_data.metadata.founder).toBe("0");
    expect(bigger.subscription_data.trial_end).toBeUndefined();
  });

  it("remboursement complet : accès retiré, place libérée, limites du Gratuit ; partiel : rien", async () => {
    const { user } = await makeBrand();
    await grantFounderPremium(premiumSession("cs_r", user.id));
    expect(await revokeRefundedFounderPremium({ payment_intent: "pi_cs_r", refunded: false })).toBe(false);
    expect((await getUserPlan(user.id)).plan).toBe("PRO");
    await webhook({ type: "charge.refunded", data: { object: { payment_intent: "pi_cs_r", refunded: true, amount: 10000, amount_refunded: 10000 } } });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u).toMatchObject({ founderKind: null, founderSince: null, founderPremiumAt: null, compPlan: null });
    expect((await getUserPlan(user.id)).plan).toBe("FREE");
    expect((await founderPlaces()).premium.left).toBe(100);
    expect((await prisma.partnerGrant.findFirstOrThrow({ where: { userId: user.id } })).revokedAt).not.toBeNull();
    // Le même paiement, rejoué : jamais réaccordé.
    expect(await grantFounderPremium(premiumSession("cs_r", user.id))).toBe("already");
  });

  it("rappels J-30 et J-7 (une fois chacun), puis fin : Gratuit sans rien perdre et « quel forfait vous faut-il ? »", async () => {
    const { user } = await makeBrand();
    const second = await prisma.brand.create({ data: { name: "Deuxième", slug: `deux-${Date.now()}` } });
    await prisma.membership.create({ data: { userId: user.id, brandId: second.id, role: "OWNER" } });
    const start = new Date("2026-10-02T09:00:00Z");
    await grantFounderPremium(premiumSession("cs_j", user.id), start);
    const until = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).founderPremiumUntil!;

    expect((await runFounderJobs(new Date(until.getTime() - 40 * DAY))).reminders).toBe(0);
    expect((await runFounderJobs(new Date(until.getTime() - 29 * DAY))).reminders).toBe(1);
    expect((await runFounderJobs(new Date(until.getTime() - 28 * DAY))).reminders).toBe(0);
    expect((await runFounderJobs(new Date(until.getTime() - 6 * DAY))).reminders).toBe(1);
    expect((await runFounderJobs(new Date(until.getTime() - 5 * DAY))).reminders).toBe(0);
    const notes = await prisma.notification.findMany({ where: { userId: user.id, dedupeKey: { startsWith: "founder:premium-j" } }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.title)).toEqual(["Votre année Fondateur Premium se termine dans un mois", "Votre année Fondateur Premium se termine dans une semaine"]);

    const end = new Date(until.getTime() + 60_000);
    expect(await runFounderJobs(end)).toEqual({ reminders: 0, ended: 1 });
    expect(await runFounderJobs(end)).toEqual({ reminders: 0, ended: 0 });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.founderPremiumEndedAt).not.toBeNull();
    expect(u).toMatchObject({ compPlan: null, founderKind: "PREMIUM" }); // badge gardé
    expect((await getUserPlan(user.id)).plan).toBe("FREE");
    expect(await prisma.brand.count({ where: { id: { in: [second.id] }, dormantAt: { not: null } } })).toBe(1);
    expect(await prisma.notification.findFirst({ where: { userId: user.id, dedupeKey: "founder:premium-end" } })).toMatchObject({ title: "Votre année Fondateur Premium est terminée" });

    // « Plus tard » : la question reviendra ; un choix : elle est close.
    await login(user.id, user.email);
    expect(await (await postEnd(req("/api/billing/founder-end", { choice: "later" }))).json()).toMatchObject({ recorded: false });
    expect(await (await postEnd(req("/api/billing/founder-end", { choice: "PRO-1" }))).json()).toMatchObject({ recorded: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).founderEndNoticeAt).not.toBeNull();
    expect((await postEnd(req("/api/billing/founder-end", { choice: "n'importe" }))).status).toBe(400);
  });

  it("abonnement pris pendant l'année : pas de rappel, et la fin ne touche à rien", async () => {
    const { user } = await makeBrand();
    const start = new Date("2026-10-02T09:00:00Z");
    await grantFounderPremium(premiumSession("cs_k", user.id), start);
    await prisma.subscription.create({ data: { userId: user.id, plan: "PRO", status: "TRIALING", maxBrands: 1 } });
    const until = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).founderPremiumUntil!;
    expect((await runFounderJobs(new Date(until.getTime() - 20 * DAY))).reminders).toBe(0);
    expect((await runFounderJobs(new Date(until.getTime() + 60_000))).ended).toBe(1);
    expect((await getUserPlan(user.id))).toMatchObject({ plan: "PRO", paid: true });
    expect(await prisma.notification.count({ where: { userId: user.id, dedupeKey: "founder:premium-end" } })).toBe(0);
  });
});
