import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { deleteCommunityContent } from "@/lib/community/moderation";
import { markFeedbackHelpful } from "@/lib/community/feedback";
import { refreshReussites } from "@/lib/reussites/engine";

// PATCH { helpful } — l'auteur de la demande marque (ou démarque) un avis
// « Cet avis m'a aidé » (Réussites v3, 02/10/2026). Les Réussites de celui
// qui l'a écrit sont actualisées tout de suite (« Avis utiles »).
const patchSchema = z.object({ helpful: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const rate = await consumeRateLimit("feedback-helpful", userId, 60, 60);
  if (!rate.ok) return NextResponse.json({ error: "Beaucoup de changements d'un coup : réessayez dans un moment." }, { status: 429 });
  const result = await markFeedbackHelpful(userId, params.id, params.commentId, parsed.data.helpful);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await refreshReussites(result.commentAuthorId).catch(() => undefined);
  return NextResponse.json({ ok: true, helpful: result.helpful });
}

// DELETE — son auteur ou la modération retire un avis écrit.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const result = await deleteCommunityContent({ userId: (session.user as { id: string }).id, email: session.user.email }, "FEEDBACK_COMMENT", params.commentId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
