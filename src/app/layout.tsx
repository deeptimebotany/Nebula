import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_NAME, SITE_TAGLINE, SITE_THEME_COLOR, SITE_URL } from "@/lib/site";
import { CspDocumentGuard } from "@/components/csp-document-guard";

// Polices AUTO-HÉBERGÉES (fichiers dans src/fonts, voir LICENSES.md) :
// servies par le site lui-même, sans aucun appel à Google Fonts ni au build
// ni chez le visiteur — pas de dépendance réseau, pas de transfert de
// données vers un tiers, et un rendu identique partout. next/font génère les
// @font-face, précharge les fichiers et calcule une police de repli aux
// mêmes métriques pour éviter tout saut de mise en page.
//
// Les variables --font-sans / --font-display sont posées sur <html> et
// consommées par tailwind.config.ts (fontFamily.sans / fontFamily.display).
const inter = localFont({
  src: "../fonts/inter-variable-latin.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap"
});

const spaceGrotesk = localFont({
  src: "../fonts/space-grotesk-variable-latin.woff2",
  variable: "--font-display",
  weight: "300 700",
  display: "swap"
});

// Pas de rendu forcé à chaque visite ici (lot 11) : les pages de la vitrine
// (src/lib/csp.ts, STATIC_PAGES) sont pré-générées au build et servies
// depuis le cache de Vercel, avec une CSP sans nonce. Les pages à CSP
// stricte (nonce différent à chaque requête) déclarent elles-mêmes
// `dynamic = "force-dynamic"`, dans la page ou leur layout — vérifié par
// tests/quality/csp.test.ts. (Lot 5 → 10 : toutes les pages étaient rendues
// à chaque visite.)

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "planification réseaux sociaux",
    "publication Instagram TikTok YouTube Facebook",
    "outil community manager",
    "analytics réseaux sociaux",
    "rapports clients agence"
  ],
  openGraph: {
    type: "website",
    locale: SITE_LOCALE,
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION
    // L'image est ajoutée automatiquement par Next.js depuis
    // src/app/opengraph-image.tsx (et twitter-image.tsx).
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  themeColor: SITE_THEME_COLOR,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1
};

// Mise en page RACINE, volontairement minimale : polices, métadonnées, et
// c'est tout. Les fournisseurs de personnalisation (thème, fond d'écran,
// thème étoilé, cosmétiques, mode clair, session) ne concernent que
// l'application connectée et sont montés dans src/app/(dashboard)/layout.tsx
// — un visiteur anonyme de la page d'accueil ne déclenche ainsi plus aucune
// requête /api/settings/*, et voit toujours la vitrine telle qu'elle a été
// conçue, quelles que soient les préférences enregistrées dans son navigateur.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <CspDocumentGuard />
      </body>
    </html>
  );
}
