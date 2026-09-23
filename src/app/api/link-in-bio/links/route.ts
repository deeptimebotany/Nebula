import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getOrCreateLinkPage, assertBrandMembership, assertBioLinkQuota } from "@/lib/link-in-bio";

// POST /api/link-in-bio/links { brandId, label, url } — ajoute un bouton de
// lien à la page publique de la marque, gardé par le quota du palier (voir
// maxBioLinks dans src/lib/plans.ts / assertBioLinkQuota).
const bodySchema = z.object({
  brandId: z.string().min(1),
  label: z.string().min(1).max(60),
  url: z.string().url().max(500)
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Libellé et URL valides requis." }, { status: 400 });
  const { brandId, label, url } = parsed.data;

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  try {
    await assertBioLinkQuota(brandId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, reason: "links_limit" }, { status: 403 });
  }

  const linkPage = await getOrCreateLinkPage(brandId);
  const lastOrder = linkPage.links.at(-1)?.order ?? -1;

  const link = await prisma.linkItem.create({
    data: { linkPageId: linkPage.id, label, url, order: lastOrder + 1 }
  });

  return NextResponse.json({ ok: true, link });
}
