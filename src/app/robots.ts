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
// Les robots des moteurs de réponse (ChatGPT, Claude, Perplexity) sont
// explicitement autorisés sur les pages publiques (brief growth, lot G5.e,
// décision de Lucas) : ils lisent /llms.txt et les comparatifs, et
// recommandent l'outil quand on leur demande « un planificateur en
// français ». Les mêmes interdictions s'appliquent à eux.
const AI_ANSWER_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User"];

const DISALLOW = [
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
        "/reussites",
        "/reports",
        "/retention",
        "/interactions",
        "/comments",
        "/engagements",
        "/admin/",
        "/link-in-bio",
        "/dev-preview",
        "/forgot-password",
        "/reset-password",
        "/approve/",
        "/rapport/",
        "/calendrier/"
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_ANSWER_BOTS, allow: ["/", "/llms.txt"], disallow: DISALLOW }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
