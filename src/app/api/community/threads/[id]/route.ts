import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyPremiumInfo } from "@/lib/premium-server";
import { canReadThread } from "@/lib/community-access";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const thread = await prisma.forumThread.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { id: true, name: true, subscription: { select: { plan: true, status: true, createdAt: true } } } },
      reactions: { select: { emoji: true, userId: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, subscription: { select: { plan: true, status: true, createdAt: true } } } },
          reactions: { select: { emoji: true, userId: true } }
        }
      }
    }
  });
  if (!thread) return NextResponse.json({ error: "Discussion introuvable" }, { status: 404 });

  const premium = await getMyPremiumInfo(userId);
  if (!canReadThread(thread, premium)) {
    return NextResponse.json(
      { error: "Ce contenu est réservé aux membres Premium pour le moment." },
      { status: 403 }
    );
  }

  return NextResponse.json({ thread });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const thread = await prisma.forumThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Discussion introuvable" }, { status: 404 });
  if (thread.authorId !== userId) {
    return NextResponse.json({ error: "Vous ne pouvez supprimer que vos propres discussions." }, { status: 403 });
  }

  await prisma.forumThread.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
