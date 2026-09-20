// Règles de visibilité/écriture pour les catégories spéciales de la
// Communauté (voir prisma/schema.prisma::ForumThread pour le détail) :
//  - "VIP"        : salon interne réservé aux membres Premium (PRO/AGENCE),
//                   en lecture ET en écriture (thread comme réponse).
//  - "ACTUALITES" : contenu éditorial, création réservée à l'admin, avec
//                   accès anticipé Premium via publicAt (les non-Premium ne
//                   le voient qu'à partir de cette date).
// Utilisé côté serveur uniquement (routes API) — jamais fait confiance à
// un filtrage côté client.
import type { PremiumInfo } from "@/lib/premium";

export function canReadThread(
  thread: { category: string; publicAt: Date | string | null },
  premium: PremiumInfo
): boolean {
  if (thread.category === "VIP") return premium.isPremium;
  if (thread.category === "ACTUALITES" && thread.publicAt) {
    const publicAt = thread.publicAt instanceof Date ? thread.publicAt : new Date(thread.publicAt);
    if (publicAt.getTime() > Date.now()) return premium.isPremium;
  }
  return true;
}

export function canCreateInCategory(
  category: string,
  premium: PremiumInfo,
  isAdmin: boolean
): { ok: true } | { ok: false; error: string } {
  if (category === "VIP" && !premium.isPremium) {
    return { ok: false, error: "Le salon VIP est réservé aux membres Premium (Pro/Agence)." };
  }
  if (category === "ACTUALITES" && !isAdmin) {
    return { ok: false, error: "Seule l'équipe Nebula peut publier dans Actualités." };
  }
  return { ok: true };
}
