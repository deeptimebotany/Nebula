import { prisma } from "@/lib/prisma";

// Données publiques de la page « link in bio » d'une marque — partagées entre
// la page /l/[slug] (rendu côté serveur, pour que Google et les aperçus de
// partage voient le contenu) et l'API /api/public/link-in-bio/[slug]. Ne
// renvoie jamais une page non publiée, même si son contenu existe déjà en
// base (permet à la marque de préparer sa page avant de la rendre visible).
export interface PublicLinkPageData {
  brandName: string;
  bio: string;
  avatarUrl: string | null;
  theme: string;
  links: { id: string; label: string; url: string }[];
}

export async function getPublicLinkPage(slug: string): Promise<PublicLinkPageData | null> {
  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      linkPage: {
        include: { links: { where: { enabled: true }, orderBy: { order: "asc" } } }
      }
    }
  });

  if (!brand?.linkPage || !brand.linkPage.published) return null;
  const { linkPage } = brand;

  return {
    brandName: linkPage.title || brand.name,
    bio: linkPage.bio,
    avatarUrl: linkPage.avatarUrl ?? brand.logoUrl ?? null,
    theme: linkPage.theme,
    links: linkPage.links.map((l: { id: string; label: string; url: string }) => ({ id: l.id, label: l.label, url: l.url }))
  };
}
