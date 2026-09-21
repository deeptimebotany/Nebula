import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// POST /api/public/link-in-bio/[slug]/click { linkId } — incrémente le
// compteur de clics d'un lien (voir LinkItem.clicks), appelée en
// "fire-and-forget" par la page publique juste avant d'ouvrir l'URL cible.
// Best-effort : on répond toujours 200/204, une erreur ici ne doit jamais
// bloquer le visiteur qui clique sur un lien.
const bodySchema = z.object({ linkId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  const brand = await prisma.brand.findUnique({ where: { slug: params.slug }, select: { linkPage: { select: { id: true } } } });
  if (!brand?.linkPage) return new NextResponse(null, { status: 204 });

  await prisma.linkItem
    .updateMany({
      where: { id: parsed.data.linkId, linkPageId: brand.linkPage.id },
      data: { clicks: { increment: 1 } }
    })
    .catch(() => undefined);

  return new NextResponse(null, { status: 204 });
}
