"use client";

// Bouton soleil/lune des pages publiques (29/09/2026 : clair par défaut,
// sombre au choix). Le choix est gardé dans ce navigateur, et relu avant
// l'affichage par le script de la mise en page racine (color-mode.ts) :
// aucune requête, aucun compte. Dans l'application connectée, c'est le
// réglage du compte qui fait foi (mode-provider.tsx).
//
// Les deux icônes sont dans le HTML ; le CSS n'affiche que la bonne
// (.nb-when-light / .nb-when-dark, globals.css) : juste dès la première
// image, même sur les pages pré-générées.
import { IconMoon, IconSun } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";
import { COLOR_MODE_STORAGE_KEY, type ColorMode } from "@/lib/color-mode";

export function ModeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next: ColorMode = root.dataset.mode === "dark" ? "light" : "dark";
    root.dataset.mode = next;
    try {
      localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
    } catch {
      /* navigation privée stricte : le choix vaut pour cette page */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Changer de mode : clair ou sombre"
      title="Mode clair / sombre"
      className={clsx(
        "flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/5 hover:text-white",
        className
      )}
    >
      <IconMoon className="nb-when-light h-[18px] w-[18px]" />
      <IconSun className="nb-when-dark h-[18px] w-[18px]" />
    </button>
  );
}
