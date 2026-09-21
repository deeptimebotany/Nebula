import { prisma } from "@/lib/prisma";
import { getBrandPlan } from "@/lib/billing/plan";
export { assertBrandMembership } from "@/lib/brand-access";

// Page "link in bio" publique d'une marque (façon Linktree), voir le modèle
// LinkPage dans prisma/schema.prisma. Une marque n'a jamais plus d'une
// LinkPage (relation 1-1) : ce helper la crée à la volée au premier accès
// (depuis l'éditeur dans /link-in-bio) au lieu d'exiger une étape de
// création séparée.
export async function getOrCreateLinkPage(brandId: string) {
  const existing = await prisma.linkPage.findUnique({
    where: { brandId },
    include: { links: { orderBy: { order: "asc" } } }
  });
  if (existing) return existing;

  return prisma.linkPage.create({
    data: { brandId },
    include: { links: { orderBy: { order: "asc" } } }
  });
}

// À vérifier avant de créer un nouveau LinkItem : le nombre de liens déjà
// enregistrés (activés ou non — on compte tout, pour éviter de contourner la
// limite en désactivant puis recréant) ne doit pas dépasser le plafond du
// palier de la marque (voir maxBioLinks dans src/lib/plans.ts).
export async function assertBioLinkQuota(brandId: string) {
  const { limits } = await getBrandPlan(brandId);
  const linkPage = await prisma.linkPage.findUnique({ where: { brandId }, select: { id: true } });
  const count = linkPage ? await prisma.linkItem.count({ where: { linkPageId: linkPage.id } }) : 0;
  if (count >= limits.maxBioLinks) {
    throw new Error(
      `Limite de liens atteinte pour le palier ${limits.label} (${limits.maxBioLinks} liens sur la page "link in bio"). Passez sur un palier supérieur dans Facturation.`
    );
  }
}
