import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const video = await prisma.sharedVideo.findUnique({ where: { id: params.id } });
  if (!video) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (video.authorId !== userId) {
    return NextResponse.json({ error: "Vous ne pouvez retirer que vos propres partages." }, { status: 403 });
  }

  await prisma.sharedVideo.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
