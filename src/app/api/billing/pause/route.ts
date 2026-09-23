import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";
import { trackGrowth } from "@/lib/growth";
import { z } from "zod";

// Pause plutôt qu'annulation (brief growth, lot G2.c).
//   POST   { months: 1 | 2 | 3 } → Stripe pause_collection (behavior "void",
//          resumes_at) ; pendant la pause le compte est en Gratuit, les
//          données sont conservées, Stripe reprend seul à la date.
//   DELETE → reprise immédiate (pause_collection retiré).
// Le webhook customer.subscription.updated reflète pause_collection dans
// Subscription.pausedUntil ; on l'écrit aussi ici pour ne pas attendre.
const bodySchema = z.object({ months: z.union([z.literal(1), z.literal(2), z.literal(3)]) });

async function loadSubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeSubscriptionId || sub.plan === "FREE") return null;
  return sub;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isBillingEnabled()) return NextResponse.json({ error: "Facturation non configurée." }, { status: 503 });
  const userId = (session.user as { id: string }).id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Durée de pause invalide (1, 2 ou 3 mois)." }, { status: 400 });

  const sub = await loadSubscription(userId);
  if (!sub) return NextResponse.json({ error: "Aucun abonnement payant à mettre en pause." }, { status: 400 });

  const resumesAt = new Date();
  resumesAt.setMonth(resumesAt.getMonth() + parsed.data.months);
  try {
    await stripe().subscriptions.update(sub.stripeSubscriptionId!, {
      pause_collection: { behavior: "void", resumes_at: Math.floor(resumesAt.getTime() / 1000) }
    });
  } catch (err) {
    return NextResponse.json({ error: `Stripe a refusé la pause : ${(err as Error).message}` }, { status: 502 });
  }
  await prisma.subscription.update({ where: { userId }, data: { pausedUntil: resumesAt } });
  await trackGrowth("subscription_paused", { months: parsed.data.months }, userId);
  return NextResponse.json({ ok: true, pausedUntil: resumesAt.toISOString() });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isBillingEnabled()) return NextResponse.json({ error: "Facturation non configurée." }, { status: 503 });
  const userId = (session.user as { id: string }).id;

  const sub = await loadSubscription(userId);
  if (!sub) return NextResponse.json({ error: "Aucun abonnement à reprendre." }, { status: 400 });
  try {
    await stripe().subscriptions.update(sub.stripeSubscriptionId!, { pause_collection: "" as unknown as undefined });
  } catch (err) {
    return NextResponse.json({ error: `Stripe a refusé la reprise : ${(err as Error).message}` }, { status: 502 });
  }
  await prisma.subscription.update({ where: { userId }, data: { pausedUntil: null } });
  await trackGrowth("subscription_resumed", {}, userId);
  return NextResponse.json({ ok: true });
}
