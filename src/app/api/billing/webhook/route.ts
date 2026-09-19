import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";
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
        cancelAtPeriodEnd: sub.cancel_at_period_end
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
        cancelAtPeriodEnd: sub.cancel_at_period_end
      }
    });
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
        await prisma.subscription.updateMany({ where: { userId }, data: { plan: "FREE", status: "CANCELED", maxBrands: 1 } });
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
