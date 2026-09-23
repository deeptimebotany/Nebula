import type { Metadata } from "next";

// La page elle-même est un composant client ("use client") et ne peut donc
// pas exporter de métadonnées : ce layout minimal porte le titre et la
// description propres à l'outil (importants pour le référencement de cette
// page "aimant à visiteurs").
export const metadata: Metadata = {
  title: "Générateur de légendes IA gratuit",
  description:
    "Générez gratuitement, sans compte, des titres et légendes adaptés à Instagram, TikTok, YouTube et Facebook grâce à l'IA."
};

export default function LegendesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
