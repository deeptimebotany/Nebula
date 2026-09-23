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
  "or-imperial": { texture: "nebula-theme-swatch-gold", frame: "nebula-theme-card-gold", badge: "Agence" },
  "eclipse-totale": { texture: "nebula-theme-swatch-eclipse", frame: "nebula-theme-card-eclipse", badge: "Agence" },
  aube: { texture: "nebula-theme-swatch-dawn", frame: "nebula-theme-card-dawn", badge: "Pro" }
};

function swatchPreview(vars: Record<string, string>) {
  const nebula500 = `rgb(${vars["--c-nebula-500"]})`;
  const aurora400 = `rgb(${vars["--c-aurora-400"]})`;
  const accentCyan = `rgb(${vars["--c-accent-cyan"]})`;
  return `linear-gradient(135deg, ${nebula500}, ${aurora400} 55%, ${accentCyan})`;
}

export function ThemeCard({ theme, selected, locked, onPick }: { theme: ThemeDefinition; selected: boolean; locked: boolean; onPick: () => void }) {
  const premium = PREMIUM[theme.key];
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
        className={clsx("relative h-12 w-full overflow-hidden rounded-lg shadow-inner", premium ? premium.texture : "", locked && "opacity-60 saturate-[0.6]")}
        style={premium ? undefined : { background: swatchPreview(theme.vars) }}
      >
        {premium && (
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
