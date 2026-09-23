import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({ thumbnailUrl: z.string() });

// PATCH /api/media/[id] { thumbnailUrl } — enregistre la miniature choisie
// (frame extraite ou uploadée) pour ce média.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Le média doit appartenir à une des marques de l'utilisateur.
  const userId = (session.user as { id: string }).id;
  const owned = await prisma.mediaAsset.findFirst({ where: { id: params.id, brand: ownedBy(userId) }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  const asset = await prisma.mediaAsset.update({
    where: { id: owned.id },
    data: { thumbnailUrl: parsed.data.thumbnailUrl }
  });
  return NextResponse.json({ asset });
}
