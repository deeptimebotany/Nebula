import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

  const asset = await prisma.mediaAsset.update({
    where: { id: params.id },
    data: { thumbnailUrl: parsed.data.thumbnailUrl }
  });
  return NextResponse.json({ asset });
}
