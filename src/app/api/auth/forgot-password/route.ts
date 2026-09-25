import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generatePasswordResetToken } from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/email";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { consumeRateLimit, clientIpFromHeaders, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { publicAppUrl } from "@/lib/account-security";

const schema = z.object({
  email: z.string().email(),
  turnstileToken: z.string().optional()
});

// POST /api/auth/forgot-password { email } — envoie un email de
// réinitialisation si ce compte existe. Répond TOUJOURS avec le même
// message générique (que le compte existe ou non) pour ne pas révéler
// quels emails sont enregistrés.
export async function POST(req: NextRequest) {
  // Anti-abus : au plus 5 demandes par IP par quart d'heure (chaque demande
  // peut déclencher un email).
  const rate = await consumeRateLimit("forgot-password", clientIpFromHeaders(req.headers), 5, 15);
  if (!rate.ok) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  const { email, turnstileToken } = body.data;

  const humanVerified = await verifyTurnstileToken(turnstileToken);
  if (!humanVerified) {
    return NextResponse.json({ error: "Vérification anti-robot échouée, réessayez." }, { status: 400 });
  }

  const genericResponse = NextResponse.json({
    ok: true,
    message: "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé."
  });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return genericResponse; // on répond pareil, sans révéler l'absence du compte

  const { rawToken, tokenHash, expiresAt } = generatePasswordResetToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: expiresAt }
  });

  // Adresse du site fixe (jamais l'en-tête Host de la requête, qu'un proxy
  // mal configuré laisserait falsifier pour détourner le lien).
  const resetUrl = `${publicAppUrl()}/reset-password?token=${rawToken}`;
  const result = await sendPasswordResetEmail(user.email, resetUrl);

  if (!result.ok) {
    // L'envoi d'email n'est pas configuré ou a échoué : on le dit clairement
    // en dev/aux logs serveur, mais on renvoie quand même la réponse
    // générique au client pour ne pas révéler l'existence du compte.
    console.error("[forgot-password] échec d'envoi d'email:", result.error);
  }

  return genericResponse;
}
