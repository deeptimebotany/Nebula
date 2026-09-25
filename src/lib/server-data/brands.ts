// Marques du compte et marque active, préparées côté serveur (lot 10).
// Source unique de GET /api/brands et du layout de l'application.
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { ACTIVE_BRAND_COOKIE } from "@/lib/active-brand";
import type { BrandSummary } from "@/components/brand-context";

/**
 * Marques du compte, telles que le sélecteur de marque les affiche. Lot 10 :
 * le nombre de comptes connectés est COMPTÉ par la base (avant : toutes les
 * lignes de connexion étaient lues, jetons déchiffrés compris, pour en
 * prendre la longueur).
 */
export async function listUserBrands(userId: string): Promise<BrandSummary[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: {
      role: true,
      brand: { select: { id: true, name: true, slug: true, logoUrl: true, timezone: true, _count: { select: { connections: true } } } }
    }
  });
  return memberships.map(
    (m: { role: string; brand: { id: string; name: string; slug: string; logoUrl?: string | null; timezone?: string | null; _count: { connections: number } } }) => ({
      id: m.brand.id,
      name: m.brand.name,
      slug: m.brand.slug,
      // Logo de la marque (= photo de sa Page bio, voir /api/link-in-bio) :
      // affiché dans le sélecteur de marque à la place de l'initiale.
      logoUrl: m.brand.logoUrl ?? null,
      // Fuseau de programmation de la marque (voir src/lib/timezone.ts).
      timezone: m.brand.timezone || DEFAULT_TIMEZONE,
      role: m.role,
      connectionsCount: m.brand._count.connections
    })
  );
}

export interface ActiveBrandContext {
  brands: BrandSummary[];
  /** Marque à afficher : celle du cookie si elle appartient au compte, sinon la première. */
  activeBrand: BrandSummary | null;
  /** Vrai si la marque vient du cookie (faux : choix par défaut, le navigateur peut corriger). */
  fromCookie: boolean;
}

/**
 * Marques + marque active du compte, une seule fois par requête (le layout
 * et la page l'appellent tous les deux).
 */
export const resolveActiveBrand = cache(async (userId: string): Promise<ActiveBrandContext> => {
  const brands = await listUserBrands(userId);
  const wanted = cookies().get(ACTIVE_BRAND_COOKIE)?.value;
  const fromCookie = brands.find((b) => b.id === wanted) ?? null;
  return { brands, activeBrand: fromCookie ?? brands[0] ?? null, fromCookie: Boolean(fromCookie) };
});
