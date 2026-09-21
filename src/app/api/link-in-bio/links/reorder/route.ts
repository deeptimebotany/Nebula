import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { assertBrandMembership } from "@/lib/link-in-bio";

// POST /api/link-in-bio/links/reorder { brandId, orderedIds } — réécrit le
// champ "order" de chaque lien selon sa position dans orderedIds (déplacé
// via les flèches ↑/↓ de l'éditeur, voir /link-in-bio). orderedIds doit
// contenir EXACTEMENT les ids déjà présents sur la page de cette marque,
// sans quoi la requête est refusée (évite qu'un id d'une autre marque ne
// soit glissé dans la liste).
const bodySchema = z.object({
  brandId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1)
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const { brandId, orderedIds } = parsed.data;

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  const linkPage = await prisma.linkPage.findUnique({ where: { brandId }, include: { links: true } });
  if (!linkPage) return NextResponse.json({ error: "Page introuvable." }, { status: 404 });

  const existingIds = new Set(linkPage.links.map((l: { id: string }) => l.id));
  const sameSet = orderedIds.length === existingIds.size && orderedIds.every((id) => existingIds.has(id));
  if (!sameSet) return NextResponse.json({ error: "Liste de liens invalide." }, { status: 400 });

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.linkItem.update({ where: { id }, data: { order: index } }))
  );

  return NextResponse.json({ ok: true });
}
