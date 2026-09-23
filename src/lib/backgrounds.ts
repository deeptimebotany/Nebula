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
}

const NEBULA = "var(--c-nebula-500)";
const NEBULA_D = "var(--c-nebula-700)";
const AURORA = "var(--c-aurora-400)";
const AURORA_S = "var(--c-aurora-300)";
const CYAN = "var(--c-accent-cyan)";
const MAGENTA = "var(--c-accent-magenta)";
const VIOLET = "var(--c-accent-violet)";

function blob(x: string, y: string, color: string, size: string, alpha = 0.22) {
  return `radial-gradient(circle at ${x} ${y}, rgb(${color} / ${alpha}), transparent ${size})`;
}
function dots(color: string, gap: string, alpha = 0.16) {
  return `radial-gradient(circle at 1px 1px, rgb(${color} / ${alpha}) 1px, transparent 0)`;
}
function stripes(angle: string, color: string, width: string, gap: string, alpha = 0.08) {
  return `repeating-linear-gradient(${angle}, rgb(${color} / ${alpha}) 0 ${width}, transparent ${width} ${gap})`;
}
function grid(color: string, size: string, alpha = 0.07) {
  return `repeating-linear-gradient(90deg, rgb(${color} / ${alpha}) 0 1px, transparent 1px ${size}), repeating-linear-gradient(0deg, rgb(${color} / ${alpha}) 0 1px, transparent 1px ${size})`;
}
function rays(x: string, y: string, color: string, alpha = 0.1) {
  return `repeating-conic-gradient(from 0deg at ${x} ${y}, rgb(${color} / ${alpha}) 0deg 4deg, transparent 4deg 16deg)`;
}
function rings(x: string, y: string, color: string, gap: string, alpha = 0.12) {
  return `repeating-radial-gradient(circle at ${x} ${y}, rgb(${color} / ${alpha}) 0 2px, transparent 2px ${gap})`;
}
// Couleur de fond sous chaque dégradé : noir neutre (Dark UI, 24/09/2026),
// identique au fond de page (body) — plus de teinte bleu nuit.
const BASE = "#0e0e10";

