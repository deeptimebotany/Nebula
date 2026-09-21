import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

// NOTE : les polices Google (Inter / Space Grotesk) sont chargées via
// next/font/google en production — voir globals.css pour la pile de
// secours système utilisée tant qu'elles ne sont pas activées. Pour les
// activer : `import { Inter, Space_Grotesk } from "next/font/google"` puis
// passez leurs `variable` au <html className>. Désactivé par défaut ici
// pour fonctionner même sans accès à fonts.googleapis.com au build.

// Domaine de production réel (voir la propriété Vercel "nebulahub.space").
// Sert de base à metadataBase (URL canonique/OG ci-dessous) et à
// sitemap.ts/robots.ts. Si vous changez de domaine un jour, ne le modifiez
// qu'ICI plutôt que dans chaque fichier.
const SITE_URL = "https://nebulahub.space";

// "NebulaHub" (et non juste "Nebula") dans le titre/les métadonnées : c'est
// le nom exact de votre domaine (nebulahub.space), donc celui qui doit
// apparaître dans les résultats Google — pour que la recherche de votre nom
// de marque matche clairement avec votre site plutôt qu'avec les autres
// produits qui s'appellent aussi "Nebula"/"NebulaHub" (Lean, IA éducative...
// voir discussion). Le nom affiché DANS l'app (barre du haut, etc.) reste
// "Nebula" tout court, inchangé — seul le titre/SEO change ici.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "NebulaHub — Command Center Social",
  description:
    "Planifiez, publiez et analysez votre présence sur tous les réseaux sociaux depuis un seul cockpit sombre et lumineux.",
  openGraph: {
    title: "NebulaHub — Command Center Social",
    description:
      "Planifiez, publiez et analysez votre présence sur tous les réseaux sociaux depuis un seul cockpit sombre et lumineux.",
    url: SITE_URL,
    siteName: "NebulaHub",
    locale: "fr_FR",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "NebulaHub — Command Center Social",
    description:
      "Planifiez, publiez et analysez votre présence sur tous les réseaux sociaux depuis un seul cockpit sombre et lumineux."
  }
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
