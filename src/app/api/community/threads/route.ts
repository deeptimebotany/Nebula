import { refreshReussites } from "@/lib/reussites/engine";
import { AUTHOR_SELECT, publicAuthor } from "@/lib/reussites/public-author";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canModerate, reportedKeys } from "@/lib/community/moderation";

// Forum public Nebula — pas de scoping par marque : visible et utilisable par
// tout compte connecté. category : "GENERAL" | "AIDE" | "SUGGESTIONS" | "SHOWCASE"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const category = req.nextUrl.searchParams.get("category");

  const threads = await prisma.forumThread.findMany({
    where: category ? { category } : undefined,
    include: {
      author: { select: AUTHOR_SELECT },
      _count: { select: { replies: true } }
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }]
  });

  const userId = (session.user as { id: string }).id;
  const reported = await reportedKeys(userId, threads.map((t) => ({ type: "THREAD" as const, id: t.id })));
  // Niveau de créateur et anneau d'avatar (Réussites), sans autre préférence.
  return NextResponse.json({
    threads: threads.map((t) => ({ ...t, author: publicAuthor(t.author) })),
    viewer: { canModerate: canModerate(session.user.email), reported }
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { title, body, category } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Titre et message requis." }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  const thread = await prisma.forumThread.create({
    data: {
      authorId: userId,
      title: title.trim().slice(0, 160),
      body: body.trim().slice(0, 5000),
      category: ["GENERAL", "AIDE", "SUGGESTIONS", "SHOWCASE"].includes(category) ? category : "GENERAL"
    }
  });

  await refreshReussites(userId);
  return NextResponse.json({ ok: true, thread });
}
