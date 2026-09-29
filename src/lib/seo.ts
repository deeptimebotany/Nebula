// Référencement (SEO technique, 29/09/2026) : UNE source pour les balises
// des pages publiques et leurs données structurées (JSON-LD schema.org).
//
//  - pageMetadata : titre, description (155 caractères au plus), URL
//    canonique, Open Graph et carte Twitter PROPRES à la page. Avant, seules
//    les balises <title> et description changeaient : toutes les pages
//    partageaient le titre, la description et l'adresse de l'accueil dans
//    leurs aperçus de partage.
//  - organizationLd / websiteLd / softwareApplicationLd / webApplicationLd /
//    breadcrumbLd : ce que Google lit pour comprendre le site. Aucune note ni
//    aucun avis inventé (Google en exige pour l'affichage enrichi d'une
//    application : on ne triche pas, le balisage reste utile à la
//    compréhension). Les prix viennent de PLAN_LIMITS, jamais recopiés.
//
// Ce fichier ne doit importer aucun composant (utilisé par des routes et des
// fichiers de métadonnées).
import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { PLAN_LIMITS } from "@/lib/plans";

/** Longueur maximale d'une description (au-delà, Google la coupe). */
export const META_DESCRIPTION_MAX = 155;

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path === "/" ? "" : path.startsWith("/") ? path : `/${path}`}` || SITE_URL;
}

/** Coupe proprement une description trop longue (au dernier mot, avec « … »). */
export function clampDescription(text: string, max = META_DESCRIPTION_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

export interface PageSeo {
  /** Titre de l'onglet, sans « — Nebula » (ajouté par le gabarit du site). */
  title: string;
  description: string;
  /** Chemin canonique, ex. « /outils/hashtags ». */
  path: string;
  /** Titre des aperçus de partage, si différent (par défaut : « titre — Nebula »). */
  ogTitle?: string;
  /** Titre complet, sans le gabarit (accueil). */
  absoluteTitle?: boolean;
  /** Page exclue des moteurs (reste partageable). */
  noindex?: boolean;
}

export function pageMetadata(p: PageSeo): Metadata {
  const description = clampDescription(p.description);
  const shareTitle = p.ogTitle ?? (p.absoluteTitle ? p.title : `${p.title} — ${SITE_NAME}`);
  return {
    title: p.absoluteTitle ? { absolute: p.title } : p.title,
    description,
    alternates: { canonical: p.path },
    // Image par défaut : celle de l'accueil. Une page qui a son propre
    // fichier opengraph-image.tsx la remplace (priorité de Next.js aux
    // fichiers) ; sans cette ligne, définir `openGraph` ici effaçait l'image
    // héritée de l'accueil.
    openGraph: {
      type: "website",
      locale: SITE_LOCALE,
      siteName: SITE_NAME,
      url: p.path,
      title: shareTitle,
      description,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE_NAME} — ${SITE_TAGLINE}` }]
    },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: ["/twitter-image"] },
    ...(p.noindex ? { robots: { index: false, follow: true } } : {})
  };
}

// --- Données structurées -----------------------------------------------------

type Json = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organisation`;
const SITE_ID = `${SITE_URL}/#site`;
const APP_ID = `${SITE_URL}/#application`;

export function organizationLd(): Json {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon.png"),
    description: SITE_DESCRIPTION
  };
}

export function websiteLd(): Json {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_TAGLINE,
    inLanguage: "fr-FR",
    publisher: { "@id": ORG_ID }
  };
}

/** Nebula lui-même : application web, avec les prix réels de chaque palier. */
export function softwareApplicationLd(): Json {
  const offers = (["FREE", "PRO", "AGENCY"] as const).map((plan) => {
    const tier = PLAN_LIMITS[plan].tiers[0];
    return {
      "@type": "Offer",
      name: `${SITE_NAME} ${PLAN_LIMITS[plan].label}`,
      price: String(tier.priceMonthly),
      priceCurrency: "EUR",
      url: absoluteUrl("/tarifs"),
      ...(tier.priceMonthly > 0
        ? { priceSpecification: { "@type": "UnitPriceSpecification", price: String(tier.priceMonthly), priceCurrency: "EUR", unitText: "MONTH", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } } }
        : {})
    };
  });
  return {
    "@type": ["SoftwareApplication", "WebApplication"],
    "@id": APP_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Gestion des réseaux sociaux",
    operatingSystem: "Web (navigateur)",
    browserRequirements: "Navigateur récent (Chrome, Firefox, Safari, Edge)",
    inLanguage: "fr-FR",
    featureList: [
      "Programmation et publication sur Instagram, TikTok, YouTube, Facebook et Bluesky",
      "Statistiques unifiées de tous les comptes",
      "Rapports clients et calendrier partagé",
      "Assistant IA : titres, légendes, miniatures, idées de vidéos",
      "Page bio (link in bio) et media kit public"
    ],
    publisher: { "@id": ORG_ID },
    offers
  };
}

/** Un outil gratuit de /outils. */
export function webApplicationLd(tool: { name: string; path: string; description: string }): Json {
  return {
    "@type": "WebApplication",
    "@id": `${absoluteUrl(tool.path)}#outil`,
    name: tool.name,
    url: absoluteUrl(tool.path),
    description: clampDescription(tool.description, 300),
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web (navigateur)",
    inLanguage: "fr-FR",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    provider: { "@id": ORG_ID },
    isPartOf: { "@id": SITE_ID }
  };
}

/** Fil d'Ariane : [["Accueil", "/"], ["Outils", "/outils"], …]. */
export function breadcrumbLd(items: [name: string, path: string][]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: absoluteUrl(path) }))
  };
}

/** Données structurées d'un outil de /outils : l'application + le fil d'Ariane. */
export function toolStructuredData(tool: { toolName?: string; title: string; path: string; description: string }): Json[] {
  const name = tool.toolName ?? tool.title;
  return [
    webApplicationLd({ name, path: tool.path, description: tool.description }),
    breadcrumbLd([
      ["Accueil", "/"],
      ["Outils gratuits", "/outils"],
      [name, tool.path]
    ])
  ];
}

/** Regroupe plusieurs objets dans un seul bloc JSON-LD (@graph). */
export function ldGraph(...nodes: Json[]): Json {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/**
 * JSON sûr à placer dans un <script type="application/ld+json"> : « < » est
 * échappé, un texte ne peut donc jamais fermer la balise.
 */
export function serializeJsonLd(data: Json): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
