import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";

// POST /api/billing/portal — ouvre le portail client Stripe (changer de
// carte, annuler, voir les factures) pour le compte de l'utilisateur
// connecté (l'abonnement est rattaché au compte, pas à une marque).
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isBillingEnabled()) {
    return NextResponse.json({ error: "La facturation n'est pas configurée sur cette instance." }, { status: 503 });
  }

  const userId = (session.user as { id: string }).id;
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  if (!subscription?.stripeCustomerId) {
    return NextResponse.json({ error: "Aucun abonnement Stripe actif pour ce compte." }, { status: 400 });
  }

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const portalSession = await stripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/billing`
  });

  return NextResponse.json({ url: portalSession.url });
}
