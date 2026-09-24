import { refreshReussites } from "@/lib/reussites/engine";
import { AUTHOR_SELECT, publicAuthor } from "@/lib/reussites/public-author";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  const thread = await prisma.forumThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Discussion introuvable" }, { status: 404 });

  const userId = (session.user as { id: string }).id;
  const reply = await prisma.forumReply.create({
    data: {
      threadId: params.id,
      authorId: userId,
      body: body.trim().slice(0, 3000)
    },
    include: { author: { select: AUTHOR_SELECT } }
  });

  // Réussites : « Voix de la communauté » et le défi « Aider quelqu'un ».
  await refreshReussites(userId);
  return NextResponse.json({ ok: true, reply: { ...reply, author: publicAuthor(reply.author) } });
}
