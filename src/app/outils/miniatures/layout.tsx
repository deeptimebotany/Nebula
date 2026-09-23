import type { Metadata } from "next";

// Même rôle que src/app/outils/legendes/layout.tsx : la page est un
// composant client, ce layout porte ses métadonnées.
export const metadata: Metadata = {
  title: "Générateur de miniatures IA gratuit",
  description:
    "Créez gratuitement, sans compte, des idées de miniatures percutantes pour vos vidéos YouTube, TikTok et Instagram grâce à l'IA."
};

export default function MiniaturesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
