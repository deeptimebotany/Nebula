import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyPremiumInfo } from "@/lib/premium-server";
import { canReadThread } from "@/lib/community-access";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  const thread = await prisma.forumThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Discussion introuvable" }, { status: 404 });

  const userId = (session.user as { id: string }).id;

  // Impossible de répondre à un thread qu'on n'a pas le droit de voir (salon
  // VIP réservé Premium, actualité pas encore publique pour ce compte).
  const premium = await getMyPremiumInfo(userId);
  if (!canReadThread(thread, premium)) {
    return NextResponse.json({ error: "Ce contenu est réservé aux membres Premium pour le moment." }, { status: 403 });
  }

  const reply = await prisma.forumReply.create({
    data: {
      threadId: params.id,
      authorId: userId,
      body: body.trim().slice(0, 3000)
    },
    include: { author: { select: { id: true, name: true } } }
  });

  return NextResponse.json({ ok: true, reply });
}
