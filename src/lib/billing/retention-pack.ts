// Recharges Rétention (30/09/2026) : « +20 analyses Rétention pour 3,99 € »,
// paiement unique Stripe, réservé à Pro et Agence (plans.ts, RETENTION_PACK).
//
//   - Achat : /api/billing/retention-pack ouvre Stripe Checkout (mode
//     « payment », même client Stripe que l'abonnement, facture) après que
//     la personne a demandé l'accès immédiat et renoncé à son droit de
//     rétractation (case à cocher, contenu numérique fourni tout de suite).
//   - Crédit : le webhook (checkout.session.completed, ou
//     async_payment_succeeded) appelle grantRetentionPack. Une ligne
//     AiCreditPurchase par session Checkout (identifiant unique) : un même
//     paiement ne crédite jamais deux fois, même si Stripe renvoie
//     l'événement.
//   - Remboursement (charge.refunded) : les analyses correspondantes sont
//     retirées du solde, sans le faire passer sous zéro.
//   - Utilisation : après le quota du mois (src/lib/ai/guard.ts), sans
//     date d'expiration ; seulement avec un palier qui l'autorise (Pro,
//     Agence) — gardées si l'abonnement s'arrête, de nouveau utilisables au
//     réabonnement.
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RETENTION_PACK, formatEuroCents } from "@/lib/plans";
import { isBillingEnabled } from "@/lib/billing/stripe";
import { notify } from "@/lib/notifications";

export const RETENTION_PACK_KIND = "retention_pack";

export function retentionPackPriceId(): string | null {
  return process.env[RETENTION_PACK.stripePriceEnvVar] || null;
}

/** Recharges achetables sur ce site (Stripe et prix configurés). */
export function retentionPackAvailable(): boolean {
  return isBillingEnabled() && Boolean(retentionPackPriceId());
}

export const RETENTION_PACK_LABEL = `+${RETENTION_PACK.credits} analyses Rétention pour ${formatEuroCents(RETENTION_PACK.priceCents)}`;

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Crédite une recharge payée (idempotent). « ignored » : pas une recharge,
 * ou paiement pas encore encaissé (moyens de paiement différés).
 */
export async function grantRetentionPack(session: Stripe.Checkout.Session): Promise<"granted" | "already" | "ignored"> {
  if (session.mode !== "payment" || session.metadata?.kind !== RETENTION_PACK_KIND) return "ignored";
  if (session.payment_status !== "paid") return "ignored";
  const userId = session.client_reference_id || session.metadata?.userId;
  if (!userId) return "ignored";
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return "ignored";
  const credits = RETENTION_PACK.credits;
  try {
    await prisma.$transaction([
      prisma.aiCreditPurchase.create({
        data: {
          userId,
          kind: "retention",
          credits,
          amountCents: session.amount_total ?? RETENTION_PACK.priceCents,
          currency: session.currency ?? RETENTION_PACK.currency,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: idOf(session.payment_intent as string | Stripe.PaymentIntent | null)
        }
      }),
      prisma.user.update({ where: { id: userId }, data: { retentionCredits: { increment: credits } } })
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "already";
    throw err;
  }
  await notify(userId, {
    kind: "reminder",
    title: "Recharge Rétention ajoutée",
    body: `${credits} analyses Rétention ont été ajoutées à votre compte. Elles servent une fois le quota du mois utilisé, et n'expirent pas.`,
    href: "/retention",
    actionLabel: "Analyser une vidéo",
    dedupeKey: `retention-pack:${session.id}`
  });
  return "granted";
}

/** Remboursement Stripe : retire les analyses remboursées du solde (jamais sous zéro). */
export async function revokeRefundedPack(charge: Stripe.Charge): Promise<number> {
  const paymentIntentId = idOf(charge.payment_intent as string | Stripe.PaymentIntent | null);
  if (!paymentIntentId) return 0;
  const purchase = await prisma.aiCreditPurchase.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
  if (!purchase || !charge.amount) return 0;
  const refundedShare = Math.min(1, Math.max(0, (charge.amount_refunded ?? 0) / charge.amount));
  const shouldBeRemoved = Math.round(purchase.credits * refundedShare);
  const toRemove = shouldBeRemoved - purchase.creditsRemoved;
  if (toRemove <= 0) return 0;
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "User" SET "retentionCredits" = GREATEST(0, "retentionCredits" - ${toRemove}) WHERE "id" = ${purchase.userId}`,
    prisma.aiCreditPurchase.update({
      where: { id: purchase.id },
      data: { creditsRemoved: shouldBeRemoved, ...(refundedShare >= 1 ? { refundedAt: new Date() } : {}) }
    })
  ]);
  return toRemove;
}
