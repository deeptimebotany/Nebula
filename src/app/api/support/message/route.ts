import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { deliverContactMessage } from "@/lib/contact-message";
import { SUPPORT_MESSAGE_KINDS, SUPPORT_MESSAGE_MAX, SUPPORT_MESSAGE_MIN, supportMessageSubject } from "@/lib/support-message";

// POST /api/support/message — « Écrire à l'équipe » de la page Soutenir
// Nebula (10/10/2026, demande de Lucas : un endroit, une fois connecté, pour
// envoyer un message aux créateurs du site, sans payer). Même circuit que le
// formulaire public /contact (src/lib/contact-message.ts) ; l'adresse du
// compte sert de « Répondre à ». 5 messages par heure au plus.
const schema = z.object({
  kind: z.enum(SUPPORT_MESSAGE_KINDS),
  message: z.string().trim().min(SUPPORT_MESSAGE_MIN, "Écrivez votre message en quelques mots (10 caractères au moins).").max(SUPPORT_MESSAGE_MAX)
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const rate = await consumeRateLimit("support-message", userId, 5, 60);
  if (!rate.ok) return NextResponse.json({ error: "Plusieurs messages envoyés en peu de temps : réessayez dans une heure." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Message incomplet." }, { status: 400 });

  const user = (await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, handle: true } })) as { email: string | null; name: string | null; handle: string | null } | null;
  if (!user?.email) return NextResponse.json({ error: "Adresse e-mail du compte introuvable." }, { status: 400 });
  const name = [user.name?.trim(), user.handle ? `@${user.handle}` : null].filter(Boolean).join(" · ") || user.email;
  const delivered = await deliverContactMessage({
    name,
    email: user.email,
    subject: supportMessageSubject(parsed.data.kind),
    message: parsed.data.message,
    source: "depuis l'application (Soutenir Nebula)"
  });
  if (!delivered.ok) return NextResponse.json({ error: delivered.error }, { status: delivered.status });
  return NextResponse.json({ ok: true });
}
