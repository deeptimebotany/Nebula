import type { MetadataRoute } from "next";

const SITE_URL = "https://nebulahub.space";

// Autorise l'exploration des pages publiques (accueil, connexion,
// inscription, pages légales) et bloque tout ce qui exige un compte
// (dashboard, composer, communauté, facturation...), l'API, ainsi que les
// pages à jeton (réinitialisation de mot de passe, lien d'approbation
// client) qui n'ont aucune valeur de référencement et ne doivent jamais
// apparaître dans les résultats de recherche.
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
        "/posts",
        "/accounts",
        "/analytics",
        "/billing",
        "/community",
        "/settings",
        "/support",
        "/forgot-password",
        "/reset-password",
        "/approve/"
      ]
    },
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
