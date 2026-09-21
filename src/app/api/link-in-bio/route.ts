import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getOrCreateLinkPage, assertBrandMembership } from "@/lib/link-in-bio";
import { THEMES } from "@/lib/themes";

// GET/PATCH /api/link-in-bio?brandId=... — page "link in bio" de la marque
// active, éditée depuis /link-in-bio (voir ce dossier pour l'UI). Créée à la
// volée au premier GET (voir getOrCreateLinkPage) : pas de flux de création
// séparé, la marque a toujours "sa" page, publiée ou non.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  const [linkPage, brand] = await Promise.all([
    getOrCreateLinkPage(brandId),
    prisma.brand.findUnique({ where: { id: brandId }, select: { slug: true } })
  ]);

  return NextResponse.json({ linkPage, slug: brand?.slug });
}

const bodySchema = z.object({
  brandId: z.string().min(1),
  title: z.string().max(60).optional(),
  bio: z.string().max(280).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  theme: z.string().optional(),
  published: z.boolean().optional()
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const { brandId, ...data } = parsed.data;

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  if (data.theme && !THEMES.some((t) => t.key === data.theme)) {
    return NextResponse.json({ error: "Thème inconnu." }, { status: 400 });
  }

  await getOrCreateLinkPage(brandId);

  const linkPage = await prisma.linkPage.update({
    where: { brandId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.published !== undefined ? { published: data.published } : {})
    },
    include: { links: { orderBy: { order: "asc" } } }
  });

  return NextResponse.json({ linkPage });
}
