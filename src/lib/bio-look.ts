// Apparence de la page bio propre à certains thèmes (08/10/2026).
//
// La plupart des thèmes de page bio sont un dégradé tiré de leurs couleurs
// (voir src/lib/themes.ts) avec des boutons translucides bordés de
// l'accent. « Aube » (palier Pro) a maintenant son propre décor, choisi par
// Lucas parmi 5 propositions (« Crêtes ») : un ciel de lever de soleil
// pêche et rose, le soleil derrière des montagnes en couches du rose au
// prune, deux oiseaux qui passent ; texte prune sur le ciel, boutons prune
// pleins. Le décor lui-même est dans src/components/link-in-bio/aube-scenery.tsx.
//
// Utilisé par la vraie page publique (/l/[slug]) et par l'aperçu de
// l'éditeur (/link-in-bio), pour un rendu identique. Importable client et
// serveur (aucune dépendance au navigateur).
import type { CSSProperties } from "react";

export type BioScenery = "cretes";

export interface BioLook {
  scenery: BioScenery;
  /** Fond de secours (avant l'affichage du décor) et vignette des cadres. */
  background: string;
  /** Carte encadrée (un cadre est choisi) : verre clair posé sur le décor. */
  card: CSSProperties;
  name: CSSProperties;
  bio: CSSProperties;
  empty: CSSProperties;
  link: CSSProperties;
  avatar: CSSProperties;
  /** Initiale affichée sans photo de profil. */
  initial: CSSProperties;
}

const AUBE: BioLook = {
  scenery: "cretes",
  background: "linear-gradient(180deg, #fde2bd 0%, #f9b98a 28%, #ef8a6a 46%, #c75a6e 60%, #8e3a6e 74%, #4a1b4f 100%)",
  card: {
    background: "linear-gradient(180deg, rgba(255, 242, 226, 0.78), rgba(253, 214, 182, 0.62))",
    borderColor: "rgba(255, 255, 255, 0.45)",
    WebkitBackdropFilter: "blur(8px)",
    backdropFilter: "blur(8px)"
  },
  name: { color: "#3a1534" },
  bio: { color: "#7a3a52" },
  empty: { color: "rgba(58, 21, 52, 0.55)" },
  link: {
    background: "rgba(58, 21, 52, 0.84)",
    border: "1px solid rgba(253, 226, 189, 0.2)",
    color: "#fff3e6",
    boxShadow: "0 10px 24px -14px rgba(30, 8, 30, 0.9)"
  },
  avatar: {
    borderColor: "#fde2bd",
    background: "#3a1534",
    boxShadow: "0 0 0 1.5px #3a1534, 0 10px 24px -10px rgba(58, 21, 52, 0.6)"
  },
  initial: { color: "#fde2bd" }
};

/** Apparence propre au thème de page bio, ou null (dégradé habituel du thème). */
export function bioLook(themeKey: string | null | undefined): BioLook | null {
  return themeKey === "aube" ? AUBE : null;
}
