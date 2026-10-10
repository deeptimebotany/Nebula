import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TURNSTILE_FAILED_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { consumeRateLimit, clientIpFromHeaders, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { deliverContactMessage } from "@/lib/contact-message";

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

  // Enregistrement, alerte du propriétaire et copie par e-mail : src/lib/contact-message.ts.
  const delivered = await deliverContactMessage({ name, email, subject: SUBJECT_LABELS[subject], message });
  if (!delivered.ok) return NextResponse.json({ error: delivered.error }, { status: delivered.status });
  return NextResponse.json({ ok: true });
}
