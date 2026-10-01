import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, generateCommentReply } from "@/lib/ai/gemini";
import { gateAppAi } from "@/lib/ai/guard";
import { REPLY_MAX_LENGTH } from "@/lib/social/comment-reply-support";
import { NETWORK_META, type Network } from "@/lib/types";

const bodySchema = z.object({ engagementId: z.string().min(1).max(64), tone: z.enum(["warm", "sober"]).optional() });

// POST /api/ai/comment-reply { engagementId, tone? } — propose une réponse à
// un commentaire reçu (page Commentaires, 01/10/2026). La proposition
// remplit le champ de réponse : rien n'est envoyé sans clic sur « Envoyer ».
// Même quota que les autres textes IA (gateAppAi, type « text »).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  if (!isAiEnabled()) {
    return NextResponse.json({ error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const item = await prisma.engagementItem.findFirst({
    where: { id: parsed.data.engagementId, connection: { brand: { memberships: { some: { userId } } } } },
    include: { connection: { select: { brandId: true, network: true, brand: { select: { name: true } } } } }
  });
  if (!item) return NextResponse.json({ error: "Commentaire introuvable." }, { status: 404 });
  if (!item.text?.trim()) return NextResponse.json({ error: "Ce commentaire n'a pas de texte à qui répondre." }, { status: 400 });

  const gate = await gateAppAi({ userId, brandId: item.connection.brandId, kind: "text" });
  if (!gate.ok) return gate.response;

  const network = item.connection.network as Network;
  try {
    const reply = await gate.allowance.run(() =>
      generateCommentReply({
        brandName: item.connection.brand.name,
        network: NETWORK_META[network]?.label ?? network,
        authorName: item.authorName,
        comment: item.text as string,
        maxLength: REPLY_MAX_LENGTH[network] ?? 500,
        tone: parsed.data.tone
      })
    );
    if (!reply) return NextResponse.json({ error: "L'IA n'a rien proposé : réessayez." }, { status: 502 });
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
