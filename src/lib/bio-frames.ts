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
//  - Carrefour, Astre et Halo : récompenses de la page Réussites, tous thèmes.
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
  { key: "astre", label: "Astre", style: "astre", requiresEgg: "ach:frame-astre" },
  // Lot B des Réussites : étoile Communauté ★3 « Conversation » — le halo
  // qui respire, sur tous les thèmes classiques.
  { key: "halo", label: "Halo", style: "halo", requiresEgg: "ach:frame-halo" }
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

// Cadres et thèmes liés (24/09/2026, choix de Lucas « liés, avec repli
// auto ») : les thèmes « univers » ont leurs propres cadres et n'acceptent
// qu'eux ; les thèmes classiques acceptent tous les cadres sans univers
// (Nacre, Prisme, Couronne, Carrefour, Astre). Choisir un thème qui ne va
// pas avec le cadre enregistré remet le cadre sur « Automatique » (voir
// PATCH /api/link-in-bio) ; les cadres incompatibles sont grisés.
const THEME_OWN_FRAMES: Record<string, readonly string[]> = {
  "or-imperial": ["or-halo", "or-comete", "or-orbites", "or-metal", "couronne"],
  "eclipse-totale": ["eclipse-halo", "eclipse-comete", "eclipse-orbites", "eclipse-metal", "couronne"],
  prisme: ["prisme", "couronne"]
};

/** Cadre « Automatique » d'un thème : son halo, ou le Prisme pour le thème Prisme. */
function themeDefaultFrame(themeKey: string | null | undefined): ResolvedFrame | null {
  const flavor = themeFlavor(themeKey);
  if (flavor) return { style: "halo", flavor };
  if (themeKey === "prisme") return { style: "prisme", flavor: "eclipse" };
  return null;
}

/** true si ce cadre peut être choisi avec ce thème (hors déblocage). */
export function frameFitsTheme(def: BioFrameDef, themeKey: string | null | undefined): boolean {
  const own = THEME_OWN_FRAMES[themeKey ?? ""];
  if (own) return own.includes(def.key);
  return !def.flavor;
}

/** Pourquoi ce cadre est grisé avec ce thème (libellé court), ou null. */
export function frameThemeHint(def: BioFrameDef, themeKey: string | null | undefined): string | null {
  if (frameFitsTheme(def, themeKey)) return null;
  if (def.flavor === "or") return "Thème Or Impérial requis";
  if (def.flavor === "eclipse") return "Thème Éclipse totale requis";
  return "Pas avec ce thème";
}

/** Cadre réellement affiché pour ce thème de page et ce choix enregistré. */
export function resolveBioFrame(themeKey: string | null | undefined, frameKey: string | null | undefined): ResolvedFrame | null {
  const flavor = themeFlavor(themeKey);
  const fallback = themeDefaultFrame(themeKey);
  if (frameKey === FRAME_NONE) return null;
  const def = findBioFrame(frameKey);
  if (!def) return fallback;
  // Cadre qui ne va pas avec ce thème : on retombe sur le défaut du thème.
  if (!frameFitsTheme(def, themeKey)) return fallback;
  return { style: def.style, flavor: def.flavor ?? flavor ?? "eclipse" };
}

// ---------------------------------------------------------------------------
// Taille de la carte de la Page bio selon le statut (24/09/2026) : un peu
// plus grande en Pro, encore un peu plus en Agence, très grande pour le
// palier du million d'abonnés (easter egg « Le million »).
// ---------------------------------------------------------------------------
export type BioCardSize = "base" | "pro" | "agency" | "legend";

export const BIO_CARD_SIZES: Record<BioCardSize, { maxWidth: number; avatar: number; preview: number; previewAvatar: number; label: string }> = {
  base: { maxWidth: 448, avatar: 96, preview: 280, previewAvatar: 64, label: "Carte standard" },
  pro: { maxWidth: 488, avatar: 108, preview: 300, previewAvatar: 70, label: "Carte Pro, un peu plus grande" },
  agency: { maxWidth: 528, avatar: 120, preview: 320, previewAvatar: 76, label: "Carte Agence, plus grande" },
  legend: { maxWidth: 640, avatar: 148, preview: 360, previewAvatar: 88, label: "Carte « Le million », la plus grande" }
};

/** Clé de l'easter egg du million d'abonnés (voir easter-eggs/audience.ts). */
export const MILLION_FOLLOWERS_EGG = "frame-ultime-prisme";

export function bioCardSize(plan: string, millionFollowers: boolean): BioCardSize {
  if (millionFollowers) return "legend";
  if (plan === "AGENCY") return "agency";
  if (plan === "PRO") return "pro";
  return "base";
}

/** Clés de cadres débloquées, à partir des easter eggs trouvés. */
export function unlockedFrameKeys(foundEggKeys: Iterable<string>, everything = false): string[] {
  const found = new Set(foundEggKeys);
  return BIO_FRAMES.filter((f) => everything || !f.requiresEgg || found.has(f.requiresEgg)).map((f) => f.key);
}
