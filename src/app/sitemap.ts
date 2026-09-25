import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { COMPETITOR_SLUGS, UPCOMING_NETWORKS } from "@/data/competitors";

// Pages publiques uniquement : ni les pages du tableau de bord (elles exigent
// une connexion et redirigent sinon vers /login), ni les pages accessibles
// par lien privé (/rapport, /calendrier, /approve, /l — voir robots.ts et la
// balise robots "noindex" posée sur chacune), ni les anciennes adresses
// /terms et /privacy qui ne sont plus que des redirections vers /legal (une
// URL redirigée dans un sitemap est signalée comme erreur par Google).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/tarifs`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/outils`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/outils/audit`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/outils/legendes`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/outils/miniatures`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/outils/bio-instagram`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/outils/hashtags`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/outils/titre-youtube`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/outils/taux-engagement`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/outils/meilleur-moment`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/decouvrir/page-bio`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/decouvrir/rapports-clients`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/decouvrir/media-kit`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/alternatives`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...COMPETITOR_SLUGS.map((slug) => ({ url: `${SITE_URL}/alternatives/${slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...COMPETITOR_SLUGS.map((slug) => ({ url: `${SITE_URL}/prix/${slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.5 })),
    { url: `${SITE_URL}/reseaux`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...UPCOMING_NETWORKS.map((n) => ({ url: `${SITE_URL}/reseaux/${n.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.4 })),
    { url: `${SITE_URL}/securite`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.2 }
  ];
}
