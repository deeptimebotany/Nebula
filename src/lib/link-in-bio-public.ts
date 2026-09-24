import { prisma } from "@/lib/prisma";
import { getBrandPlan } from "@/lib/billing/plan";
import { DEFAULT_THEME_KEY, THEMES, canUseTheme } from "@/lib/themes";

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
  // Cadre animé autour de la carte (voir src/lib/bio-frames.ts).
  frame: string | null;
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

  // Avantages de palier revérifiés à chaque affichage (24/09/2026) : un
  // thème premium (Or Impérial, Éclipse, Aube…) ou des liens au-delà de la
  // limite ne restent pas en ligne après la fin de l'abonnement du
  // propriétaire de la marque. Rien n'est effacé : tout revient s'il se
  // réabonne.
  const { plan, limits } = await getBrandPlan(brand.id);
  const savedTheme = THEMES.find((t) => t.key === linkPage.theme);
  const theme = savedTheme && canUseTheme(savedTheme, plan) ? savedTheme.key : DEFAULT_THEME_KEY;
  const links = linkPage.links.slice(0, limits.maxBioLinks);

  return {
    brandName: linkPage.title || brand.name,
    bio: linkPage.bio,
    avatarUrl: linkPage.avatarUrl ?? brand.logoUrl ?? null,
    theme,
    frame: (linkPage as { frame?: string | null }).frame ?? null,
    links: links.map((l: { id: string; label: string; url: string }) => ({ id: l.id, label: l.label, url: l.url }))
  };
}
