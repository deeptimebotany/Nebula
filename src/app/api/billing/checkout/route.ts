import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";
import { PLAN_LIMITS, findTier, type Plan, type BillingInterval } from "@/lib/plans";
import { z } from "zod";

const bodySchema = z.object({
  plan: z.enum(["PRO", "AGENCY"]),
  interval: z.enum(["month", "year"]).default("month"),
  maxBrands: z.number().int().positive()
});

// POST /api/billing/checkout — crée une session Stripe Checkout pour
// souscrire (ou changer vers) un palier payant et un nombre de marques
// donné, mensuel ou annuel au choix, et renvoie son URL. L'abonnement est
// rattaché au COMPTE de l'utilisateur connecté, pas à une marque précise.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: "La facturation n'est pas configurée sur cette instance (STRIPE_SECRET_KEY manquant)." },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { plan, interval, maxBrands } = parsed.data;

  const limits = PLAN_LIMITS[plan as Plan];
  const tier = findTier(plan as Plan, maxBrands);
  if (!tier) {
    return NextResponse.json({ error: "Palier de nombre de marques invalide pour ce plan." }, { status: 400 });
  }
  const envVar = tier.stripePriceEnvVars[interval as BillingInterval];
  const priceId = process.env[envVar];
  if (!priceId) {
    return NextResponse.json(
      {
        error: `${envVar} manquant : créez le tarif "${limits.label} — jusqu'à ${maxBrands} marques" (${interval === "year" ? "annuel" : "mensuel"}) dans le Dashboard Stripe et copiez son Price ID dans .env.`
      },
      { status: 503 }
    );
  }

  const userId = (session.user as { id: string }).id;
  const existing = await prisma.subscription.findUnique({ where: { userId } });

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const client = stripe();

  const checkoutSession = await client.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    customer: existing?.stripeCustomerId || undefined,
    customer_email: !existing?.stripeCustomerId ? session.user.email ?? undefined : undefined,
    subscription_data: { metadata: { userId, plan, interval, maxBrands: String(maxBrands) } },
    metadata: { userId, plan, interval, maxBrands: String(maxBrands) },
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=cancel`
  });

  return NextResponse.json({ url: checkoutSession.url });
}
