import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyPremiumInfo } from "@/lib/premium-server";
import { z } from "zod";

const bodySchema = z
  .object({
    threadId: z.string().optional(),
    replyId: z.string().optional(),
    emoji: z.string().min(1).max(64)
  })
  .refine((v) => Boolean(v.threadId) !== Boolean(v.replyId), {
    message: "Précisez soit threadId, soit replyId (un seul des deux)."
  });

// POST /api/community/reactions — bascule (ajoute/retire) une réaction de
// l'utilisateur connecté sur un thread ou une réponse de la Communauté.
// Un emoji standard (caractère Unicode) est ouvert à tout compte connecté.
// Un emoji du pack exclusif Premium (clé PremiumReaction, ex: "gold-fire")
// est vérifié ici même côté serveur — jamais fait confiance à l'affichage
// client — et refusé si le compte n'est pas Premium actif.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { threadId, replyId, emoji } = parsed.data;

  // Une réaction exclusive est identifiée par son préfixe "premium:" (voir
  // reaction-bar.tsx) suivi de la clé PremiumReaction — on vérifie qu'elle
  // existe réellement ET que l'auteur de la réaction est Premium actif.
  if (emoji.startsWith("premium:")) {
    const key = emoji.slice("premium:".length);
    const exists = await prisma.premiumReaction.findUnique({ where: { key } });
    if (!exists) return NextResponse.json({ error: "Réaction exclusive inconnue." }, { status: 400 });

    const premium = await getMyPremiumInfo(userId);
    if (!premium.isPremium) {
      return NextResponse.json(
        { error: "Les réactions dorées sont réservées aux membres Premium (Pro/Agence)." },
        { status: 403 }
      );
    }
  }

  if (threadId) {
    const thread = await prisma.forumThread.findUnique({ where: { id: threadId }, select: { id: true } });
    if (!thread) return NextResponse.json({ error: "Discussion introuvable." }, { status: 404 });
  } else if (replyId) {
    const reply = await prisma.forumReply.findUnique({ where: { id: replyId }, select: { id: true } });
    if (!reply) return NextResponse.json({ error: "Réponse introuvable." }, { status: 404 });
  }

  const existing = await prisma.communityReaction.findFirst({
    where: { userId, emoji, threadId: threadId ?? null, replyId: replyId ?? null }
  });

  if (existing) {
    await prisma.communityReaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ toggled: "removed" });
  }

  await prisma.communityReaction.create({
    data: { userId, emoji, threadId: threadId ?? null, replyId: replyId ?? null }
  });
  return NextResponse.json({ toggled: "added" });
}
