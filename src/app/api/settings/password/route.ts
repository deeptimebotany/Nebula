import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { forgetSessionCache, publicAppUrl } from "@/lib/account-security";
import { sendPasswordChangedEmail } from "@/lib/email";
import { passwordTooLong } from "@/lib/password-rules";

const schema = z.object({
  currentPassword: z.string().max(200).optional().default(""),
  newPassword: z
    .string()
    .min(8, "Le nouveau mot de passe doit faire au moins 8 caractères.")
    .refine((v) => !passwordTooLong(v), "Le nouveau mot de passe est trop long (72 caractères au plus).")
});

// POST /api/settings/password { currentPassword?, newPassword } — définir ou
// changer le mot de passe depuis Paramètres → Compte, pour un compte connecté
// (distinct de « mot de passe oublié », qui passe par un lien reçu par e-mail).
//
// 29/09/2026 (« le changement de mot de passe ne fonctionne pas ») :
//  - un compte ouvert avec Google / Apple / Facebook n'a pas de mot de passe :
//    il en DÉFINIT un sans « mot de passe actuel » (avant, le champ était
//    obligatoire à l'écran et la demande ne partait pas) ;
//  - 5 essais par quart d'heure (le mot de passe actuel ne se devine pas à
//    la chaîne) ;
//  - les autres sessions sont coupées (sessionVersion) et une alerte part
//    par e-mail ; l'écran rouvre aussitôt la session en cours avec le
//    nouveau mot de passe (voir account-privacy-card.tsx).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const rate = await consumeRateLimit("password-change", userId, 5, 15);
  if (!rate.ok) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Nouveau mot de passe invalide." }, { status: 400 });
  }
  const { currentPassword, newPassword } = body.data;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, passwordHash: true } });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const firstTime = !user.passwordHash;
  if (user.passwordHash) {
    if (!currentPassword) return NextResponse.json({ error: "Saisissez votre mot de passe actuel." }, { status: 400 });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 });
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return NextResponse.json({ error: "Choisissez un mot de passe différent de l'actuel." }, { status: 400 });
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      // Un lien « mot de passe oublié » encore valide ne doit plus servir.
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
      // Coupe toutes les sessions ouvertes, y compris celle-ci : l'écran la
      // rouvre tout de suite avec le nouveau mot de passe.
      sessionVersion: { increment: 1 }
    }
  });
  forgetSessionCache(userId);

  await sendPasswordChangedEmail(user.email, { firstTime, forgotUrl: `${publicAppUrl()}/forgot-password` }).catch(() => undefined);

  return NextResponse.json({ ok: true, email: user.email, firstTime });
}
