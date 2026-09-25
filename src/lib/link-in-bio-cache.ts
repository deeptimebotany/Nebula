// Cache de la Page bio publique (/l/[slug]) — audit performance, lot 4.
//
// Avant : chaque visite lançait ~6 requêtes en base (marque + page + liens,
// palier, propriétaire, déblocages)… deux fois (titre de l'onglet + page).
// Maintenant :
//  - le résultat est gardé dans le cache de données de Next.js (Vercel),
//    étiqueté par adresse de page ;
//  - toute modification (réglages, liens, ordre, import Linktree, nom de la
//    marque, suppression, fin d'essai) efface l'étiquette : la page à jour
//    est visible immédiatement ;
//  - ce qui ne passe pas par ces routes (fin d'abonnement, nouveau déblocage
//    de thème) est repris au plus tard après REVALIDATE_SECONDS ;
//  - dans une même requête, le titre et la page partagent la même lecture
//    (cache() de React).
import * as React from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPublicLinkPage, type PublicLinkPageData } from "@/lib/link-in-bio-public";

export const LINK_PAGE_REVALIDATE_SECONDS = 300;

// cache() n'existe que dans la version de React embarquée par Next.js : hors
// de Next (worker lancé avec tsx, tests), on s'en passe.
type AnyAsync = (...args: never[]) => Promise<unknown>;
const perRequest: <T extends AnyAsync>(fn: T) => T =
  (React as unknown as { cache?: <T extends AnyAsync>(fn: T) => T }).cache ?? ((fn) => fn);

// Adresse telle quelle (la recherche en base est sensible à la casse) : une
// adresse mal écrite a sa propre entrée « introuvable », sans jamais
// masquer la vraie page.
export function linkPageTag(slug: string): string {
  return `link-page:${slug}`;
}

// Au-delà, ce n'est pas une adresse de page réelle : pas de mise en cache.
const MAX_CACHED_SLUG_LENGTH = 120;

/** Page bio publique, depuis le cache (null si inconnue ou non publiée). */
export const getCachedPublicLinkPage = perRequest(async (slug: string): Promise<PublicLinkPageData | null> => {
  if (slug.length > MAX_CACHED_SLUG_LENGTH) return getPublicLinkPage(slug);
  const load = unstable_cache(() => getPublicLinkPage(slug), ["link-page", slug], {
    tags: [linkPageTag(slug), "link-pages"],
    revalidate: LINK_PAGE_REVALIDATE_SECONDS
  });
  try {
    return await load();
  } catch (err) {
    // Cache indisponible (ex. exécution hors Next.js : worker, tests) :
    // lecture directe, la page s'affiche quand même.
    if (err instanceof Error && /incrementalCache|static generation store|staticGenerationStore/i.test(err.message)) {
      return getPublicLinkPage(slug);
    }
    throw err;
  }
});

function safeRevalidate(tag: string): void {
  try {
    revalidateTag(tag);
  } catch (err) {
    // Appelé hors d'une requête Next.js (worker, script, test) : pas de cache
    // à invalider ; la page sera reprise à l'expiration normale.
    const message = (err as Error).message ?? "";
    if (!/static generation store missing/i.test(message)) console.warn("[link-in-bio-cache] invalidation impossible :", message);
  }
}

/** Efface la page en cache d'une adresse précise (ex. avant de supprimer la marque). */
export function invalidateLinkPageSlug(slug: string | null | undefined): void {
  if (slug) safeRevalidate(linkPageTag(slug));
}

/** Efface la page en cache d'une marque, après une modification. */
export async function invalidateLinkPage(brandId: string): Promise<void> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { slug: true } }).catch(() => null);
  invalidateLinkPageSlug(brand?.slug);
}

/** Efface toutes les pages bio en cache (changement d'abonnement : thèmes
 *  premium et nombre de liens affichés dépendent du palier). */
export function invalidateAllLinkPages(): void {
  safeRevalidate("link-pages");
}
