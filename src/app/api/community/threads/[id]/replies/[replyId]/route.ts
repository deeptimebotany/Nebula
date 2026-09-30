import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteCommunityContent } from "@/lib/community/moderation";

// DELETE /api/community/threads/[id]/replies/[replyId] — l'auteur de la
// réponse, ou le propriétaire du site (modération, 30/09/2026).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; replyId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const reply = await prisma.forumReply.findUnique({ where: { id: params.replyId }, select: { threadId: true } });
  if (!reply || reply.threadId !== params.id) return NextResponse.json({ error: "Réponse introuvable." }, { status: 404 });
  const result = await deleteCommunityContent({ userId: (session.user as { id: string }).id, email: session.user.email }, "REPLY", params.replyId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
