// SOURCE UNIQUE de la navigation de l'application connectée (Lot 3).
// Consommée par la barre latérale (ordinateur), le tiroir et la barre
// d'onglets (téléphone), la palette Cmd/Ctrl+K et le fil d'Ariane — avant ce
// fichier, la barre du haut, le menu latéral et la palette avaient chacun
// leur propre liste, avec des libellés différents (« Importation » /
// « Nouveau post » / « Créer une publication » pour la même page).
import {
  IconPlug,
  IconHome,
  IconCalendar,
  IconUpload,
  IconChart,
  IconList,
  IconLink,
  IconMessage,
  IconThumbUp,
  IconBioLink,
  IconMediaKit,
  IconReport,
  IconCalendarShare,
  IconRetention,
  IconUsers,
  IconCard,
  IconSettings,
  IconTrophy,
  IconFlask,
  IconHeart,
  IconGift,
  IconSparkle,
  IconSend,
  IconWrench,
  IconClock
} from "./icons";
import { TOOL_CATALOG } from "@/components/tools/tool-catalog";

export type NavIcon = (props: { className?: string }) => JSX.Element;

export interface NavItem {
  href: string;
  label: string;
  /** Libellé court pour la barre d'onglets du téléphone. */
  shortLabel?: string;
  icon: NavIcon;
  /** Une ligne pour la palette de commandes et les infobulles. */
  description?: string;
  /** Mots supplémentaires pour la recherche dans la palette. */
  keywords?: string[];
}

export interface NavGroup {
  key: string;
  /** Intitulé affiché au-dessus du groupe (aucun pour le premier). */
  label?: string;
  items: NavItem[];
}

/** Page Réussites (ex-Succès, 25/09/2026) : niveau de créateur, défis,
 *  accomplissements, et les easter eggs en dessous. Dans le menu, section
 *  Compte, sous Communauté, avec un compteur des nouveautés (voir
 *  sidebar-nav.tsx). /succes redirige ici. */
export const SUCCESS_NAV_ITEM: NavItem = {
  href: "/reussites",
  label: "Réussites",
  icon: IconTrophy,
  description: "Rang de créateur, missions de la semaine, accomplissements et easter eggs",
  keywords: ["succès", "easter eggs", "trophées", "récompenses", "niveau", "rang", "missions", "coffre", "défis", "accomplissements", "xp", "constellation", "étoiles", "compétences", "bilan", "vitrine", "carte de créateur", "leçons"]
};

