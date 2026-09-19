import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const guide = await prisma.guide.findUnique({ where: { slug: params.slug } });
  if (!guide) return NextResponse.json({ error: "Guide introuvable" }, { status: 404 });
  return NextResponse.json({ guide });
}
