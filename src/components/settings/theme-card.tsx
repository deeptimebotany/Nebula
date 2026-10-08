"use client";

// Carte de sélection d'un thème (Paramètres → Thème de couleurs, et Page
// bio → Thème de la page). Refonte du 24/09/2026 pour les thèmes de palier
// Or Impérial, Éclipse totale et Aube : l'ancien aplat dégradé se fondait
// dans la grille. Chaque thème premium reçoit maintenant une texture qui
// lui est propre (dorure métallique, couronne d'éclipse, lever de soleil),
// un cadre qui scintille au survol (anneau conique doré/ambré qui tourne)
// et un reflet lumineux qui balaie la vignette — voir globals.css
// (.nebula-theme-card-*). Les thèmes standard gardent l'aplat simple.
import { clsx } from "@/lib/clsx";
import { IconLock } from "@/components/dashboard/icons";
import type { ThemeDefinition } from "@/lib/themes";

const PREMIUM: Record<string, { texture: string; frame: string; badge: string }> = {
  "or-imperial": { texture: "nebula-theme-swatch-gold", frame: "nebula-theme-card-gold", badge: "Pro" },
  "eclipse-totale": { texture: "nebula-theme-swatch-eclipse", frame: "nebula-theme-card-eclipse", badge: "Agence" },
  aube: { texture: "nebula-theme-swatch-dawn", frame: "nebula-theme-card-dawn", badge: "Pro" }
};

function swatchPreview(vars: Record<string, string>) {
  const nebula500 = `rgb(${vars["--c-nebula-500"]})`;
  const aurora400 = `rgb(${vars["--c-aurora-400"]})`;
  const accentCyan = `rgb(${vars["--c-accent-cyan"]})`;
  return `linear-gradient(135deg, ${nebula500}, ${aurora400} 55%, ${accentCyan})`;
}

// Page bio (08/10/2026) : « Aube » y a son propre décor, des montagnes au
// lever du soleil (voir aube-scenery.tsx) ; sa vignette montre ce paysage
// en miniature au lieu de l'aperçu du tableau de bord.
function BioCretesMini() {
  return (
    <>
      <span className="aube-mini-sun" />
      <svg viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
        <path fill="#a24a6c" d="M0 14 L14 6 L26 11 L40 2 L54 10 L68 4 L82 12 L96 3 L110 9 L120 6 L120 40 L0 40Z" />
        <path fill="#6e2b62" d="M0 22 L16 14 L32 20 L50 12 L66 21 L84 13 L100 19 L120 13 L120 40 L0 40Z" />
        <path fill="#2c0f33" d="M0 31 L22 24 L44 30 L66 23 L88 30 L108 25 L120 28 L120 40 L0 40Z" />
      </svg>
      <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[#fde2bd] bg-[#3a1534]" />
      <span className="absolute left-1/2 top-[18px] h-[5px] w-[44%] -translate-x-1/2 rounded-full bg-[#3a1534]/85" />
      <span className="absolute left-1/2 top-[26px] h-[5px] w-[44%] -translate-x-1/2 rounded-full bg-[#3a1534]/85" />
      <span className="nebula-theme-sheen" aria-hidden="true" />
    </>
  );
}

export function ThemeCard({
  theme,
  selected,
  locked,
  onPick,
  context = "app"
}: {
  theme: ThemeDefinition;
  selected: boolean;
  locked: boolean;
  onPick: () => void;
  /** « bio » : choix du thème de la page bio (vignette propre à Aube). */
  context?: "app" | "bio";
}) {
  const premium = PREMIUM[theme.key];
  const bioCretes = context === "bio" && theme.key === "aube";
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={clsx(
        "group relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-left transition",
        premium && "nebula-theme-card",
        premium?.frame,
        selected ? "border-aurora-400 bg-white/[0.04]" : locked ? "border-dashed border-white/10 hover:border-white/20" : "border-white/10 hover:border-white/25"
      )}
    >
      {locked && (
        <span className="absolute right-1.5 top-1.5 z-[2] flex h-5 w-5 items-center justify-center rounded-full bg-void-950/90 text-slate-300">
          <IconLock className="h-3 w-3" />
        </span>
      )}
      <span
        className={clsx("relative h-12 w-full overflow-hidden rounded-lg shadow-inner", bioCretes ? "nebula-theme-swatch-cretes" : premium ? premium.texture : "", locked && "opacity-60 saturate-[0.6]")}
        style={premium ? undefined : { background: swatchPreview(theme.vars) }}
        data-swatch={bioCretes ? "aube-cretes" : undefined}
      >
        {bioCretes ? (
          <BioCretesMini />
        ) : premium && (
          <>
            {/* Mini aperçu : barre latérale + deux cartes, pour « voir » le thème */}
            <span className="nebula-theme-mini absolute inset-x-2 bottom-1.5 top-2 rounded-md">
              <span className="nebula-theme-mini-side" />
              <span className="nebula-theme-mini-card" style={{ top: 3, left: 12, width: 18 }} />
              <span className="nebula-theme-mini-card" style={{ top: 3, left: 33, width: 10 }} />
              <span className="nebula-theme-mini-card" style={{ top: 12, left: 12, width: 31, height: 5 }} />
            </span>
            <span className="nebula-theme-sheen" aria-hidden="true" />
          </>
        )}
      </span>
      <span className={clsx("text-xs", premium ? "font-medium text-white" : "text-slate-300")}>{theme.label.replace(/ \((Agence|Pro)\)$/, "")}</span>
      {premium && <span className={clsx("nebula-theme-badge rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", locked ? "opacity-70" : "")}>{premium.badge}</span>}
      {!premium && locked && <span className="text-[10px] text-amber-400">Palier {theme.requiresPlan}</span>}
    </button>
  );
}
