import type { Metadata } from "next";

// Métadonnées de l’outil (la page est un composant client) — voir
// outils/legendes/layout.tsx pour le contexte.
export const metadata: Metadata = {
  title: "Générateur de hashtags gratuit (IA)",
  description: "Des hashtags larges, moyens et de niche pour Instagram, TikTok, YouTube ou Facebook, générés par l’IA selon votre thématique. Gratuit, sans compte.",
  alternates: { canonical: "/outils/hashtags" }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
