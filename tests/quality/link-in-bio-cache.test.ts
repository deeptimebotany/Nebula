import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ brand: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const loader = vi.hoisted(() => ({ getPublicLinkPage: vi.fn() }));
vi.mock("@/lib/link-in-bio-public", () => loader);
const nextCache = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((cb: () => Promise<unknown>, _keyParts?: string[], _options?: unknown) => cb)
}));
vi.mock("next/cache", () => nextCache);

import { getCachedPublicLinkPage, invalidateAllLinkPages, invalidateLinkPage, linkPageTag } from "@/lib/link-in-bio-cache";

// Cache de la Page bio publique (lot 4, performance).
describe("cache de la Page bio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextCache.unstable_cache.mockImplementation((cb: () => Promise<unknown>, _keyParts?: string[], _options?: unknown) => cb);
  });

  it("met en cache par adresse exacte, avec son étiquette et une expiration", async () => {
    loader.getPublicLinkPage.mockResolvedValue({ brandName: "Marque" });
    expect(await getCachedPublicLinkPage("Ma-Marque")).toEqual({ brandName: "Marque" });
    const [, keyParts, options] = nextCache.unstable_cache.mock.calls[0];
    expect(keyParts).toEqual(["link-page", "Ma-Marque"]);
    expect(options).toEqual({ tags: ["link-page:Ma-Marque", "link-pages"], revalidate: 300 });
  });

  it("hors de Next.js (worker, tests) : lecture directe au lieu d'une erreur", async () => {
    nextCache.unstable_cache.mockImplementation(() => async () => {
      throw new Error("Invariant: incrementalCache missing in unstable_cache");
    });
    loader.getPublicLinkPage.mockResolvedValue(null);
    expect(await getCachedPublicLinkPage("inconnue")).toBeNull();
    expect(loader.getPublicLinkPage).toHaveBeenCalledWith("inconnue");
  });

  it("n'utilise pas le cache pour une adresse démesurée", async () => {
    loader.getPublicLinkPage.mockResolvedValue(null);
    await getCachedPublicLinkPage("x".repeat(500));
    expect(nextCache.unstable_cache).not.toHaveBeenCalled();
  });

  it("une modification efface la page de la marque ; un changement d'abonnement, toutes", async () => {
    db.brand.findUnique.mockResolvedValue({ slug: "ma-marque" });
    await invalidateLinkPage("b1");
    expect(nextCache.revalidateTag).toHaveBeenCalledWith(linkPageTag("ma-marque"));
    invalidateAllLinkPages();
    expect(nextCache.revalidateTag).toHaveBeenCalledWith("link-pages");
  });

  it("une invalidation hors requête Next.js ne fait pas échouer l'opération", async () => {
    nextCache.revalidateTag.mockImplementation(() => {
      throw new Error("Invariant: static generation store missing in revalidateTag link-page:x");
    });
    db.brand.findUnique.mockResolvedValue({ slug: "x" });
    await expect(invalidateLinkPage("b1")).resolves.toBeUndefined();
    db.brand.findUnique.mockResolvedValue(null);
    await expect(invalidateLinkPage("absente")).resolves.toBeUndefined();
  });
});
