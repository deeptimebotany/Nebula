// Fonds d'écran sélectionnables dans Paramètres, à assortir des thèmes de
// couleurs. Chaque fond est une valeur CSS `background` qui référence les
// mêmes variables --c-nebula-*/--c-aurora-*/--c-accent-* que les thèmes
// (voir src/lib/themes.ts) : changer de thème recolore automatiquement le
// fond choisi, sans rien recalculer. Opacités volontairement basses pour ne
// jamais nuire à la lisibilité du texte par-dessus.
import type { Plan } from "./plans";

export interface BackgroundDefinition {
  key: string;
  label: string;
  css: string;
  // Réserve ce fond à un palier minimum (voir canUseBackground ci-dessous) —
  // même mécanique que ThemeDefinition.requiresPlan dans src/lib/themes.ts.
  // Absent = disponible à tout le monde, comme les 30 fonds d'origine.
  requiresPlan?: Plan;
  // Alternative à requiresPlan : réserve ce fond à qui a trouvé l'easter egg
  // de cette clé (voir easter-eggs-registry.ts), plutôt qu'à un palier payant
  // — jamais les deux à la fois sur un même fond. Vérifié par
  // /api/settings/background (PATCH) et par la page Paramètres (client),
  // pas par canUseBackground ci-dessous qui ne connaît que les paliers.
  requiresEgg?: string;
  // Nom de la classe d'animation CSS (définie dans globals.css) à appliquer
  // en plus du dégradé `css` — voir background-provider.tsx, qui pose
  // data-background-animated sur <html> pour ces fonds-là uniquement.
  animationClass?: string;
  // Déclinaison pour le mode clair (même motif, pastel sur fond clair).
  lightCss: string;
}

// --- Deux déclinaisons de chaque fond (24/09/2026) ---------------------------
// Chaque fond est décrit une seule fois (fonction de « l'encre » ci-dessous)
// puis rendu deux fois : `css` pour le mode sombre, `lightCss` pour le mode
// clair. En clair, le fond de page devient --l-page (gris très clair), les
// teintes sombres (nebula-700) sont remplacées par des violets doux et les
// opacités ajustées : mêmes motifs, mais pastel sur blanc au lieu de
// lumineux sur noir. Voir background-provider.tsx (--app-bg / --app-bg-light)
// et globals.css (.noise-grid::before).
interface Ink {
  NEBULA: string;
  NEBULA_D: string;
  AURORA: string;
  AURORA_S: string;
  CYAN: string;
  MAGENTA: string;
  VIOLET: string;
  BASE: string;
  /** Multiplicateur d'opacité (le clair supporte moins de couleur). */
  k: number;
}

// Couleur de fond sous chaque dégradé : noir neutre (Dark UI, 24/09/2026),
// identique au fond de page (body) — plus de teinte bleu nuit.
const BASE = "#0e0e10";

const DARK_INK: Ink = {
  NEBULA: "var(--c-nebula-500)",
  NEBULA_D: "var(--c-nebula-700)",
  AURORA: "var(--c-aurora-400)",
  AURORA_S: "var(--c-aurora-300)",
  CYAN: "var(--c-accent-cyan)",
  MAGENTA: "var(--c-accent-magenta)",
  VIOLET: "var(--c-accent-violet)",
  BASE,
  k: 1
};

const LIGHT_INK: Ink = {
  NEBULA: "var(--c-nebula-500)",
  NEBULA_D: "var(--c-aurora-300)",
  AURORA: "var(--c-aurora-400)",
  AURORA_S: "var(--c-aurora-500)",
  CYAN: "var(--c-accent-cyan)",
  MAGENTA: "var(--c-accent-magenta)",
  VIOLET: "var(--c-accent-violet)",
  BASE: "var(--l-page)",
  k: 0.85
};

