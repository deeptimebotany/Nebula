// Cadres animés de la page bio (24/09/2026). Ils entourent la carte de
// profil (aperçu dans l'éditeur ET vraie page publique /l/[slug]) et
// habillent la photo de profil. Rendu : src/components/link-in-bio/bio-frame.tsx
// + classes .bf-* de globals.css. Importable client ET serveur.
//
//  - Thèmes Or Impérial (palier Pro) et Éclipse totale (palier Agence) :
//    « Halo qui respire » inclus par défaut, sans rien à débloquer.
//  - Comète, Orbites, Feuille de métal : succès cachés, débloqués par les
//    j'aime cumulés (version Or) ou les abonnés cumulés (version Éclipse) —
//    utilisables seulement avec le thème de page correspondant.
//  - La couronne : n° 1 du classement de parrainage, tous thèmes (dorée sur
//    Or Impérial, éclipse partout ailleurs).
//  - Cadres ultimes Nacre (1 M de j'aime) et Prisme (1 M d'abonnés) : tous
//    thèmes, avec leur propre univers visuel.
//  - Carrefour et Astre : récompenses de la page Réussites, tous thèmes.
//
// LinkPage.frame vaut null (= automatique : halo sur Or/Éclipse, rien
// ailleurs), "none" (aucun cadre) ou l'une des clés ci-dessous.

export type FrameStyle = "halo" | "comete" | "orbites" | "metal" | "couronne" | "nacre" | "prisme" | "carrefour" | "astre";
export type FrameFlavor = "or" | "eclipse";

export interface BioFrameDef {
  key: string;
  label: string;
  style: FrameStyle;
  // Présent : cadre réservé au thème de page correspondant.
  flavor?: FrameFlavor;
  // Clé d'easter egg à avoir trouvé (voir easter-eggs-registry.ts).
  requiresEgg?: string;
  // Caché dans le sélecteur tant qu'il n'est pas débloqué.
  secret?: boolean;
}

export const BIO_FRAMES: BioFrameDef[] = [
  { key: "or-halo", label: "Halo doré", style: "halo", flavor: "or" },
  { key: "eclipse-halo", label: "Halo Éclipse", style: "halo", flavor: "eclipse" },
  { key: "or-comete", label: "Comète dorée", style: "comete", flavor: "or", requiresEgg: "frame-or-comete", secret: true },
  { key: "or-orbites", label: "Orbites dorées", style: "orbites", flavor: "or", requiresEgg: "frame-or-orbites", secret: true },
  { key: "or-metal", label: "Feuille d'or", style: "metal", flavor: "or", requiresEgg: "frame-or-metal", secret: true },
  { key: "eclipse-comete", label: "Comète Éclipse", style: "comete", flavor: "eclipse", requiresEgg: "frame-eclipse-comete", secret: true },
  { key: "eclipse-orbites", label: "Orbites Éclipse", style: "orbites", flavor: "eclipse", requiresEgg: "frame-eclipse-orbites", secret: true },
  { key: "eclipse-metal", label: "Acier noir", style: "metal", flavor: "eclipse", requiresEgg: "frame-eclipse-metal", secret: true },
  { key: "couronne", label: "La couronne", style: "couronne", requiresEgg: "referral-crown" },
  { key: "nacre", label: "Nacre (ultime)", style: "nacre", requiresEgg: "frame-ultime-nacre", secret: true },
  { key: "prisme", label: "Prisme (ultime)", style: "prisme", requiresEgg: "frame-ultime-prisme", secret: true },
  // Gagnés dans Réussites (25/09/2026) — visibles verrouillés, pour donner
  // un objectif : « Carrefour » (1 000 clics sur la page bio) et « Astre »
  // (niveau 7). Tous thèmes.
  { key: "carrefour", label: "Carrefour", style: "carrefour", requiresEgg: "ach:frame-carrefour" },
  { key: "astre", label: "Astre", style: "astre", requiresEgg: "ach:frame-astre" }
];

export const FRAME_NONE = "none";

export function findBioFrame(key: string | null | undefined): BioFrameDef | undefined {
  return key ? BIO_FRAMES.find((f) => f.key === key) : undefined;
}

export function themeFlavor(themeKey: string | null | undefined): FrameFlavor | null {
  if (themeKey === "or-imperial") return "or";
  if (themeKey === "eclipse-totale") return "eclipse";
  return null;
}

export interface ResolvedFrame {
  style: FrameStyle;
  flavor: FrameFlavor;
}

/** Cadre réellement affiché pour ce thème de page et ce choix enregistré. */
export function resolveBioFrame(themeKey: string | null | undefined, frameKey: string | null | undefined): ResolvedFrame | null {
  const flavor = themeFlavor(themeKey);
  const fallback: ResolvedFrame | null = flavor ? { style: "halo", flavor } : null;
  if (frameKey === FRAME_NONE) return null;
  const def = findBioFrame(frameKey);
  if (!def) return fallback;
  // Cadre Or/Éclipse sur un autre thème : on retombe sur le défaut.
  if (def.flavor && def.flavor !== flavor) return fallback;
  return { style: def.style, flavor: def.flavor ?? flavor ?? "eclipse" };
}

/** true si ce cadre peut être choisi avec ce thème (hors déblocage). */
export function frameFitsTheme(def: BioFrameDef, themeKey: string | null | undefined): boolean {
  return !def.flavor || def.flavor === themeFlavor(themeKey);
}

/** Clés de cadres débloquées, à partir des easter eggs trouvés. */
export function unlockedFrameKeys(foundEggKeys: Iterable<string>, everything = false): string[] {
  const found = new Set(foundEggKeys);
  return BIO_FRAMES.filter((f) => everything || !f.requiresEgg || found.has(f.requiresEgg)).map((f) => f.key);
}