// Refonte V2 (07/10/2026, maquettes de Lucas) : « Vue d'ensemble » seule en
// haut, puis cinq catégories repliables (accordéons) — Créer, Analyser,
// Présence, Clients, Communauté. Tout ce qui concerne le COMPTE (Paramètres,
// Facturation, Automatisations, Soutenir Nebula) et l'administration quitte
// la barre latérale pour le menu du profil, en haut à droite (voir
// ACCOUNT_NAV_ITEMS plus bas et profile-menu.tsx).
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "home",
    items: [{ href: "/dashboard", label: "Vue d'ensemble", shortLabel: "Accueil", icon: IconHome, description: "Vos chiffres et vos prochaines publications", keywords: ["accueil", "home", "tableau de bord"] }]
  },
  {
    key: "creer",
    label: "Créer",
    items: [
      { href: "/composer", label: "Publier", icon: IconUpload, description: "Créer et programmer une publication", keywords: ["nouveau post", "composer", "importation", "créer"] },
      { href: "/studio", label: "Studio IA", icon: IconSparkle, description: "Idées, accroches et scripts tirés de vos chiffres", keywords: ["idées", "script", "accroche", "hook", "ia", "inspiration", "vidéo"] },
      { href: "/publications", label: "Publications", icon: IconList, description: "Toutes vos publications, filtrables par statut et réseau", keywords: ["posts", "liste", "historique", "échecs"] },
      { href: "/calendar", label: "Calendrier", icon: IconCalendar, description: "Le planning de vos publications", keywords: ["agenda", "planning"] }
    ]
  },
  {
    key: "analyser",
    label: "Analyser",
    items: [
      { href: "/analytics", label: "Analytics", icon: IconChart, description: "Abonnés, portée, engagement", keywords: ["statistiques", "stats", "audience"] },
      // Deux onglets distincts depuis la séparation de l'ancien
      // « Interactions » (fourre-tout) : le TEXTE des commentaires à modérer
      // (Présence) d'un côté, les CHIFFRES d'engagement de l'autre (ici).
      { href: "/engagements", label: "Engagements", icon: IconThumbUp, description: "Likes, partages, enregistrements et vues par publication", keywords: ["réactions", "likes", "partages", "stories", "vues", "interactions"] },
      { href: "/retention", label: "Rétention IA", icon: IconRetention, description: "Analyse de rétention de vos vidéos YouTube", keywords: ["vidéo", "youtube", "analyse", "ia"] },
      // 02/10/2026 : les outils gratuits du site, préremplis avec la marque.
      {
        href: "/tools",
        label: "Outils",
        icon: IconWrench,
        description: "Taux d'engagement, meilleur moment, hashtags, bio Instagram, titre YouTube, audit",
        keywords: ["outils gratuits", "taux d'engagement", "engagement", "calculateur", "meilleur moment", "heure", "créneau", "hashtags", "bio instagram", "titre youtube", "audit", "score"]
      }
    ]
  },
  {
    key: "presence",
    label: "Présence",
    items: [
      { href: "/accounts", label: "Comptes connectés", icon: IconLink, description: "Instagram, Facebook, TikTok, YouTube", keywords: ["réseaux", "connexion", "oauth"] },
      { href: "/comments", label: "Commentaires", icon: IconMessage, description: "Modérer les commentaires reçus sur vos publications", keywords: ["interactions", "messages", "modération", "réponses"] },
      { href: "/link-in-bio", label: "Page bio", icon: IconBioLink, description: "Votre page « link in bio » publique", keywords: ["liens", "linktree", "bio"] },
      { href: "/media-kit", label: "Media kit", icon: IconMediaKit, description: "La page à envoyer aux sponsors, avec vos vrais chiffres", keywords: ["sponsors", "marques", "partenariats", "collaboration", "kit média", "presse", "pdf"] }
    ]
  },
  {
    key: "clients",
    label: "Clients",
    items: [
      { href: "/reports", label: "Rapports", icon: IconReport, description: "Page de reporting partageable et envoi automatique", keywords: ["reporting", "client", "email"] },
      { href: "/calendar-share", label: "Calendrier client", icon: IconCalendarShare, description: "Vue en lecture seule des publications à venir", keywords: ["partage", "client"] }
    ]
  },
  {
    key: "communaute",
    label: "Communauté",
    items: [{ href: "/community", label: "Communauté", icon: IconUsers, description: "Entraide, guides et partages", keywords: ["forum", "guides"] }, SUCCESS_NAV_ITEM]
  }
];

/**
 * Compte (V2) : dans le menu du profil, en haut à droite — plus dans la
 * barre latérale. Toujours dans la palette Cmd/Ctrl+K et le fil d'Ariane.
 */
export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "Paramètres", icon: IconSettings, description: "Marque, apparence, compte", keywords: ["réglages", "préférences", "thème", "mode focus"] },
  { href: "/billing", label: "Facturation", icon: IconCard, description: "Palier, paiement, factures", keywords: ["abonnement", "plan", "stripe", "prix", "tarif"] },
  { href: "/automatisations", label: "Automatisations", icon: IconPlug, description: "API, webhooks, n8n, Make, Zapier (Agence)", keywords: ["api", "webhook", "zapier", "make", "n8n", "intégrations", "clé"] },
  { href: "/support", label: "Soutenir Nebula", icon: IconHeart, description: "Donner un coup de pouce au projet", keywords: ["don", "soutien"] }
];

/** Groupe de la barre latérale qui contient `pathname` (accordéon ouvert d'office), ou null. */
export function navGroupKeyFor(pathname: string): string | null {
  const group = NAV_GROUPS.find((g) => g.items.some((i) => isNavActive(i.href, pathname)));
  return group?.key ?? null;
}