function makeHelpers(i: Ink) {
  const a = (alpha: number) => +(alpha * i.k).toFixed(3);
  return {
    i,
    blob: (x: string, y: string, color: string, size: string, alpha = 0.22) => `radial-gradient(circle at ${x} ${y}, rgb(${color} / ${a(alpha)}), transparent ${size})`,
    // Semis de points répété tous les `gap` (taille de calque dans le
    // raccourci « image position / taille »).
    dots: (color: string, gap: string, alpha = 0.16) => `radial-gradient(circle at 1px 1px, rgb(${color} / ${a(alpha)}) 1px, transparent 0) 0 0 / ${gap} ${gap}`,
    stripes: (angle: string, color: string, width: string, gap: string, alpha = 0.08) =>
      `repeating-linear-gradient(${angle}, rgb(${color} / ${a(alpha)}) 0 ${width}, transparent ${width} ${gap})`,
    grid: (color: string, size: string, alpha = 0.07) =>
      `repeating-linear-gradient(90deg, rgb(${color} / ${a(alpha)}) 0 1px, transparent 1px ${size}), repeating-linear-gradient(0deg, rgb(${color} / ${a(alpha)}) 0 1px, transparent 1px ${size})`,
    rays: (x: string, y: string, color: string, alpha = 0.1) => `repeating-conic-gradient(from 0deg at ${x} ${y}, rgb(${color} / ${a(alpha)}) 0deg 4deg, transparent 4deg 16deg)`,
    rings: (x: string, y: string, color: string, gap: string, alpha = 0.12) => `repeating-radial-gradient(circle at ${x} ${y}, rgb(${color} / ${a(alpha)}) 0 2px, transparent 2px ${gap})`,
    alpha: a
  };
}
type H = ReturnType<typeof makeHelpers>;

function def(
  key: string,
  label: string,
  paint: (h: H) => string,
  extra: Pick<BackgroundDefinition, "requiresPlan" | "requiresEgg" | "animationClass"> = {}
): BackgroundDefinition {
  return { key, label, css: paint(makeHelpers(DARK_INK)), lightCss: paint(makeHelpers(LIGHT_INK)), ...extra };
}

// Grand ménage du 24/09/2026 : 35 fonds → 15. On garde les plus distincts
// et les plus marquants (11 fixes + les 4 animés, dont deux récompenses
// Pro / easter egg déjà promises). Les 20 fonds retirés sont redirigés vers
// le plus proche (LEGACY_BACKGROUNDS plus bas) : un compte qui en avait
// choisi un voit automatiquement son remplaçant, sans rien perdre.
export const BACKGROUNDS: BackgroundDefinition[] = [
  // Fond par défaut « Dark UI » : un noir neutre uni, à peine éclairé en haut
  // (en clair : un gris très clair, à peine teinté en haut).
  def("mesh", "Uni (défaut)", ({ i, alpha }) =>
    i === DARK_INK
      ? `radial-gradient(ellipse 90% 45% at 50% -10%, rgb(255 255 255 / 0.035), transparent 70%), ${i.BASE}`
      : `radial-gradient(ellipse 90% 45% at 50% -10%, rgb(${i.AURORA} / ${alpha(0.08)}), transparent 70%), ${i.BASE}`
  ),
  def("nebuleuse", "Nébuleuse", ({ i, blob, dots }) => `${blob("15%", "10%", i.NEBULA, "55%")}, ${blob("85%", "90%", i.AURORA, "60%", 0.16)}, ${dots(i.AURORA, "28px")}, ${i.BASE}`),
  def("aurora-polaire", "Aurore polaire", ({ i, blob }) => `${blob("20%", "0%", i.AURORA, "70%", 0.2)}, ${blob("80%", "20%", i.CYAN, "60%", 0.14)}, ${blob("50%", "100%", i.VIOLET, "65%", 0.12)}, ${i.BASE}`),
  def("horizon", "Horizon", ({ i, alpha }) => `linear-gradient(180deg, transparent 0%, rgb(${i.NEBULA} / ${alpha(0.18)}) 70%, rgb(${i.AURORA} / ${alpha(0.1)}) 100%), ${i.BASE}`),
  def("graphite", "Graphite", ({ i, grid }) => `${grid(i.AURORA_S, "56px", 0.06)}, ${i.BASE}`),
  def("prisme", "Prisme", ({ i, stripes }) => `${stripes("35deg", i.CYAN, "1px", "34px", 0.09)}, ${stripes("-35deg", i.MAGENTA, "1px", "34px", 0.07)}, ${i.BASE}`),
  def("geode", "Géode", ({ i, rings, blob }) => `${rings("50%", "40%", i.CYAN, "26px", 0.1)}, ${blob("50%", "40%", i.VIOLET, "70%", 0.15)}, ${i.BASE}`),
  def("eclipse", "Éclipse", ({ i, blob, rings }) => `${blob("50%", "45%", i.AURORA, "35%", 0.28)}, ${rings("50%", "45%", i.AURORA_S, "18px", 0.07)}, ${i.BASE}`),
  def("vitrail", "Vitrail", ({ i, rays, blob }) => `${rays("50%", "0%", i.AURORA, 0.07)}, ${blob("50%", "100%", i.MAGENTA, "70%", 0.14)}, ${i.BASE}`),
  def("supernova", "Supernova", ({ i, blob }) => `${blob("50%", "20%", i.CYAN, "18%", 0.35)}, ${blob("50%", "20%", i.AURORA, "50%", 0.16)}, ${i.BASE}`),
  def("solstice", "Solstice", ({ i, blob }) => `${blob("100%", "0%", i.CYAN, "60%", 0.22)}, ${blob("0%", "100%", i.MAGENTA, "60%", 0.18)}, ${i.BASE}`),

  // --- Fonds animés (voir globals.css, [data-background-animated]) : deux
  // de palier, un gratuit, un débloqué par easter egg.
  def(
    "aurore-boreale-animee",
    "Aurore boréale (Pro)",
    ({ i, blob }) => `${blob("20%", "0%", i.AURORA, "70%", 0.22)}, ${blob("80%", "10%", i.CYAN, "60%", 0.16)}, ${blob("50%", "100%", i.VIOLET, "65%", 0.14)}, ${i.BASE}`,
    { requiresPlan: "PRO", animationClass: "nebula-bg-anim-aurora" }
  ),
  def(
    "nebuleuse-violette-animee",
    "Nébuleuse violette (Pro)",
    ({ i, blob, dots }) => `${blob("15%", "30%", i.VIOLET, "65%", 0.24)}, ${blob("85%", "70%", i.MAGENTA, "60%", 0.16)}, ${dots(i.VIOLET, "26px", 0.08)}, ${i.BASE}`,
    { requiresPlan: "PRO", animationClass: "nebula-bg-anim-drift" }
  ),
  // Fond animé GRATUIT : un fond animé reste accessible à tout le monde.
  def(
    "nebuleuse-scintillante-animee",
    "Nébuleuse scintillante",
    ({ i, blob, dots }) => `${dots(i.AURORA_S, "22px", 0.16)}, ${blob("30%", "20%", i.NEBULA, "60%", 0.2)}, ${blob("75%", "80%", i.AURORA, "55%", 0.14)}, ${i.BASE}`,
    { animationClass: "nebula-bg-anim-shimmer" }
  ),
  // Easter egg « Pluie d'étincelles » (voir easter-eggs-registry.ts).
  def(
    "pluie-meteores-animee",
    "Pluie de météores",
    ({ i, stripes }) => `${stripes("115deg", i.AURORA_S, "2px", "70px", 0.09)}, ${stripes("115deg", i.CYAN, "1px", "140px", 0.06)}, ${i.BASE}`,
    { requiresEgg: "meteor-shower-unlock", animationClass: "nebula-bg-anim-meteors" }
  )
];