export const BACKGROUNDS: BackgroundDefinition[] = [
  // Fond par défaut « Dark UI » : un noir neutre uni, à peine éclairé en haut.
  { key: "mesh", label: "Uni (défaut)", css: `radial-gradient(ellipse 90% 45% at 50% -10%, rgb(255 255 255 / 0.035), transparent 70%), ${BASE}` },
  { key: "nebuleuse", label: "Nébuleuse", css: `${blob("15%", "10%", NEBULA, "55%")}, ${blob("85%", "90%", AURORA, "60%", 0.16)}, ${dots(AURORA, "28px")}, ${BASE}` },
  { key: "aurora-polaire", label: "Aurore polaire", css: `${blob("20%", "0%", AURORA, "70%", 0.2)}, ${blob("80%", "20%", CYAN, "60%", 0.14)}, ${blob("50%", "100%", VIOLET, "65%", 0.12)}, ${BASE}` },
  { key: "maree-nocturne", label: "Marée nocturne", css: `${stripes("100deg", AURORA, "2px", "22px", 0.07)}, ${blob("50%", "110%", NEBULA, "80%", 0.25)}, ${BASE}` },
  { key: "poussiere-etoiles", label: "Poussière d'étoiles", css: `${dots(AURORA_S, "18px", 0.14)}, ${dots(CYAN, "46px", 0.1)}, ${blob("50%", "0%", NEBULA, "70%", 0.18)}, ${BASE}` },
  { key: "prisme", label: "Prisme", css: `${stripes("35deg", CYAN, "1px", "34px", 0.07)}, ${stripes("-35deg", MAGENTA, "1px", "34px", 0.05)}, ${BASE}` },
  { key: "dunes", label: "Dunes", css: `${blob("10%", "100%", NEBULA, "60%", 0.22)}, ${blob("60%", "100%", AURORA, "55%", 0.16)}, ${blob("100%", "100%", VIOLET, "50%", 0.12)}, ${BASE}` },
  { key: "origami", label: "Origami", css: `${grid(AURORA, "42px", 0.06)}, ${blob("30%", "20%", NEBULA, "60%", 0.14)}, ${BASE}` },
  { key: "comete", label: "Comète", css: `${blob("90%", "-10%", CYAN, "45%", 0.22)}, ${stripes("115deg", AURORA_S, "1px", "60px", 0.05)}, ${BASE}` },
  { key: "abysse", label: "Abysse", css: `${blob("50%", "50%", NEBULA_D, "90%", 0.5)}, ${dots(AURORA, "34px", 0.08)}, ${BASE}` },
  { key: "vitrail", label: "Vitrail", css: `${rays("50%", "0%", AURORA, 0.06)}, ${blob("50%", "100%", MAGENTA, "70%", 0.12)}, ${BASE}` },
  { key: "geode", label: "Géode", css: `${rings("50%", "40%", CYAN, "26px", 0.09)}, ${blob("50%", "40%", VIOLET, "70%", 0.15)}, ${BASE}` },
  { key: "brume-violette", label: "Brume violette", css: `${blob("0%", "30%", VIOLET, "65%", 0.2)}, ${blob("100%", "70%", MAGENTA, "60%", 0.14)}, ${BASE}` },
  { key: "constellation", label: "Constellation", css: `${dots(AURORA, "60px", 0.18)}, ${dots(CYAN, "23px", 0.08)}, ${BASE}` },
  { key: "horizon", label: "Horizon", css: `linear-gradient(180deg, transparent 0%, rgb(${NEBULA} / 0.18) 70%, rgb(${AURORA} / 0.1) 100%), ${BASE}` },
  { key: "cristaux", label: "Cristaux", css: `${stripes("60deg", AURORA_S, "1px", "40px", 0.06)}, ${stripes("-60deg", AURORA_S, "1px", "40px", 0.06)}, ${BASE}` },
  { key: "marais-cyan", label: "Marais cyan", css: `${blob("20%", "80%", CYAN, "60%", 0.2)}, ${blob("70%", "20%", NEBULA, "65%", 0.18)}, ${dots(CYAN, "30px", 0.06)}, ${BASE}` },
  { key: "eclipse", label: "Éclipse", css: `${blob("50%", "45%", AURORA, "35%", 0.28)}, ${rings("50%", "45%", AURORA_S, "18px", 0.06)}, ${BASE}` },
  { key: "onde-magenta", label: "Onde magenta", css: `${stripes("100deg", MAGENTA, "3px", "48px", 0.06)}, ${blob("80%", "0%", VIOLET, "55%", 0.14)}, ${BASE}` },
  { key: "toile", label: "Toile", css: `${grid(CYAN, "24px", 0.05)}, ${blob("50%", "50%", NEBULA, "80%", 0.16)}, ${BASE}` },
  { key: "supernova", label: "Supernova", css: `${blob("50%", "20%", CYAN, "18%", 0.35)}, ${blob("50%", "20%", AURORA, "50%", 0.14)}, ${BASE}` },
  { key: "foret-boreale", label: "Forêt boréale", css: `${stripes("90deg", AURORA, "10px", "30px", 0.05)}, ${blob("50%", "-20%", CYAN, "60%", 0.16)}, ${BASE}` },
  { key: "mineral", label: "Minéral", css: `${rays("0%", "100%", VIOLET, 0.05)}, ${blob("0%", "100%", NEBULA, "70%", 0.24)}, ${BASE}` },
  { key: "lagune", label: "Lagune", css: `${blob("40%", "60%", CYAN, "55%", 0.2)}, ${blob("70%", "30%", AURORA_S, "45%", 0.15)}, ${dots(CYAN, "50px", 0.06)}, ${BASE}` },
  { key: "flux", label: "Flux", css: `${stripes("20deg", NEBULA, "2px", "18px", 0.09)}, ${BASE}` },
  { key: "opale", label: "Opale", css: `${blob("25%", "25%", VIOLET, "50%", 0.14)}, ${blob("75%", "25%", CYAN, "50%", 0.14)}, ${blob("50%", "80%", MAGENTA, "50%", 0.1)}, ${BASE}` },
  { key: "graphite", label: "Graphite", css: `${grid(AURORA_S, "56px", 0.045)}, ${BASE}` },
  { key: "solstice", label: "Solstice", css: `${blob("100%", "0%", CYAN, "60%", 0.22)}, ${blob("0%", "100%", MAGENTA, "60%", 0.16)}, ${BASE}` },
  { key: "spirale", label: "Spirale", css: `${rays("50%", "50%", AURORA, 0.05)}, ${rings("50%", "50%", AURORA_S, "34px", 0.05)}, ${BASE}` },
  { key: "glacier", label: "Glacier", css: `${blob("50%", "0%", CYAN, "80%", 0.18)}, ${dots(CYAN, "20px", 0.07)}, ${BASE}` },
  { key: "obsidienne", label: "Obsidienne (minimal)", css: `${blob("50%", "50%", NEBULA_D, "100%", 0.35)}, ${BASE}` },

  // --- Fonds animés de palier (voir src/lib/cosmetics.ts pour le reste du
  // catalogue de cosmétiques) : seuls fonds ANIMÉS de la liste
  // (animationClass), et seuls fonds réservés — par palier (requiresPlan)
  // ou par easter egg (requiresEgg, voir plus bas) — les 30 tout en haut
  // restent gratuits et statiques comme avant.
  {
    key: "aurore-boreale-animee",
    label: "Aurore boréale (Pro)",
    requiresPlan: "PRO",
    animationClass: "nebula-bg-anim-aurora",
    css: `${blob("20%", "0%", AURORA, "70%", 0.22)}, ${blob("80%", "10%", CYAN, "60%", 0.16)}, ${blob("50%", "100%", VIOLET, "65%", 0.14)}, ${BASE}`
  },
  {
    key: "nebuleuse-violette-animee",
    label: "Nébuleuse violette (Pro)",
    requiresPlan: "PRO",
    animationClass: "nebula-bg-anim-drift",
    css: `${blob("15%", "30%", VIOLET, "65%", 0.24)}, ${blob("85%", "70%", MAGENTA, "60%", 0.16)}, ${dots(VIOLET, "26px", 0.08)}, ${BASE}`
  },
  // Fond animé GRATUIT (aucun requiresPlan/requiresEgg) — ajouté en même
  // temps que la conversion de "Pluie de météores" en easter egg ci-dessous,
  // pour qu'un fond animé reste accessible à tout le monde, pas seulement
  // aux paliers payants ou à qui a trouvé un egg. Même technique d'animation
  // (voir globals.css, nebula-bg-anim-shimmer) que les fonds ci-dessus.
  {
    key: "nebuleuse-scintillante-animee",
    label: "Nébuleuse scintillante (gratuit)",
    animationClass: "nebula-bg-anim-shimmer",
    css: `${dots(AURORA_S, "22px", 0.16)}, ${blob("30%", "20%", NEBULA, "60%", 0.2)}, ${blob("75%", "80%", AURORA, "55%", 0.14)}, ${BASE}`
  },
  // Easter egg "Pluie d'étincelles" (voir easter-eggs-registry.ts et
  // publish.ts) : plus réservé par palier — débloqué en trouvant l'egg, pas
  // en payant. requiresEgg référence la clé de l'egg à trouver (voir
  // canUseBackground ci-dessous — pour requiresEgg, c'est /api/settings/background
  // et la page Paramètres qui vérifient, pas cette fonction).
  {
    key: "pluie-meteores-animee",
    label: "Pluie de météores",
    requiresEgg: "meteor-shower-unlock",
    animationClass: "nebula-bg-anim-meteors",
    css: `${stripes("115deg", AURORA_S, "2px", "70px", 0.09)}, ${stripes("115deg", CYAN, "1px", "140px", 0.06)}, ${BASE}`
  }
];

export const DEFAULT_BACKGROUND_KEY = "mesh";

export function findBackground(key: string): BackgroundDefinition {
  return BACKGROUNDS.find((b) => b.key === key) ?? BACKGROUNDS[0];
}

/** true si ce compte (selon son palier) peut sélectionner ce fond. */
export function canUseBackground(bg: BackgroundDefinition, plan: Plan): boolean {
  if (!bg.requiresPlan) return true;
  const order: Plan[] = ["FREE", "PRO", "AGENCY"];
  return order.indexOf(plan) >= order.indexOf(bg.requiresPlan);
}
