import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/account-security";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/auth/verify-email/resend — renvoie le lien de confirmation de
// l'adresse (bouton du bandeau « Confirmez votre adresse »). 3 envois par
// heure au plus.
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerifiedAt: true } });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  const rate = await consumeRateLimit("verify-email-resend", user.id, 3, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop d'envois : réessayez dans une heure." }, { status: 429 });

  const sent = await sendVerificationEmail(user);
  if (!sent.ok) return NextResponse.json({ error: "L'e-mail n'a pas pu partir. Réessayez plus tard." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
