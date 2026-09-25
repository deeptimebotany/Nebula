// Cache du media kit public (/kit/[slug]), sur le modèle de la page bio
// (src/lib/link-in-bio-cache.ts) : une visite ne relit la base qu'après une
// modification du kit, ou toutes les 10 minutes au plus (les chiffres ne
// bougent qu'à chaque synchro). Le titre de l'onglet, la page et l'image de
// partage partagent la même lecture.
import * as React from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPublicKit } from "./load";
import type { PublicKitData } from "./types";

export const MEDIA_KIT_REVALIDATE_SECONDS = 600;

type AnyAsync = (...args: never[]) => Promise<unknown>;
const perRequest: <T extends AnyAsync>(fn: T) => T =
  (React as unknown as { cache?: <T extends AnyAsync>(fn: T) => T }).cache ?? ((fn) => fn);

export function mediaKitTag(slug: string): string {
  return `media-kit:${slug}`;
}

/** Kit publié, depuis le cache (null si inconnu, non publié ou palier sans media kit). */
export const getCachedPublicKit = perRequest(async (slug: string): Promise<PublicKitData | null> => {
  if (slug.length > 120) return null;
  const load = unstable_cache(() => getPublicKit(slug), ["media-kit", slug], {
    tags: [mediaKitTag(slug), "media-kits"],
    revalidate: MEDIA_KIT_REVALIDATE_SECONDS
  });
  try {
    return await load();
  } catch (err) {
    // Hors de Next.js (tests, worker) : lecture directe.
    if (err instanceof Error && /incrementalCache|static generation store|staticGenerationStore/i.test(err.message)) return getPublicKit(slug);
    throw err;
  }
});

function safeRevalidate(tag: string): void {
  try {
    revalidateTag(tag);
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (!/static generation store missing/i.test(message)) console.warn("[media-kit-cache] invalidation impossible :", message);
  }
}

export function invalidateMediaKitSlug(slug: string | null | undefined): void {
  if (slug) safeRevalidate(mediaKitTag(slug));
}

export async function invalidateMediaKit(brandId: string): Promise<void> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { slug: true } }).catch(() => null);
  invalidateMediaKitSlug(brand?.slug);
}

/** Changement d'abonnement : la publication dépend du palier. */
export function invalidateAllMediaKits(): void {
  safeRevalidate("media-kits");
}