/** Lien privé du compte propriétaire (voir dev-preview.ts) — jamais dans NAV_GROUPS. */
export const OWNER_NAV_ITEM: NavItem = { href: "/dev-preview", label: "Test / QA", icon: IconFlask, description: "Aperçu de palier et tests" };
/** Autres pages réservées au compte propriétaire (menu + palette). */
export const OWNER_NAV_ITEMS: NavItem[] = [
  OWNER_NAV_ITEM,
  { href: "/admin/acquisition", label: "Acquisition", icon: IconChart, description: "D'où viennent inscrits et payants", keywords: ["admin", "stats", "croissance"] },
  { href: "/admin/bilans", label: "Bilans du mois", icon: IconSend, description: "E-mail mensuel : inscrits, envois, aperçu", keywords: ["admin", "bilan", "e-mail", "mensuel", "résumé", "rapport"] },
  { href: "/admin/lancement", label: "Lancement", icon: IconSend, description: "Pré-lancement : personnes à prévenir, annonce", keywords: ["admin", "bientôt", "liste d'attente", "ouverture", "inscriptions"] },
  { href: "/admin/messages", label: "Messages", icon: IconMessage, description: "Formulaire de contact du site", keywords: ["admin", "contact", "support", "prospects", "e-mails"] },
  { href: "/admin/partenaires", label: "Partenaires", icon: IconGift, description: "Accès Pro / Agence offerts", keywords: ["admin", "codes", "promo", "partenaires"] },
  { href: "/admin/reseaux", label: "Réseaux", icon: IconPlug, description: "Suspendre un réseau, disjoncteur", keywords: ["admin", "incident", "panne", "api", "suspendre"] },
  { href: "/admin/ia", label: "Coûts de l'IA", icon: IconChart, description: "Coût estimé par palier, budgets de l'essai", keywords: ["admin", "ia", "gemini", "coûts", "budget", "essai"] },
  { href: "/admin/statistiques", label: "Statistiques anonymes", icon: IconChart, description: "Chiffres de groupe (accord facultatif, 20 comptes min.)", keywords: ["admin", "données", "tendances", "rgpd", "anonyme"] },
  { href: "/admin/reussites", label: "Réussites (admin)", icon: IconTrophy, description: "Défi collectif, vidéos à la une", keywords: ["admin", "défi collectif", "à la une", "communauté"] },
  // 02/10/2026 : journal de toutes les mises à jour, veille des changements d'API.
  { href: "/admin/journal", label: "Journal des mises à jour", icon: IconClock, description: "Toutes les mises à jour, page par page", keywords: ["admin", "changelog", "historique", "versions", "livraisons", "zip"] },
  { href: "/admin/api", label: "Veille des API", icon: IconPlug, description: "Fin de vie des versions, annonces, signaux", keywords: ["admin", "api", "dépréciation", "changelog", "meta", "gemini", "version"] }
];


/** Pages d'administration mises en avant dans le menu du profil (les autres sont sous « Toute l'administration »). */
export const OWNER_MENU_FEATURED = ["/admin/statistiques", "/admin/partenaires", "/admin/journal"] as const;

/** Onglets de la barre du bas sur téléphone (4 + le bouton Menu). */
export const MOBILE_TAB_HREFS = ["/dashboard", "/calendar", "/composer", "/analytics"] as const;

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), ...ACCOUNT_NAV_ITEMS, ...OWNER_NAV_ITEMS];

/** Pages secondaires (sans entrée de menu) rattachées à une entrée parente pour le fil d'Ariane. */
const SECONDARY_PAGES: { prefix: string; label: string; parentHref: string }[] = [
  { prefix: "/posts/", label: "Publication", parentHref: "/publications" },
  ...TOOL_CATALOG.filter((t) => t.appHref.startsWith("/tools/")).map((t) => ({ prefix: t.appHref, label: t.title, parentHref: "/tools" })),
  { prefix: "/reussites/collection", label: "Collection des Easter eggs", parentHref: "/reussites" },
  { prefix: "/billing/garder", label: "Choisir ce que je garde", parentHref: "/billing" },
  { prefix: "/community/guides/", label: "Guide", parentHref: "/community" },
  { prefix: "/community/", label: "Discussion", parentHref: "/community" }
];

export interface ResolvedNav {
  /** Entrée de menu correspondant à la page (ou à sa page parente). */
  item: NavItem | null;
  /** Libellé de la page courante quand elle n'a pas d'entrée de menu (ex. « Publication »). */
  pageLabel: string | null;
}

/** Retrouve l'entrée de menu active pour une URL (exacte, ou page secondaire rattachée). */
export function resolveNav(pathname: string): ResolvedNav {
  const exact = ALL_NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return { item: exact, pageLabel: null };
  const secondary = SECONDARY_PAGES.find((s) => pathname.startsWith(s.prefix));
  if (secondary) {
    return { item: ALL_NAV_ITEMS.find((i) => i.href === secondary.parentHref) ?? null, pageLabel: secondary.label };
  }
  return { item: null, pageLabel: null };
}

/** Vrai si `href` est l'entrée active pour `pathname` (page exacte ou page secondaire rattachée). */
export function isNavActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  const secondary = SECONDARY_PAGES.find((s) => pathname.startsWith(s.prefix));
  return Boolean(secondary && secondary.parentHref === href);
}
