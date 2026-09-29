import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail, escapeHtml } from "@/lib/email";
import { TURNSTILE_FAILED_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { consumeRateLimit, clientIpFromHeaders, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { SITE_CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { alertOwner } from "@/lib/owner-alerts";
import { OWNER_EMAIL } from "@/lib/owner";

// POST /api/contact — formulaire public de la page /contact.
// 29/09/2026 : le message est d'abord ENREGISTRÉ en base (ContactMessage,
// lu dans /admin/messages) et signalé dans la cloche du propriétaire ; l'e-mail
// (Resend, adresse du visiteur en « Répondre à ») n'est plus qu'un plus. Avant,
// un envoi Resend impossible (clé absente, domaine non vérifié, boîte de
// réception inexistante) faisait perdre le message.
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
  // (29/09/2026 : avant, `max(0)` le refusait en 400 — le robot savait
  // qu'il était repéré.)
  website: z.string().max(500).optional()
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
    return NextResponse.json({ error: TURNSTILE_FAILED_MESSAGE }, { status: 400 });
  }

  let saved: { id: string };
  try {
    saved = await prisma.contactMessage.create({ data: { name, email, subject: SUBJECT_LABELS[subject], message }, select: { id: true } });
  } catch (err) {
    console.error("[contact] enregistrement impossible :", (err as Error).message);
    return NextResponse.json(
      { error: `Impossible d'enregistrer le message pour le moment. Écrivez-nous directement à ${SITE_CONTACT_EMAIL}.` },
      { status: 503 }
    );
  }

  await alertOwner({
    title: `Nouveau message : ${SUBJECT_LABELS[subject]}`,
    body: `${name} (${email}) : ${message.length > 180 ? `${message.slice(0, 180)}…` : message}`,
    dedupeKey: `contact:${saved.id}`,
    href: "/admin/messages",
    actionLabel: "Lire le message"
  });

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
      <p><strong>Nouveau message depuis le formulaire de contact ${escapeHtml(SITE_NAME)}</strong></p>
      <p><strong>De :</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;<br/>
         <strong>Sujet :</strong> ${escapeHtml(SUBJECT_LABELS[subject])}</p>
      <p style="white-space:pre-wrap;border-left:3px solid #8646ff;padding-left:12px">${escapeHtml(message)}</p>
    </div>`;

  // Copie par e-mail au propriétaire (CONTACT_INBOX_EMAIL si renseignée) :
  // l'adresse affichée sur le site peut ne pas avoir de boîte de réception,
  // et l'expéditeur de test de Resend n'écrit qu'au titulaire du compte.
  const result = await sendEmail({
    to: process.env.CONTACT_INBOX_EMAIL?.trim() || OWNER_EMAIL,
    subject: `[${SITE_NAME}] ${SUBJECT_LABELS[subject]} — ${name}`,
    html,
    replyTo: email
  });
  if (result.ok) {
    await prisma.contactMessage.update({ where: { id: saved.id }, data: { emailSent: true } }).catch(() => undefined);
  } else {
    // Le message est enregistré et signalé dans la cloche : rien n'est perdu.
    console.error("[contact] copie par e-mail impossible :", result.error);
  }
  return NextResponse.json({ ok: true });
}
