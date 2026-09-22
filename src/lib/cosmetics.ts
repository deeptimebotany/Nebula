// Catalogue des "cosmétiques" : du contenu visuel/sonore RÉEL (curseurs,
// halos, transitions, sons...) débloqué SOIT par palier (requiresPlan) SOIT
// en trouvant un easter egg (requiresEgg, voir easter-eggs-registry.ts) —
// jamais les deux à la fois sur une même entrée. Chaque cosmétique est
// listé directement dans Paramètres → Cosmétiques, visible même verrouillé
// (avec le palier requis affiché — ou une simple mention "Easter egg" sans
// dévoiler le déclencheur, pour les entrées requiresEgg).
//
// Deux cosmétiques du même lot (le fond de connexion "Voie lactée" et le
// bandeau "Supernova" des jalons de publication) n'apparaissent PAS ici :
// ce sont des améliorations offertes à tout le monde, sans réglage à
// activer — voir login-form.tsx et milestone-celebration.tsx directement.
import type { Plan } from "./plans";

export type CosmeticCategory = "curseur" | "clic" | "decor" | "son" | "profil";

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
    key: "curseur-comete",
    label: "Curseur Comète",
    description: "Une traînée colorée façon comète suit votre curseur.",
    category: "curseur",
    requiresPlan: "AGENCY"
  },
  {
    key: "curseur-etoile-filante",
    label: "Curseur Étoile filante",
    description: "Une fine traînée d'étoile suit votre curseur (plus discrète que la comète).",
    category: "curseur",
    requiresPlan: "PRO"
  },
  {
    key: "clic-etincelles",
    label: "Étincelles au clic",
    description: "Une petite explosion de particules à chaque clic sur un bouton principal.",
    category: "clic",
    requiresPlan: "PRO"
  },
  {
    key: "clic-etoile-explosive",
    label: "Étoile explosive au clic",
    description: "Variante plus spectaculaire : une étoile explose à chaque clic gauche, partout sur le site.",
    category: "clic",
    requiresPlan: "AGENCY"
  },
  {
    key: "survol-comete-bouton",
    label: "Survol Comète (boutons)",
    description: "Les boutons principaux laissent une traînée lumineuse au survol.",
    category: "clic",
    requiresPlan: "PRO"
  },
  {
    key: "constellation-calendrier",
    label: "Constellations (Calendrier)",
    description: "Un fond discret de constellations derrière la grille du Calendrier.",
    category: "decor",
    requiresPlan: "PRO"
  },
  {
    key: "ciel-nocturne-composer",
    label: "Ciel nocturne (Importation)",
    description: "Un fond étoilé discret derrière la page d'Importation.",
    category: "decor",
    requiresPlan: "PRO"
  },
  {
    key: "anneau-saturne-avatar",
    label: "Anneau de Saturne (avatar)",
    description: "Un anneau animé léger autour de la pastille de marque active, en haut de l'écran.",
    category: "profil",
    requiresPlan: "AGENCY"
  },
  {
    key: "halo-dore-avatar",
    label: "Halo doré (avatar)",
    description: "Un halo doré autour de la pastille de marque active.",
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
    description: "Une variante plus espacée, futuriste, pour les titres de l'application.",
    category: "decor"
  },
  {
    key: "papier-peint-succes",
    label: "Voûte céleste (page Succès)",
    description: "Un fond animé dédié à votre page Succès.",
    category: "decor",
    requiresPlan: "AGENCY"
  },
  {
    key: "transition-etoiles",
    label: "Traversée d'étoiles (transitions)",
    description: "Une traînée de particules accompagne chaque changement de page.",
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
  {
    key: "sidebar-poussiere-etoiles",
    label: "Poussière d'étoiles (menu latéral)",
    description: "Un léger scintillement de fond dans le menu latéral.",
    category: "decor"
  },
  {
    key: "icone-app-retro",
    label: "Icône rétro",
    description: "Une variante pixel-art de l'icône de l'onglet du navigateur.",
    category: "profil",
    requiresEgg: "retro-icon-unlock"
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