/** Fonds retirés le 24/09/2026 → fond conservé le plus proche. */
export const LEGACY_BACKGROUNDS: Record<string, string> = {
  "maree-nocturne": "horizon",
  "poussiere-etoiles": "nebuleuse-scintillante-animee",
  dunes: "horizon",
  origami: "graphite",
  comete: "supernova",
  abysse: "mesh",
  "brume-violette": "solstice",
  constellation: "nebuleuse-scintillante-animee",
  cristaux: "prisme",
  "marais-cyan": "aurora-polaire",
  "onde-magenta": "vitrail",
  toile: "graphite",
  "foret-boreale": "aurora-polaire",
  mineral: "vitrail",
  lagune: "aurora-polaire",
  flux: "prisme",
  opale: "solstice",
  spirale: "geode",
  glacier: "aurora-polaire",
  obsidienne: "mesh"
};

/** Clé d'un fond existant : redirige les anciennes clés, sinon le défaut. */
export function resolveBackgroundKey(key: string | null | undefined): string {
  if (!key) return "mesh";
  if (BACKGROUNDS.some((b) => b.key === key)) return key;
  return LEGACY_BACKGROUNDS[key] ?? "mesh";
}

export const DEFAULT_BACKGROUND_KEY = "mesh";

export function findBackground(key: string): BackgroundDefinition {
  const resolved = resolveBackgroundKey(key);
  return BACKGROUNDS.find((b) => b.key === resolved) ?? BACKGROUNDS[0];
}

/** true si ce compte (selon son palier) peut sélectionner ce fond. */
export function canUseBackground(bg: BackgroundDefinition, plan: Plan): boolean {
  if (!bg.requiresPlan) return true;
  const order: Plan[] = ["FREE", "PRO", "AGENCY"];
  return order.indexOf(plan) >= order.indexOf(bg.requiresPlan);
}
