/**
 * Pseudo d'un membre — rendu en dégradé doré animé (.text-gold-shimmer) pour
 * les abonnés PRO/AGENCE, texte normal sinon. Utilisé partout où un pseudo
 * de membre apparaît (communauté...). Voir computePremiumInfo pour le calcul
 * du statut Premium à partir du VRAI abonnement en base.
 */
export function PremiumName({ name, isPremium }: { name: string; isPremium: boolean }) {
  if (!isPremium) return <>{name}</>;
  return <span className="text-gold-shimmer font-semibold">{name}</span>;
}
