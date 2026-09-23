import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Autorise l'exploration des pages publiques (accueil, outils, inscription,
// pages légales) et bloque tout ce qui exige un compte (tableau de bord,
// composer, communauté, facturation...), l'API, ainsi que les pages
// accessibles par lien privé (réinitialisation de mot de passe, lien
// d'approbation client, rapport client, calendrier client) qui n'ont aucune
// valeur de référencement et ne doivent jamais apparaître dans les résultats
// de recherche. Ces dernières portent en plus une balise robots "noindex"
// (voir leur page.tsx), au cas où un lien externe y pointerait. Les pages
// « link in bio » (/l/[slug]) sont publiques par nature (une marque les met
// dans ses bios) : elles restent explorables, rendues côté serveur avec leur
// propre titre.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/composer",
        "/calendar",
        "/calendar-share",
        "/posts",
        "/accounts",
        "/analytics",
        "/billing",
        "/community",
        "/settings",
        "/support",
        "/succes",
        "/reports",
        "/retention",
        "/interactions",
        "/comments",
        "/engagements",
        "/link-in-bio",
        "/dev-preview",
        "/forgot-password",
        "/reset-password",
        "/approve/",
        "/rapport/",
        "/calendrier/"
      ]
    },
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
