import type { MetadataRoute } from "next";

// Domaine de production réel — voir la même constante dans layout.tsx
// (dupliquée ici volontairement : Next.js exige que sitemap.ts reste un
// fichier autonome, sans import depuis un composant "use client").
const SITE_URL = "https://nebulahub.space";

// Pages publiques uniquement (pas les pages du dashboard, qui exigent une
// connexion et redirigent sinon vers /login — inutile de les faire explorer
// par Google, voir robots.ts pour leur exclusion explicite).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 }
  ];
}
