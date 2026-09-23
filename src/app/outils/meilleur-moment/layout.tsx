import type { Metadata } from "next";

// Métadonnées de l’outil (la page est un composant client) — voir
// outils/legendes/layout.tsx pour le contexte.
export const metadata: Metadata = {
  title: "Meilleur moment pour publier — par réseau",
  description: "Les créneaux qui fonctionnent le mieux en moyenne sur Instagram, TikTok, YouTube et Facebook, par jour et par heure, dans votre fuseau. Gratuit, sans compte.",
  alternates: { canonical: "/outils/meilleur-moment" }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
