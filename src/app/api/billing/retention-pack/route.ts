import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/billing/stripe";
import { getUserPlan } from "@/lib/billing/plan";
import { RETENTION_PACK } from "@/lib/plans";
import { RETENTION_PACK_KIND, RETENTION_PACK_LABEL, retentionPackAvailable, retentionPackPriceId } from "@/lib/billing/retention-pack";

// POST /api/billing/retention-pack — ouvre Stripe Checkout pour une recharge
// Rétention (paiement unique, voir src/lib/billing/retention-pack.ts).
// La personne doit avoir demandé l'accès immédiat et renoncé à son droit de
// rétractation (contenu numérique fourni tout de suite) : case à cocher
// obligatoire, horodatée dans les métadonnées du paiement.
const bodySchema = z.object({
  waiveWithdrawal: z.literal(true, { errorMap: () => ({ message: "Cochez la case pour utiliser les analyses tout de suite." }) }),
  returnTo: z.enum(["retention", "billing"]).optional()
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!retentionPackAvailable()) {
    return NextResponse.json({ error: "Les recharges Rétention ne sont pas encore ouvertes sur ce site." }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides." }, { status: 400 });

  const info = await getUserPlan(userId);
  if (!info.limits.retentionPacks) {
    return NextResponse.json({ error: "Les recharges Rétention sont réservées aux paliers Pro et Agence.", reason: "retention", plan: info.plan }, { status: 402 });
  }

  const [subscription, user] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId }, select: { stripeCustomerId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  ]);
  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  // Retour : Facturation, ou l'onglet Rétention IA d'Analytics (09/10/2026).
  const back = parsed.data.returnTo === "billing" ? "/billing?" : "/analytics?tab=retention&";
  const metadata = { userId, kind: RETENTION_PACK_KIND, credits: String(RETENTION_PACK.credits), waivedWithdrawalAt: new Date().toISOString() };

  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: retentionPackPriceId()!, quantity: 1 }],
    client_reference_id: userId,
    customer: subscription?.stripeCustomerId || undefined,
    customer_email: subscription?.stripeCustomerId ? undefined : user?.email ?? undefined,
    metadata,
    payment_intent_data: { metadata },
    // Facture envoyée par Stripe (utile aux agences et indépendants).
    invoice_creation: { enabled: true, invoice_data: { description: `Recharge Rétention Nebula : ${RETENTION_PACK_LABEL}, sans date limite.`, metadata } },
    success_url: `${appUrl}${back}recharge=success`,
    cancel_url: `${appUrl}${back}recharge=cancel`
  });
  return NextResponse.json({ url: checkout.url });
}
