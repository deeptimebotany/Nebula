import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isBillingEnabled, stripe } from "@/lib/billing/stripe";
import { FOUNDER_PREMIUM_KIND, founderEligibility, founderPremiumLineItem } from "@/lib/billing/founders";
import { FOUNDER_PREMIUM } from "@/lib/founders-offer";
import { trackGrowth } from "@/lib/growth";

// POST /api/billing/founder-premium — ouvre Stripe Checkout pour l'offre
// « Fondateur Premium » (100 € une fois, Pro 1 marque pendant 1 an, sans
// renouvellement, voir src/lib/billing/founders.ts). La personne demande
// l'accès immédiat et renonce à son droit de rétractation (case
// obligatoire, horodatée dans les métadonnées du paiement), comme pour les
// recharges Rétention. La session expire après 30 minutes (minimum de
// Stripe) : une place n'est jamais bloquée longtemps.
const bodySchema = z.object({
  waiveWithdrawal: z.literal(true, { errorMap: () => ({ message: "Cochez la case pour profiter de Pro tout de suite." }) })
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isBillingEnabled()) return NextResponse.json({ error: "Les paiements ne sont pas encore ouverts sur ce site." }, { status: 503 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides." }, { status: 400 });

  const eligibility = await founderEligibility(userId);
  if (!eligibility.premium) return NextResponse.json({ error: eligibility.premiumBlocked ?? "Offre indisponible." }, { status: 409 });

  const [subscription, user] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId }, select: { stripeCustomerId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  ]);
  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const metadata = { userId, kind: FOUNDER_PREMIUM_KIND, months: String(FOUNDER_PREMIUM.months), waivedWithdrawalAt: new Date().toISOString() };

  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [founderPremiumLineItem()],
    client_reference_id: userId,
    customer: subscription?.stripeCustomerId || undefined,
    customer_email: subscription?.stripeCustomerId ? undefined : user?.email ?? undefined,
    metadata,
    payment_intent_data: { metadata },
    invoice_creation: { enabled: true, invoice_data: { description: `Nebula Fondateur Premium : Pro 1 marque pendant ${FOUNDER_PREMIUM.months} mois, paiement unique sans renouvellement.`, metadata } },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${appUrl}/billing?founder=success`,
    cancel_url: `${appUrl}/billing?founder=cancel`
  });
  await trackGrowth("checkout_started", { plan: "FOUNDER_PREMIUM", interval: "once", maxBrands: FOUNDER_PREMIUM.maxBrands }, userId);
  return NextResponse.json({ url: checkout.url });
}
