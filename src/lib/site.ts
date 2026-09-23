// Identité publique du site — UNE seule source pour le nom, l'adresse et la
// description par défaut, réutilisée par layout.tsx (metadata), sitemap.ts,
// robots.ts, l'image OpenGraph et les emails. Le nom officiel est "Nebula"
// (décision du 22/09/2026) ; l'adresse reste nebulahub.space.
//
// Ce fichier ne doit importer aucun composant ni rien de "use client" :
// sitemap.ts et robots.ts l'importent et Next.js exige qu'ils restent
// autonomes.
export const SITE_NAME = "Nebula";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://nebulahub.space";
export const SITE_TAGLINE = "Planifiez, publiez et analysez vos réseaux sociaux";
export const SITE_DESCRIPTION =
  "Nebula centralise Instagram, TikTok, YouTube et Facebook : planification, publication multi-réseaux, analytics unifiées et rapports clients, dans un seul espace.";
export const SITE_LOCALE = "fr_FR";
// Couleur de fond de l'application (voir --app-bg dans globals.css) — sert
// de theme-color au navigateur et de fond aux images de partage.
export const SITE_THEME_COLOR = "#0e0e10";
// Adresse de contact affichée sur les pages publiques (footer, pages
// légales). À remplacer par une adresse sur le domaine (ex.
// contact@nebulahub.space) dès qu'elle existe — un seul endroit à changer.
export const SITE_CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "nommelucas@gmail.com";

// Informations légales de l'éditeur (mentions légales, CGU, confidentialité).
// Renseignées par variables d'environnement pour être mises à jour sans
// toucher au code, dès que la micro-entreprise de Lucas est immatriculée.
// Tant qu'elles sont vides, les pages légales l'indiquent honnêtement
// (« en cours d'immatriculation ») au lieu d'afficher des valeurs inventées.
export const SITE_LEGAL = {
  // Raison sociale / nom de l'entrepreneur individuel tel qu'immatriculé.
  publisherName: process.env.NEXT_PUBLIC_LEGAL_NAME || "",
  // Forme juridique (ex. « Entrepreneur individuel (micro-entreprise) »).
  publisherForm: process.env.NEXT_PUBLIC_LEGAL_FORM || "Entrepreneur individuel (micro-entreprise)",
  // Numéro SIREN (9 chiffres) ou SIRET.
  siren: process.env.NEXT_PUBLIC_LEGAL_SIREN || "",
  // Adresse postale du siège (peut être une domiciliation).
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "",
  // Directeur / responsable de la publication.
  publicationDirector: process.env.NEXT_PUBLIC_LEGAL_DIRECTOR || "",
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
