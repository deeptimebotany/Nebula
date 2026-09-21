import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/public/link-in-bio/[slug] — consultée par la page publique
// /l/[slug] (aucune authentification, comme /api/public/approvals/[token] :
// le slug de la marque, déjà unique, sert d'identifiant public). Ne renvoie
// jamais une page non publiée, même si son contenu existe déjà en base
// (permet à la marque de préparer sa page avant de la rendre visible).
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const brand = await prisma.brand.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      linkPage: {
        include: { links: { where: { enabled: true }, orderBy: { order: "asc" } } }
      }
    }
  });

  if (!brand?.linkPage || !brand.linkPage.published) {
    return NextResponse.json({ error: "Cette page n'existe pas ou n'est pas publiée." }, { status: 404 });
  }

  const { linkPage } = brand;

  return NextResponse.json({
    brandName: linkPage.title || brand.name,
    bio: linkPage.bio,
    avatarUrl: linkPage.avatarUrl,
    theme: linkPage.theme,
    links: linkPage.links.map((l: { id: string; label: string; url: string }) => ({ id: l.id, label: l.label, url: l.url }))
  });
}
