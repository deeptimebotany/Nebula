import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";
import { trackGrowth } from "@/lib/growth";
import { rewardOnFirstPayment, flushBonusMonths } from "@/lib/billing/rewards";
import type Stripe from "stripe";

// POST /api/billing/webhook — reçoit les événements Stripe (paiement
// confirmé, abonnement modifié/annulé) et met à jour la table Subscription
// (rattachée à l'utilisateur, pas à une marque) en conséquence. À
// configurer dans le Dashboard Stripe (URL publique de cette route) avec le
// secret dans STRIPE_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  if (!isBillingEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook Stripe non configuré." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ error: "Signature manquante" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `Signature invalide : ${(err as Error).message}` }, { status: 400 });
  }

  async function upsertFromSubscription(sub: Stripe.Subscription, userId?: string) {
    const resolvedUserId = userId || (sub.metadata?.userId as string | undefined);
    if (!resolvedUserId) return;

    const plan = (sub.metadata?.plan as string | undefined) || "PRO";
    const maxBrands = Number(sub.metadata?.maxBrands) || 1;
    const priceId = sub.items.data[0]?.price?.id;
    // L'intervalle réel du tarif Stripe (recurring.interval) fait foi ; le
    // metadata posé au moment du Checkout sert de repli si absent.
    const interval =
      sub.items.data[0]?.price?.recurring?.interval === "year"
        ? "year"
        : sub.items.data[0]?.price?.recurring?.interval === "month"
          ? "month"
          : (sub.metadata?.interval as string | undefined) || "month";
    const periodEndTimestamp = (sub as unknown as { current_period_end?: number }).current_period_end;
    // Pause plutôt qu'annulation (lot G2.c) : Stripe expose pause_collection
    // tant que la pause court ; resumes_at absent = pas de pause.
    const pause = (sub as unknown as { pause_collection?: { behavior?: string; resumes_at?: number | null } | null }).pause_collection;
    const pausedUntil = pause?.resumes_at ? new Date(pause.resumes_at * 1000) : null;

    await consumeBonusIfUsed(resolvedUserId, sub);

    await prisma.subscription.upsert({
      where: { userId: resolvedUserId },
      update: {
        plan,
        interval,
        maxBrands,
        status: mapStripeStatus(sub.status),
        stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        currentPeriodEnd: periodEndTimestamp ? new Date(periodEndTimestamp * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        pausedUntil
      },
      create: {
        userId: resolvedUserId,
        plan,
        interval,
        maxBrands,
        status: mapStripeStatus(sub.status),
        stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        currentPeriodEnd: periodEndTimestamp ? new Date(periodEndTimestamp * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        pausedUntil
      }
    });

    await markFirstPayment(resolvedUserId, sub);
  }

  // Première souscription payante d'un compte (lot G0) : firstPaidAt posé
  // une seule fois, événement `paid` avec l'instantané d'acquisition, puis
  // récompenses de la marque apporteuse / du parrain (lots G1.a, G7), et
  // consommation d'un éventuel mois offert ou de l'offre de bienvenue.
  async function markFirstPayment(userId: string, sub: Stripe.Subscription) {
    if (!["active", "trialing"].includes(sub.status)) return;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, firstPaidAt: true, acqSource: true, acqMedium: true, acqCampaign: true, acqContent: true, acqVia: true, acqLanding: true, referredByCode: true, offerExpiresAt: true, offerUsedAt: true }
    });
    if (!user || user.firstPaidAt) return;
    const usedOffer = sub.metadata?.usedOffer === "1";
    await prisma.user.update({
      where: { id: userId },
      data: {
        firstPaidAt: new Date(),
        ...(usedOffer && !user.offerUsedAt ? { offerUsedAt: new Date() } : {})
      }
    });
    await trackGrowth(
      "paid",
      {
        source: user.acqSource ?? "direct",
        medium: user.acqMedium ?? "",
        campaign: user.acqCampaign ?? "",
        content: user.acqContent ?? "",
        via: user.acqVia ?? "",
        landing: user.acqLanding ?? "",
        referred: Boolean(user.referredByCode),
        plan: (sub.metadata?.plan as string | undefined) ?? "PRO",
        interval: sub.items.data[0]?.price?.recurring?.interval ?? "month",
        offer: usedOffer
      },
      userId
    );
    if (usedOffer) await trackGrowth("offer_used", { plan: (sub.metadata?.plan as string | undefined) ?? "PRO" }, userId);
    await rewardOnFirstPayment(user).catch((err) => console.error("[rewards]", (err as Error).message));
    // Mois offerts restants (au-delà de celui éventuellement consommé par le
    // coupon du Checkout) : convertis en crédits sur la prochaine facture.
    await flushBonusMonths(userId).catch((err) => console.error("[rewards] flush :", (err as Error).message));
  }

  // Mois offert consommé par le coupon du Checkout (metadata usedBonus) :
  // décompté UNE fois par abonnement Stripe — y compris lors d'un
  // réabonnement, où markFirstPayment ne repasse pas. Fait AVANT la mise à
  // jour de l'abonnement pour que flushBonusMonths (cron) ne voie jamais un
  // abonnement actif avec ce mois encore compté.
  async function consumeBonusIfUsed(userId: string, sub: Stripe.Subscription) {
    if (sub.metadata?.usedBonus !== "1") return;
    await prisma.user.updateMany({
      where: {
        id: userId,
        bonusMonths: { gt: 0 },
        OR: [{ bonusConsumedSubId: null }, { bonusConsumedSubId: { not: sub.id } }]
      },
      data: { bonusMonths: { decrement: 1 }, bonusConsumedSubId: sub.id }
    } as never);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || (session.metadata?.userId as string | undefined);
      if (session.subscription && userId) {
        const sub = await stripe().subscriptions.retrieve(session.subscription as string);
        await upsertFromSubscription(sub, userId);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      await upsertFromSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId as string | undefined;
      if (userId) {
        await prisma.subscription.updateMany({ where: { userId }, data: { plan: "FREE", status: "CANCELED", maxBrands: 1, pausedUntil: null } });
      }
      break;
    }
    case "invoice.paid": {
      // Compteur de factures mensuelles payées (rappel annuel à la 3e, lot
      // G2.c). L'utilisateur est retrouvé par l'abonnement Stripe.
      const invoice = event.data.object as Stripe.Invoice;
      const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (subId && (invoice.amount_paid ?? 0) > 0) {
        const row = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId }, select: { userId: true, interval: true } });
        if (row && row.interval === "month") {
          await prisma.user.update({ where: { id: row.userId }, data: { paidInvoices: { increment: 1 } } }).catch(() => undefined);
        }
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return "INCOMPLETE";
  }
}
