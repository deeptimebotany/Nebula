import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EMAIL_VERIFY_RESEND_COOLDOWN_MS } from "@/lib/account-security";

export const dynamic = "force-dynamic";

// GET /api/auth/verify-email/status — l'adresse est-elle confirmée ?
// Interrogé toutes les 10 s par le bandeau pendant l'attente (01/10/2026) :
// un clic sur le lien depuis un autre onglet ou le téléphone fait
// disparaître le bandeau ici aussi. Lecture légère, aucune donnée sensible.
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, emailVerifySentAt: true } });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  const sentAt = user.emailVerifySentAt;
  return NextResponse.json(
    {
      verified: Boolean(user.emailVerifiedAt),
      sentAt: sentAt?.toISOString() ?? null,
      nextResendAt: sentAt ? new Date(sentAt.getTime() + EMAIL_VERIFY_RESEND_COOLDOWN_MS).toISOString() : null
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
