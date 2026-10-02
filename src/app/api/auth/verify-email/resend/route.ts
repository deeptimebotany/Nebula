import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EMAIL_VERIFY_RESEND_COOLDOWN_MS, sendVerificationEmail } from "@/lib/account-security";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/auth/verify-email/resend — renvoie le lien de confirmation de
// l'adresse (bandeau « Confirmez votre adresse », fenêtre d'offre, outils).
//
// Anti-spam (01/10/2026) :
//  - une minute au moins entre deux envois, réservée de façon atomique (deux
//    clics simultanés n'envoient qu'un e-mail) ; la réponse donne la date
//    du prochain envoi possible, pour le décompte du bouton ;
//  - 3 renvois par heure au plus ;
//  - le lien renvoyé est le même tant qu'il reste valable (voir
//    sendVerificationEmail) : tous les e-mails reçus fonctionnent.
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerifiedAt: true, emailVerifySentAt: true } });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  // Délai entre deux envois : réservé d'un coup (updateMany conditionnel).
  const now = new Date();
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ emailVerifySentAt: null }, { emailVerifySentAt: { lte: new Date(now.getTime() - EMAIL_VERIFY_RESEND_COOLDOWN_MS) } }] },
    data: { emailVerifySentAt: now }
  });
  if (claimed.count === 0) {
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerifySentAt: true } });
    const next = new Date((fresh?.emailVerifySentAt ?? now).getTime() + EMAIL_VERIFY_RESEND_COOLDOWN_MS);
    const seconds = Math.max(1, Math.ceil((next.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: `Un lien vient de partir : attendez ${seconds} s avant d'en demander un autre (pensez aux spams).`, reason: "cooldown", nextResendAt: next.toISOString(), sentAt: fresh?.emailVerifySentAt?.toISOString() ?? null },
      { status: 429 }
    );
  }
  const restore = () => prisma.user.update({ where: { id: user.id }, data: { emailVerifySentAt: user.emailVerifySentAt } }).catch(() => undefined);

  const rate = await consumeRateLimit("verify-email-resend", user.id, 3, 60);
  if (!rate.ok) {
    await restore();
    const minutes = Math.max(1, Math.ceil(rate.retryAfterSeconds / 60));
    return NextResponse.json(
      {
        error: `Trois liens déjà envoyés cette heure-ci : réessayez dans ${minutes} min. Le dernier lien reçu reste valable.`,
        reason: "hourly",
        nextResendAt: new Date(Date.now() + rate.retryAfterSeconds * 1000).toISOString(),
        sentAt: user.emailVerifySentAt?.toISOString() ?? null
      },
      { status: 429 }
    );
  }

  const sent = await sendVerificationEmail(user);
  if (!sent.ok) {
    await restore();
    return NextResponse.json({ error: "L'e-mail n'a pas pu partir. Réessayez plus tard." }, { status: 502 });
  }
  const sentAt = sent.sentAt ?? now;
  return NextResponse.json({
    ok: true,
    sentAt: sentAt.toISOString(),
    nextResendAt: new Date(sentAt.getTime() + EMAIL_VERIFY_RESEND_COOLDOWN_MS).toISOString(),
    expiresAt: sent.expiresAt?.toISOString() ?? null
  });
}
