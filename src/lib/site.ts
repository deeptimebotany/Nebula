// Identité publique du site — UNE seule source pour le nom, l'adresse et la
// description par défaut, réutilisée par layout.tsx (metadata), sitemap.ts,
// robots.ts, l'image OpenGraph et les emails. Le nom officiel est "Nebula"
// (décision du 22/09/2026) ; l'adresse reste nebulahub.space.
//
// Ce fichier ne doit importer aucun composant ni rien de "use client" :
// sitemap.ts et robots.ts l'importent et Next.js exige qu'ils restent
// autonomes.
import { networksSentence } from "@/lib/types";

export const SITE_NAME = "Nebula";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://nebulahub.space";
export const SITE_TAGLINE = "Planifiez, publiez et analysez vos réseaux sociaux";
export const SITE_DESCRIPTION = `Nebula réunit ${networksSentence()} : programmation, statistiques et rapports clients, dans un seul espace.`;
export const SITE_LOCALE = "fr_FR";
// Couleur de fond de l'application (voir --app-bg dans globals.css) — sert
// de theme-color au navigateur et de fond aux images de partage.
export const SITE_THEME_COLOR = "#0e0e10";
// Fond des pages en mode clair (--l-page dans globals.css), le mode par
// défaut depuis le 29/09/2026 : theme-color du navigateur.
export const SITE_THEME_COLOR_LIGHT = "#f0f2f5";
// Adresse de contact affichée sur les pages publiques (footer, pages
// légales) : boîte Zoho du domaine, créée le 29/09/2026.
export const SITE_CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@nebulahub.space";

// Informations légales de l'éditeur (mentions légales, confidentialité).
// Entreprise individuelle de Lucas, immatriculée au RNE le 23/09/2026 (avis
// de situation reçu le 29/09/2026). Les variables d'environnement
// NEXT_PUBLIC_LEGAL_* restent possibles pour corriger une valeur sans
// toucher au code ; vides, ce sont les valeurs ci-dessous qui s'affichent.
// SIREN et SIRET : clé de Luhn vérifiée par tests/quality/legal.test.ts.
export const SITE_LEGAL = {
  // Nom de l'entrepreneur individuel tel qu'immatriculé.
  publisherName: process.env.NEXT_PUBLIC_LEGAL_NAME || "Lucas Nommé",
  // Nom commercial déclaré pour l'établissement.
  tradeName: SITE_NAME,
  publisherForm: process.env.NEXT_PUBLIC_LEGAL_FORM || "Entrepreneur individuel (micro-entreprise)",
  // 9 chiffres, sans espaces (affichage : formatSiren).
  siren: (process.env.NEXT_PUBLIC_LEGAL_SIREN || "130498751").replace(/\s/g, ""),
  // 14 chiffres : SIREN + NIC de l'établissement principal.
  siret: (process.env.NEXT_PUBLIC_LEGAL_SIRET || "13049875100010").replace(/\s/g, ""),
  registeredAt: "23 septembre 2026",
  registry: "Registre national des entreprises (RNE)",
  apeCode: "58.29C",
  apeLabel: "Édition de logiciels applicatifs",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "1 chemin du Four, Le Bouchet, 79370 Aigondigné, France",
  // Responsable de la publication (l'entrepreneur lui-même).
  publicationDirector: process.env.NEXT_PUBLIC_LEGAL_DIRECTOR || "Lucas Nommé",
  // Hébergeur du site (Vercel) et de la base de données (Neon).
  host: {
    name: "Vercel Inc.",
    address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
    url: "https://vercel.com"
  },
  database: {
    name: "Neon Inc.",
    url: "https://neon.tech"
  }
} as const;

/** « 130498751 » → « 130 498 751 » ; SIRET : « 130 498 751 00010 ». */
export function formatSiren(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  if (digits.length === 14) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, "$1 $2 $3 $4");
  return value;
}

/** Clé de contrôle des numéros SIREN / SIRET (algorithme de Luhn). */
export function isValidSirenOrSiret(value: string): boolean {
  const digits = value.replace(/\s/g, "");
  if (!/^\d{9}$|^\d{14}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
