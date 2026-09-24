import { prisma } from "@/lib/prisma";
import { getBrandPlan } from "@/lib/billing/plan";
import { DEFAULT_THEME_KEY, THEMES, canUseTheme } from "@/lib/themes";
import { MILLION_FOLLOWERS_EGG, bioCardSize, findBioFrame, frameFitsTheme, type BioCardSize } from "@/lib/bio-frames";
import { unlockKeysFor } from "@/lib/reussites/unlocks";

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
  // Taille de la carte selon le statut de la marque (voir BIO_CARD_SIZES).
  cardSize: BioCardSize;
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
  // Déblocages réels du propriétaire de la marque (easter eggs + récompenses
  // Réussites) : thème et cadre « à débloquer » revérifiés ici aussi (thème
  // et cadre Prisme, Nacre…), et palier du million d'abonnés pour la taille
  // de la carte.
  const owner = await prisma.membership.findFirst({ where: { brandId: brand.id, role: "OWNER" }, orderBy: { id: "asc" }, select: { userId: true } });
  const unlocked = owner ? await unlockKeysFor(owner.userId) : new Set<string>();
  const savedTheme = THEMES.find((t) => t.key === linkPage.theme);
  const themeOk = savedTheme && canUseTheme(savedTheme, plan) && (!savedTheme.requiresEgg || unlocked.has(savedTheme.requiresEgg));
  const theme = themeOk ? savedTheme.key : DEFAULT_THEME_KEY;
  const savedFrame = findBioFrame((linkPage as { frame?: string | null }).frame);
  const frameOk = !savedFrame || ((!savedFrame.requiresEgg || unlocked.has(savedFrame.requiresEgg)) && frameFitsTheme(savedFrame, theme));
  const frame = frameOk ? ((linkPage as { frame?: string | null }).frame ?? null) : null;
  const links = linkPage.links.slice(0, limits.maxBioLinks);

  return {
    brandName: linkPage.title || brand.name,
    bio: linkPage.bio,
    avatarUrl: linkPage.avatarUrl ?? brand.logoUrl ?? null,
    theme,
    frame,
    cardSize: bioCardSize(plan, unlocked.has(MILLION_FOLLOWERS_EGG)),
    links: links.map((l: { id: string; label: string; url: string }) => ({ id: l.id, label: l.label, url: l.url }))
  };
}
