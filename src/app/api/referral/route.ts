import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode, hasActiveReferralTrial } from "@/lib/referral";

// GET /api/referral — renvoie le code de parrainage du compte connecté, en
// le générant à la volée pour les comptes créés avant l'ajout de cette
// fonctionnalité (referralCode est nullable exprès pour ça, voir
// schema.prisma).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true, aiTrialUntil: true, referredByCode: true }
  });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  if (!user.referralCode) {
    const code = await generateUniqueReferralCode();
    await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
    user = { ...user, referralCode: code };
  }

  return NextResponse.json({
    code: user.referralCode,
    referredByCode: user.referredByCode,
    aiTrialActive: hasActiveReferralTrial(user.aiTrialUntil),
    aiTrialUntil: user.aiTrialUntil
  });
}
