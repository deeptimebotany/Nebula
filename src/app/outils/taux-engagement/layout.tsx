import type { Metadata } from "next";

// Métadonnées de l’outil (la page est un composant client) — voir
// outils/legendes/layout.tsx pour le contexte.
export const metadata: Metadata = {
  title: "Calculateur de taux d’engagement gratuit",
  description: "Calculez votre taux d’engagement Instagram, TikTok, YouTube ou Facebook à partir de vos abonnés, j’aime, commentaires et partages — avec des ordres de grandeur par réseau. Gratuit, sans compte.",
  alternates: { canonical: "/outils/taux-engagement" }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
