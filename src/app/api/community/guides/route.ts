import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Contenu géré par prisma/seed.ts (voir le guide "Nebula pour les débutants
// absolus"). Simple lecture ici, aucune écriture utilisateur.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const guides = await prisma.guide.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ guides });
}
