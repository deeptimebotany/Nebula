import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canModerate, deleteCommunityContent, reportedKeys } from "@/lib/community/moderation";
import { getFeedback } from "@/lib/community/feedback";

// GET : une demande d'avis avec ses commentaires. DELETE : son auteur ou la
// modération (images supprimées avec elle). Voir lib/community/feedback.ts.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const request = await getFeedback(userId, params.id);
  if (!request) return NextResponse.json({ error: "Demande d'avis introuvable." }, { status: 404 });
  const reported = await reportedKeys(userId, [
    { type: "FEEDBACK" as const, id: request.id },
    ...(request.comments ?? []).map((c) => ({ type: "FEEDBACK_COMMENT" as const, id: c.id }))
  ]);
  return NextResponse.json({ request, viewer: { canModerate: canModerate(session.user.email), reported } });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const result = await deleteCommunityContent({ userId: (session.user as { id: string }).id, email: session.user.email }, "FEEDBACK", params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
