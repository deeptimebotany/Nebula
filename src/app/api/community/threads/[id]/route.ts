import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadThread } from "@/lib/community/forum";
import { canModerate, deleteCommunityContent, reportedKeys } from "@/lib/community/moderation";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  // Sujet, réponses (avec leur fil), j'aime et vote de la personne (10/10/2026).
  const thread = await loadThread(userId, params.id);
  if (!thread) return NextResponse.json({ error: "Discussion introuvable" }, { status: 404 });
  // Modération (30/09/2026) : contenus déjà signalés par ce compte, et
  // droit de supprimer ceux des autres (propriétaire du site).
  const reported = await reportedKeys(userId, [{ type: "THREAD", id: thread.id }, ...thread.replies.map((r) => ({ type: "REPLY" as const, id: r.id }))]);
  return NextResponse.json({ thread, viewer: { canModerate: canModerate(session.user.email), reported } });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Son auteur, ou le propriétaire du site (modération, 30/09/2026).
  const result = await deleteCommunityContent({ userId: (session.user as { id: string }).id, email: session.user.email }, "THREAD", params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
