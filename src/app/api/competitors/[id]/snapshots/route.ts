import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  followers: z.number().int().min(0),
  postsCount: z.number().int().min(0).optional()
});

// POST /api/competitors/[id]/snapshots — enregistre un relevé constaté par
// l'utilisateur (nombre d'abonnés public du concurrent, visible sur son
// profil) : la seule façon honnête de suivre un compte tiers sans accès API
// officiel. L'historique de ces relevés dessine la courbe de progression du
// concurrent, à comparer avec la vraie courbe de la marque (Analytics).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const track = await prisma.competitorTrack.findUnique({ where: { id: params.id } });
  if (!track) return NextResponse.json({ error: "Concurrent introuvable" }, { status: 404 });

  const snapshot = await prisma.competitorSnapshot.create({
    data: { trackId: params.id, followers: parsed.data.followers, postsCount: parsed.data.postsCount }
  });

  return NextResponse.json({ ok: true, snapshot });
}
