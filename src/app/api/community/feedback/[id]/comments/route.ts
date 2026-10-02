import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { commentFeedback } from "@/lib/community/feedback";
import { refreshReussites } from "@/lib/reussites/engine";
import { FEEDBACK_COMMENT_MAX } from "@/lib/community/feedback-rules";

// POST { body } — un avis écrit sous une demande ouverte (500 caractères,
// 30 par heure). Compte pour l'entraide dans Réussites.
const bodySchema = z.object({ body: z.string().max(FEEDBACK_COMMENT_MAX * 2) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Avis trop long : ${FEEDBACK_COMMENT_MAX} caractères au plus.` }, { status: 400 });
  const rate = await consumeRateLimit("feedback-comment", userId, 30, 60);
  if (!rate.ok) return NextResponse.json({ error: "Beaucoup d'avis d'un coup : réessayez dans un moment." }, { status: 429 });
  const result = await commentFeedback(userId, params.id, parsed.data.body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await refreshReussites(userId).catch(() => undefined);
  return NextResponse.json({ ok: true, comment: result.comment });
}
