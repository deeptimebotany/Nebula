// Catalogue des "cosmétiques" : du contenu visuel/sonore RÉEL (halos, décors,
// sons...) débloqué SOIT par palier (requiresPlan) SOIT en trouvant un
// easter egg (requiresEgg, voir easter-eggs-registry.ts) — jamais les deux à
// la fois sur une même entrée. Chaque cosmétique est listé directement dans
// Paramètres → Cosmétiques, visible même verrouillé (avec le palier requis
// affiché — ou une simple mention "Easter egg" sans dévoiler le déclencheur,
// pour les entrées requiresEgg).
//
// Les catégories "Curseur" (traînée au curseur) et "Clic" (étincelles/étoile
// au clic, survol comète), ainsi que "Traversée d'étoiles (transitions)",
// ont existé un temps puis ont été retirées entièrement à la demande
// explicite (retour utilisateur direct) : leurs effets étaient jugés trop
// envahissants/peu utiles, et le système de particules qu'ils partageaient
// (voir l'ancien ParticleBurst de cosmetics-effects.tsx) était à l'origine
// d'un bug de double-déclenchement occasionnel sur les clics et les
// transitions de page. Toute cette mécanique de particules a été supprimée
// avec eux plutôt que corrigée.
//
// Deux cosmétiques du même lot (le fond de connexion "Voie lactée" et le
// bandeau "Supernova" des jalons de publication) n'apparaissent PAS ici :
// ce sont des améliorations offertes à tout le monde, sans réglage à
// activer — voir login-form.tsx et milestone-celebration.tsx directement.
import type { Plan } from "./plans";

export type CosmeticCategory = "decor" | "son" | "profil";

export interface CosmeticDefinition {
  key: string;
  label: string;
  description: string;
  category: CosmeticCategory;
  requiresPlan?: Plan;
  // Alternative à requiresPlan : réserve ce cosmétique à qui a trouvé
  // l'easter egg de cette clé (voir easter-eggs-registry.ts), plutôt qu'à un
  // palier payant — jamais les deux à la fois sur une même entrée. Vérifié
  // par /api/settings/cosmetics (GET/PATCH), pas par canUseCosmetic
  // ci-dessous qui ne connaît que les paliers.
  requiresEgg?: string;
}

export const COSMETICS: CosmeticDefinition[] = [
  {
    key: "anneau-saturne-avatar",
    label: "Anneau de Saturne (avatar)",
    description: "Un anneau animé léger autour de la pastille de marque active, en haut de l'écran. Cumulable avec le Halo doré.",
    category: "profil",
    requiresPlan: "AGENCY"
  },
  {
    key: "halo-dore-avatar",
    label: "Halo doré (avatar)",
    description: "Un halo doré autour de la pastille de marque active. Cumulable avec l'Anneau de Saturne.",
    category: "profil",
    requiresPlan: "PRO"
  },
  {
    key: "eclat-dore-statcard",
    label: "Éclat doré (statistiques)",
    description: "Un contour doré animé pour vos cartes de statistiques ayant dépassé un palier d'abonnés.",
    category: "decor",
    requiresEgg: "golden-glow-unlock"
  },
  {
    key: "police-cosmique",
    label: "Police Cosmique",
    description: "Une variante nettement plus espacée et lumineuse (lettres écartées, léger halo cyan) pour les titres de l'application.",
    category: "decor"
  },
  {
    key: "papier-peint-succes",
    label: "Voûte céleste (page Réussites)",
    description: "Une vraie voûte stellaire colorée et animée en fond de votre page Réussites.",
    category: "decor",
    requiresPlan: "AGENCY"
  },
  {
    key: "son-pulsar",
    label: "Son Pulsar (notifications)",
    description: "Un léger son spatial accompagne vos notifications de succès dans l'application.",
    category: "son",
    requiresPlan: "PRO"
  },
  {
    key: "message-accueil-perso",
    label: "Message d'accueil personnalisé",
    description: "Une phrase différente (parmi plusieurs variantes spatiales) affichée sur la Vue d'ensemble à chaque visite.",
    category: "profil",
    requiresEgg: "greeting-unlock"
  },
  // --- Anneaux d'avatar gagnés dans Réussites (25/09/2026) : autour de la
  // pastille de marque (en haut), de la photo dans « Mon profil » et dans la
  // Communauté. Activés automatiquement quand on les gagne ; si plusieurs
  // sont activés, seul le plus prestigieux s'affiche.
  {
    key: "anneau-bronze-avatar",
    label: "Anneau bronze (avatar)",
    description: "Un anneau cuivré autour de votre pastille et de votre photo. Gagné avec l'accomplissement « Envol ».",
    category: "profil",
    requiresEgg: "ach:ring-bronze"
  },
  {
    key: "anneau-argent-avatar",
    label: "Anneau argent (avatar)",
    description: "Un anneau argenté autour de votre pastille et de votre photo. Gagné au niveau 5 « Confirmé ».",
    category: "profil",
    requiresEgg: "ach:ring-argent"
  },
  {
    key: "anneau-or-avatar",
    label: "Anneau or (avatar)",
    description: "Un anneau doré autour de votre pastille et de votre photo. Gagné à 100 publications.",
    category: "profil",
    requiresEgg: "ach:ring-or"
  },
  {
    key: "anneau-stellaire-avatar",
    label: "Anneau stellaire (avatar, animé)",
    description: "Un anneau aux couleurs de la nébuleuse qui tourne lentement. Gagné au niveau 8 « Légende ».",
    category: "profil",
    requiresEgg: "ach:ring-stellaire"
  },
  {
    key: "sidebar-poussiere-etoiles",
    label: "Poussière d'étoiles (menu latéral)",
    description: "Un semis d'étoiles qui dérivent doucement en fond du menu latéral, comme le thème étoilé animé.",
    category: "decor",
    requiresEgg: "sidebar-menu-mash-unlock"
  }
];

export function findCosmetic(key: string): CosmeticDefinition | undefined {
  return COSMETICS.find((c) => c.key === key);
}

/**
 * true si ce compte (selon son palier SEUL) peut activer ce cosmétique.
 * Renvoie toujours false pour une entrée requiresEgg : le palier ne débloque
 * jamais ce genre de cosmétique — voir /api/settings/cosmetics, qui vérifie
 * séparément si l'easter egg correspondant a été trouvé.
 */
export function canUseCosmetic(cosmetic: CosmeticDefinition, plan: Plan): boolean {
  if (cosmetic.requiresEgg) return false;
  if (!cosmetic.requiresPlan) return true;
  const order: Plan[] = ["FREE", "PRO", "AGENCY"];
  return order.indexOf(plan) >= order.indexOf(cosmetic.requiresPlan);
}
