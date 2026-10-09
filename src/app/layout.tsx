import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_NAME, SITE_TAGLINE, SITE_THEME_COLOR_LIGHT, SITE_URL } from "@/lib/site";
import { COLOR_MODE_SCRIPT, DEFAULT_COLOR_MODE } from "@/lib/color-mode";
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

// Titres (09/10/2026, demande de Lucas : « la même police que ElevenLabs,
// partout sur le site ») : Inter aussi, la police d'interface d'ElevenLabs
// (leurs grands titres utilisent une police payante, Waldenburg). Même
// fichier que le texte : un seul téléchargement. Space Grotesk n'est plus
// chargée (le fichier reste dans src/fonts).
const interDisplay = localFont({
  src: "../fonts/inter-variable-latin.woff2",
  variable: "--font-display",
  weight: "100 900",
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
  formatDetection: { telephone: false },
  // Validation du site dans Google Search Console / Bing Webmaster Tools
  // (SEO, 29/09/2026) : codes à coller dans Vercel, voir .env.example.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {})
  }
};

// Mode clair par défaut (29/09/2026) : barre du navigateur et contrôles
// natifs en clair avant même le chargement du CSS.
export const viewport: Viewport = {
  themeColor: SITE_THEME_COLOR_LIGHT,
  colorScheme: "light",
  width: "device-width",
  initialScale: 1
};

// Mise en page RACINE, volontairement minimale : polices, métadonnées, mode
// clair/sombre, et c'est tout. Les fournisseurs de personnalisation (thème,
// fond d'écran, thème étoilé, cosmétiques, session) ne concernent que
// l'application connectée et sont montés dans src/app/(dashboard)/layout.tsx
// — un visiteur anonyme de la page d'accueil ne déclenche ainsi aucune
// requête /api/settings/*.
//
// Mode clair/sombre (29/09/2026) : le HTML est écrit en CLAIR (valeur par
// défaut) ; le petit script de <head> passe en sombre, avant l'affichage,
// si le visiteur l'a choisi (bouton soleil/lune de la vitrine, ou réglage du
// compte recopié par le tableau de bord), et garde en sombre les pages au
// design propre (page bio, media kit…). suppressHydrationWarning : React ne
// doit pas signaler l'attribut changé par ce script. Voir color-mode.ts.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-mode={DEFAULT_COLOR_MODE} suppressHydrationWarning className={`${inter.variable} ${interDisplay.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        <CspDocumentGuard />
      </body>
    </html>
  );
}
