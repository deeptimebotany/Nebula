import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashToken, publicAppUrl } from "@/lib/account-security";
import { applyPendingPartnerGrant } from "@/lib/billing/partners";

export const dynamic = "force-dynamic";

// GET /api/auth/verify-email?token=… — lien reçu par e-mail après
// l'inscription (audit sécurité, lot 1, voir lib/account-security.ts).
//
// Il faut être connecté AU COMPTE concerné pour confirmer : si quelqu'un
// avait créé un compte avec votre adresse, cliquer sur le lien reçu par
// erreur ne lui confirme rien (vous n'avez pas son mot de passe).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const base = publicAppUrl();
  const done = (status: string) => NextResponse.redirect(`${base}/dashboard?email=${status}`);

  if (token.length < 20 || token.length > 200) return done("lien-invalide");
  const user = await prisma.user.findUnique({
    where: { emailVerifyTokenHash: hashToken(token) },
    select: { id: true, email: true, emailVerifiedAt: true, emailVerifyTokenExpiresAt: true }
  });
  if (!user) return done("lien-invalide");
  if (!user.emailVerifyTokenExpiresAt || user.emailVerifyTokenExpiresAt.getTime() < Date.now()) return done("lien-expire");

  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (!sessionUserId) {
    const back = `/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    return NextResponse.redirect(`${base}/login?info=confirmer-email&callbackUrl=${encodeURIComponent(back)}`);
  }
  if (sessionUserId !== user.id) return done("autre-compte");

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date(), emailVerifyTokenHash: null, emailVerifyTokenExpiresAt: null }
  });
  // Accès offert en attente pour cette adresse (partenaires) : maintenant
  // que l'adresse est prouvée.
  await applyPendingPartnerGrant(user.id, user.email).catch(() => undefined);
  return done("confirme");
}
