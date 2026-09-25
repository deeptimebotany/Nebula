// Marque active mémorisée dans un cookie (lot 10), en plus du localStorage :
// le serveur la connaît dès la première requête et prépare les données de
// CETTE marque (layout de l'application, Vue d'ensemble, Analytics) au lieu
// d'attendre que le navigateur la lise puis la demande.
//
// Simple préférence d'affichage, pas une autorisation : le serveur vérifie
// toujours que la marque appartient au compte connecté (voir
// server-data/brands.ts), sinon il prend la première marque du compte.
// Module sans dépendance serveur : utilisable par le navigateur.
export const ACTIVE_BRAND_COOKIE = "nb_brand";
export const ACTIVE_BRAND_STORAGE_KEY = "nebula:activeBrandId";

/** Mémorise la marque active (cookie d'un an + localStorage). Navigateur uniquement. */
export function rememberActiveBrand(id: string): void {
  if (typeof document === "undefined") return;
  if (/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ACTIVE_BRAND_COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }
  try {
    localStorage.setItem(ACTIVE_BRAND_STORAGE_KEY, id);
  } catch {
    // stockage indisponible (mode privé…) : le cookie suffit
  }
}

/** Marque mémorisée par le cookie (navigateur uniquement). */
export function activeBrandFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_BRAND_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
