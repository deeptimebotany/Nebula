import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTrialSummary } from "@/lib/billing/trial-summary";

// Essai Pro (brief growth, lot G2.a).
//   GET  → récapitulatif de ce qui a été utilisé pendant l'essai (pour la
//          modale « Votre essai Pro est terminé » et l'email trial_ends_48h) ;
//   POST → marque la modale de fin d'essai comme vue (une seule fois).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const summary = await computeTrialSummary(userId);
  return NextResponse.json(summary);
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  await prisma.user.updateMany({ where: { id: userId, trialEndedNoticeAt: null }, data: { trialEndedNoticeAt: new Date() } });
  return NextResponse.json({ ok: true });
}
