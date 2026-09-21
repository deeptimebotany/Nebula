import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

// NOTE : les polices Google (Inter / Space Grotesk) sont chargées via
// next/font/google en production — voir globals.css pour la pile de
// secours système utilisée tant qu'elles ne sont pas activées. Pour les
// activer : `import { Inter, Space_Grotesk } from "next/font/google"` puis
// passez leurs `variable` au <html className>. Désactivé par défaut ici
// pour fonctionner même sans accès à fonts.googleapis.com au build.

export const metadata: Metadata = {
  title: "Nebula — Command Center Social",
  description:
    "Planifiez, publiez et analysez votre présence sur tous les réseaux sociaux depuis un seul cockpit sombre et lumineux."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
