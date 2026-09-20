import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyPremiumInfo } from "@/lib/premium-server";
import { isAdminEmail } from "@/lib/admin";
import { canReadThread, canCreateInCategory } from "@/lib/community-access";

// Forum public Nebula — pas de scoping par marque : visible et utilisable par
// tout compte connecté. category : "GENERAL" | "AIDE" | "SUGGESTIONS" |
// "SHOWCASE" | "VIP" | "ACTUALITES" (voir src/lib/community-access.ts pour
// les règles de visibilité/écriture des deux dernières).

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const category = req.nextUrl.searchParams.get("category");

  const threads = await prisma.forumThread.findMany({
    where: category ? { category } : undefined,
    include: {
      author: { select: { id: true, name: true, subscription: { select: { plan: true, status: true, createdAt: true } } } },
      reactions: { select: { emoji: true, userId: true } },
      _count: { select: { replies: true } }
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }]
  });

  // Filtrage VIP/accès anticipé après lecture (petit volume, pas besoin
  // d'optimiser côté requête) : évite de dupliquer la logique de
  // src/lib/community-access.ts dans une clause `where` Prisma.
  const premium = await getMyPremiumInfo(userId);
  const visible = threads.filter((t: { category: string; publicAt: Date | null }) => canReadThread(t, premium));

  return NextResponse.json({ threads: visible });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { title, body, category, publicInHours } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Titre et message requis." }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  const email = (session.user as { email?: string } | undefined)?.email;
  const resolvedCategory = ["GENERAL", "AIDE", "SUGGESTIONS", "SHOWCASE", "VIP", "ACTUALITES"].includes(category)
    ? category
    : "GENERAL";

  const premium = await getMyPremiumInfo(userId);
  const isAdmin = isAdminEmail(email);
  const check = canCreateInCategory(resolvedCategory, premium, isAdmin);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 403 });

  // Actualités : accès anticipé Premium pendant `publicInHours` heures (48h
  // par défaut) — au-delà, le thread devient visible par tout le monde.
  const publicAt =
    resolvedCategory === "ACTUALITES"
      ? new Date(Date.now() + Math.max(0, Number(publicInHours) || 48) * 60 * 60 * 1000)
      : null;

  const thread = await prisma.forumThread.create({
    data: {
      authorId: userId,
      title: title.trim().slice(0, 160),
      body: body.trim().slice(0, 5000),
      category: resolvedCategory,
      publicAt
    }
  });

  return NextResponse.json({ ok: true, thread });
}
