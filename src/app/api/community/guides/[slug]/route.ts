import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { builtInGuides } from "@/lib/community/guides";

// Un guide : d'abord ceux de l'équipe Nebula (dans le code, 10/10/2026),
// sinon un guide ajouté en base.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const guide = builtInGuides().find((g) => g.slug === params.slug) ?? (await prisma.guide.findUnique({ where: { slug: params.slug } }).catch(() => null));
  if (!guide) return NextResponse.json({ error: "Guide introuvable" }, { status: 404 });
  return NextResponse.json({ guide });
}
