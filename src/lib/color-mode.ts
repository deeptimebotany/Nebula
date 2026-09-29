// Mode clair / sombre (29/09/2026 : le mode CLAIR devient celui par défaut,
// partout — vitrine, outils, connexion, application ; le sombre reste au
// choix). Un seul endroit pour la valeur par défaut, la clé du navigateur,
// les pages qui gardent leur propre design sombre, et le petit script posé
// dans <head> par src/app/layout.tsx.
//
// Ce fichier ne contient que des constantes : il est importé par le
// middleware (Edge), par la mise en page racine et par des composants
// client.

export type ColorMode = "dark" | "light";

export const DEFAULT_COLOR_MODE: ColorMode = "light";

/**
 * Clé du navigateur. Nouvelle clé au passage au clair par défaut : les
 * navigateurs qui avaient « dark » sous l'ancienne clé (« nebula:mode »,
 * recopiée automatiquement depuis le compte quand le sombre était la valeur
 * par défaut) repartent en clair, au lieu de garder un choix jamais fait.
 */
export const COLOR_MODE_STORAGE_KEY = "nebula:color-mode";
export const LEGACY_COLOR_MODE_STORAGE_KEY = "nebula:mode";

/**
 * Pages au design propre, toujours affichées telles qu'elles ont été
 * dessinées (sans les règles [data-mode="light"] de globals.css) : page
 * bio, media kit, rapport client, calendrier partagé, approbation. Elles
 * suivent le thème choisi par leur propriétaire, pas le mode du visiteur.
 */
export const FORCED_DARK_PREFIXES = ["/l", "/kit", "/rapport", "/calendrier", "/approve"] as const;

export function isForcedDarkPath(pathname: string): boolean {
  return FORCED_DARK_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isColorMode(value: unknown): value is ColorMode {
  return value === "dark" || value === "light";
}

const FORCED_DARK_PATTERN = FORCED_DARK_PREFIXES.map((p) => p.slice(1)).join("|");

/**
 * Script lancé dans <head>, avant l'affichage : pose le mode sur <html>
 * (clair par défaut, déjà écrit dans le HTML ; sombre si le visiteur l'a
 * choisi dans ce navigateur, ou sur une page au design propre). Aucun
 * clignotement, sur les pages pré-générées comme sur les autres.
 *
 * CSP : autorisé par 'unsafe-inline' sur la vitrine et par son empreinte
 * (COLOR_MODE_SCRIPT_HASH) sur les pages à CSP stricte — voir csp.ts. Toute
 * modification du texte impose de recalculer l'empreinte :
 * tests/quality/color-mode.test.ts échoue et donne la bonne valeur.
 */
export const COLOR_MODE_SCRIPT =
  "(function(){try{var d=document.documentElement;" +
  `d.dataset.mode=/^\\/(${FORCED_DARK_PATTERN})(\\/|$)/.test(location.pathname)||` +
  `localStorage.getItem("${COLOR_MODE_STORAGE_KEY}")==="dark"?"dark":"light"` +
  "}catch(e){}})()";

/** Empreinte SHA-256 (base64) de COLOR_MODE_SCRIPT, pour la CSP stricte. */
export const COLOR_MODE_SCRIPT_HASH = "sha256-Cyrx2PK8STxV7zk7VLb8LT/uwbCg+R7YsM/un2vWtsQ=";

/**
 * Script du tableau de bord (avec le nonce de la page) : applique tout de
 * suite le mode enregistré dans le compte, y compris sur un appareil où le
 * navigateur n'a encore rien mémorisé.
 */
export function accountModeScript(mode: ColorMode): string {
  const m = mode === "dark" ? "dark" : "light";
  return `(function(){var d=document.documentElement;if(d.dataset.mode!=="${m}")d.dataset.mode="${m}";try{localStorage.setItem("${COLOR_MODE_STORAGE_KEY}","${m}")}catch(e){}})()`;
}
