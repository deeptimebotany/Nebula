import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail, escapeHtml } from "@/lib/email";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { consumeRateLimit, clientIpFromHeaders, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { SITE_CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

// POST /api/contact — formulaire public de la page /contact : envoie le
// message par email à l'adresse de contact du site (Resend, déjà utilisé pour
// les emails de mot de passe), avec l'adresse du visiteur en « Répondre à ».
// Protections : limite par IP, vérification anti-robot Turnstile (si
// configurée), longueurs bornées, contenu échappé.
const schema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(80),
  email: z.string().trim().email("Adresse email invalide."),
  subject: z.enum(["question", "tarifs", "support", "partenariat", "autre"]),
  message: z.string().trim().min(20, "Décrivez votre demande en quelques phrases (20 caractères minimum).").max(4000),
  turnstileToken: z.string().optional(),
  // Champ « piège » invisible pour les humains : un robot qui le remplit
  // est ignoré silencieusement.
  website: z.string().max(0).optional()
});

const SUBJECT_LABELS: Record<z.infer<typeof schema>["subject"], string> = {
  question: "Question générale",
  tarifs: "Tarifs et abonnement",
  support: "Aide sur mon compte",
  partenariat: "Partenariat / presse",
  autre: "Autre"
};

export async function POST(req: NextRequest) {
  const rate = await consumeRateLimit("contact", clientIpFromHeaders(req.headers), 5, 60);
  if (!rate.ok) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Formulaire incomplet.";
    return NextResponse.json({ error: first }, { status: 400 });
  }
  const { name, email, subject, message, turnstileToken, website } = parsed.data;
  if (website) return NextResponse.json({ ok: true }); // robot : on fait semblant

  const humanVerified = await verifyTurnstileToken(turnstileToken);
  if (!humanVerified) {
    return NextResponse.json({ error: "Vérification anti-robot échouée, réessayez." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: `L'envoi depuis le site n'est pas encore activé. Écrivez-nous directement à ${SITE_CONTACT_EMAIL}.` },
      { status: 503 }
    );
  }

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
      <p><strong>Nouveau message depuis le formulaire de contact ${escapeHtml(SITE_NAME)}</strong></p>
      <p><strong>De :</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;<br/>
         <strong>Sujet :</strong> ${escapeHtml(SUBJECT_LABELS[subject])}</p>
      <p style="white-space:pre-wrap;border-left:3px solid #8646ff;padding-left:12px">${escapeHtml(message)}</p>
    </div>`;

  const result = await sendEmail({
    to: SITE_CONTACT_EMAIL,
    subject: `[${SITE_NAME}] ${SUBJECT_LABELS[subject]} — ${name}`,
    html,
    replyTo: email
  });

  if (!result.ok) {
    console.error("[contact] envoi impossible :", result.error);
    return NextResponse.json(
      { error: `Impossible d'envoyer le message pour le moment. Écrivez-nous directement à ${SITE_CONTACT_EMAIL}.` },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
