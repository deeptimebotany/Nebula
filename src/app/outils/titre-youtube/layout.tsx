import type { Metadata } from "next";

// Métadonnées de l’outil (la page est un composant client) — voir
// outils/legendes/layout.tsx pour le contexte.
export const metadata: Metadata = {
  title: "Testeur de titre YouTube gratuit",
  description: "Notez votre titre YouTube (longueur, chiffre, mot fort, question) et obtenez trois reformulations plus accrocheuses par l’IA. Gratuit, sans compte.",
  alternates: { canonical: "/outils/titre-youtube" }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
