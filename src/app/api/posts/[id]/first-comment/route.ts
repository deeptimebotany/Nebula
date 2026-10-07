import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { retryFirstCommentNow } from "@/lib/first-comment";

// POST /api/posts/[id]/first-comment { targetId } — « Réessayer » le premier
// commentaire sur un réseau (fiche de la publication, 07/10/2026) : après
// une reconnexion du compte, une vidéo repassée en public… Seulement pour
// une publication en ligne dont le commentaire a échoué ou n'était pas
// possible (voir src/lib/first-comment.ts).
export const dynamic = "force-dynamic";

const bodySchema = z.object({ targetId: z.string().min(1).max(40) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const target = await prisma.postTarget.findFirst({
    where: { id: parsed.data.targetId, postId: params.id, post: { brand: ownedBy(userId) } },
    select: { id: true }
  });
  if (!target) return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });

  const result = await retryFirstCommentNow(target.id);
  if (!result.status) return NextResponse.json({ error: result.error ?? "Rien à réessayer." }, { status: 409 });
  return NextResponse.json(result);
}
