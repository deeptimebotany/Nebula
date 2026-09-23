import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { trackGrowth } from "@/lib/growth";
import { WELCOME_OFFER_HOURS, isOfferActive } from "@/lib/trial";

// POST /api/billing/offer — démarre l'offre unique de bienvenue (-50 % sur
// le premier mois, 48 h) à la première ouverture d'une modale de mise à
// niveau par un compte dont l'essai est terminé (ou qui n'en a pas eu).
// Une seule offre par compte, jamais renouvelée, jamais pour un compte
// payant ou en essai. Renvoie l'état courant de l'offre dans tous les cas.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const [info, user] = await Promise.all([
    getUserPlan(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { offerExpiresAt: true, offerUsedAt: true, firstPaidAt: true } })
  ]);
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const configured = Boolean(process.env.STRIPE_FIRST_MONTH_COUPON);
  if (info.paid || info.onTrial || user.firstPaidAt || user.offerUsedAt || !configured) {
    return NextResponse.json({ offerExpiresAt: null, configured });
  }
  if (!user.offerExpiresAt) {
    const offerExpiresAt = new Date(Date.now() + WELCOME_OFFER_HOURS * 60 * 60 * 1000);
    await prisma.user.update({ where: { id: userId }, data: { offerExpiresAt } });
    await trackGrowth("offer_started", {}, userId);
    return NextResponse.json({ offerExpiresAt: offerExpiresAt.toISOString(), configured });
  }
  return NextResponse.json({ offerExpiresAt: isOfferActive(user.offerExpiresAt, user.offerUsedAt) ? user.offerExpiresAt.toISOString() : null, configured });
}
