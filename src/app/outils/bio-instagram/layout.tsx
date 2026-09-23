import type { Metadata } from "next";

// Métadonnées de l’outil (la page est un composant client) — voir
// outils/legendes/layout.tsx pour le contexte.
export const metadata: Metadata = {
  title: "Générateur de bio Instagram gratuit (IA)",
  description: "Cinq propositions de bio Instagram de 150 caractères maximum, adaptées à votre activité et à votre ton, générées par l’IA. Gratuit, sans compte.",
  alternates: { canonical: "/outils/bio-instagram" }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
