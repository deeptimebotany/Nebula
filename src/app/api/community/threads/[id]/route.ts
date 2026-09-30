import { AUTHOR_SELECT, publicAuthor } from "@/lib/reussites/public-author";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canModerate, deleteCommunityContent, reportedKeys } from "@/lib/community/moderation";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const thread = await prisma.forumThread.findUnique({
    where: { id: params.id },
    include: {
      author: { select: AUTHOR_SELECT },
      replies: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: AUTHOR_SELECT } }
      }
    }
  });
  if (!thread) return NextResponse.json({ error: "Discussion introuvable" }, { status: 404 });
  // Modération (30/09/2026) : contenus déjà signalés par ce compte, et
  // droit de supprimer ceux des autres (propriétaire du site).
  const userId = (session.user as { id: string }).id;
  const reported = await reportedKeys(userId, [{ type: "THREAD", id: thread.id }, ...thread.replies.map((r) => ({ type: "REPLY" as const, id: r.id }))]);
  // Niveau de créateur et anneau d'avatar (Réussites), sans autre préférence.
  return NextResponse.json({
    thread: { ...thread, author: publicAuthor(thread.author), replies: thread.replies.map((r) => ({ ...r, author: publicAuthor(r.author) })) },
    viewer: { canModerate: canModerate(session.user.email), reported }
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Son auteur, ou le propriétaire du site (modération, 30/09/2026).
  const result = await deleteCommunityContent({ userId: (session.user as { id: string }).id, email: session.user.email }, "THREAD", params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
