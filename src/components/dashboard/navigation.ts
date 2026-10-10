// SOURCE UNIQUE de la navigation de l'application connectée (Lot 3).
// Consommée par la barre latérale (ordinateur), le tiroir et la barre
// d'onglets (téléphone), la palette Cmd/Ctrl+K et le fil d'Ariane — avant ce
// fichier, la barre du haut, le menu latéral et la palette avaient chacun
// leur propre liste, avec des libellés différents (« Importation » /
// « Nouveau post » / « Créer une publication » pour la même page).
import {
  IconPlug,
  IconChart,
  IconMessage,
  IconCard,
  IconSettings,
  IconTrophy,
  IconFlask,
  IconHeart,
  IconGift,
  IconSend,
  IconClock
} from "./icons";
import { TOOL_CATALOG } from "@/components/tools/tool-catalog";
import {
  NavIconAccounts,
  NavIconAnalytics,
  NavIconBio,
  NavIconCalendar,
  NavIconClientCalendar,
  NavIconCommunity,
  NavIconDashboard,
  NavIconInteractions,
  NavIconMediaKit,
  NavIconPublications,
  NavIconPublish,
  NavIconReports,
  NavIconStudio,
  NavIconTools,
  NavIconTrophy
} from "./nav-icons";

/** Icône d'une entrée de menu ; `filled` : version pleine de la page ouverte (nav-icons.tsx, 09/10/2026). */
export type NavIcon = (props: { className?: string; filled?: boolean }) => JSX.Element;

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
  /** « principal » ou « secondaire » : pas de titre affiché (10/10/2026), un trait les sépare. */
  key: string;
  items: NavItem[];
}

/** Page Réussites (ex-Succès, 25/09/2026) : niveau de créateur, défis,
 *  accomplissements, et les easter eggs en dessous. Dans le menu, onglets
 *  secondaires, avec un compteur des nouveautés (voir sidebar-nav.tsx).
 *  /succes redirige ici. */
export const SUCCESS_NAV_ITEM: NavItem = {
  href: "/reussites",
  label: "Réussites",
  icon: NavIconTrophy,
  description: "Rang de créateur, missions de la semaine, accomplissements et easter eggs",
  keywords: ["succès", "easter eggs", "trophées", "récompenses", "niveau", "rang", "missions", "coffre", "défis", "accomplissements", "xp", "constellation", "étoiles", "compétences", "bilan", "vitrine", "carte de créateur", "leçons"]
};

/**
 * « Publier » (10/10/2026, demande de Lucas) : plus dans le menu latéral — le
 * bouton « Publier » est en haut à droite, dans la barre du bas sur
 * téléphone, et on peut publier depuis plein d'autres endroits. L'entrée
 * reste dans la palette Cmd/Ctrl+K, le fil d'Ariane et la barre du bas.
 */
export const PUBLISH_NAV_ITEM: NavItem = {
  href: "/composer",
  label: "Publier",
  icon: NavIconPublish,
  description: "Créer et programmer une publication",
  keywords: ["nouveau post", "composer", "importation", "créer"]
};

// Menu sans catégories (10/10/2026, demande de Lucas) : plus de titres
// « Créer », « Analyser », « Présence », « Clients » ni d'accordéons. Les
// onglets PRINCIPAUX en haut, dans l'ordre choisi par Lucas, puis un trait
// fin et les onglets SECONDAIRES (pas d'épingles). Tout ce qui concerne le
// COMPTE (Paramètres, Abonnement, Automatisations, Soutenir Nebula) et
// l'administration est dans le menu du profil, en haut à droite (voir
// ACCOUNT_NAV_ITEMS plus bas et profile-menu.tsx).
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "principal",
    items: [
      { href: "/dashboard", label: "Vue d'ensemble", shortLabel: "Accueil", icon: NavIconDashboard, description: "Vos chiffres et vos prochaines publications", keywords: ["accueil", "home", "tableau de bord"] },
      { href: "/calendar", label: "Calendrier", icon: NavIconCalendar, description: "Le planning de vos publications", keywords: ["agenda", "planning"] },
      { href: "/publications", label: "Publications", icon: NavIconPublications, description: "Toutes vos publications, filtrables par statut et réseau", keywords: ["posts", "liste", "historique", "échecs"] },
      // 09/10/2026 (demande de Lucas) : Rétention IA devient un onglet
      // d'Analytics (/analytics?tab=retention) ; /retention redirige.
      {
        href: "/analytics",
        label: "Analytics",
        icon: NavIconAnalytics,
        description: "Abonnés, portée, rétention IA de vos vidéos YouTube",
        keywords: ["statistiques", "stats", "audience", "rétention", "rétention ia", "vidéo", "youtube", "analyse", "publicité"]
      },
      // 09/10/2026 (demande de Lucas) : Commentaires et Engagements réunis en
      // « Interactions » (onglets Commentaires et Engagement) ; les anciennes
      // adresses redirigent.
      {
        href: "/interactions",
        label: "Interactions",
        icon: NavIconInteractions,
        description: "Commentaires à lire et à qui répondre, likes, partages et vues de vos publications",
        keywords: ["commentaires", "engagements", "engagement", "messages", "modération", "réponses", "réactions", "likes", "partages", "stories", "vues"]
      },
      { href: "/community", label: "Communauté", icon: NavIconCommunity, description: "Entraide, avis et vidéos partagées", keywords: ["forum", "entraide", "avis"] },
      // 10/10/2026 (demande de Lucas) : Réussites passe dans les onglets
      // principaux, juste sous Communauté (« c'est un onglet important »).
      SUCCESS_NAV_ITEM
    ]
  },
  {
    key: "secondaire",
    items: [
      { href: "/studio", label: "Studio IA", icon: NavIconStudio, description: "Idées, accroches et scripts tirés de vos chiffres", keywords: ["idées", "script", "accroche", "hook", "ia", "inspiration", "vidéo"] },
      // 02/10/2026 : les outils gratuits du site, préremplis avec la marque.
      {
        href: "/tools",
        label: "Outils",
        icon: NavIconTools,
        description: "Taux d'engagement, meilleur moment, hashtags, bio Instagram, titre YouTube, audit",
        keywords: ["outils gratuits", "taux d'engagement", "engagement", "calculateur", "meilleur moment", "heure", "créneau", "hashtags", "bio instagram", "titre youtube", "audit", "score"]
      },
      { href: "/accounts", label: "Comptes connectés", icon: NavIconAccounts, description: "Instagram, Facebook, TikTok, YouTube", keywords: ["réseaux", "connexion", "oauth"] },
      { href: "/link-in-bio", label: "Page bio", icon: NavIconBio, description: "Votre page « link in bio » publique", keywords: ["liens", "linktree", "bio"] },
      { href: "/media-kit", label: "Media kit", icon: NavIconMediaKit, description: "La page à envoyer aux sponsors, avec vos vrais chiffres", keywords: ["sponsors", "marques", "partenariats", "collaboration", "kit média", "presse", "pdf"] },
      { href: "/reports", label: "Rapports", icon: NavIconReports, description: "Page de reporting partageable et envoi automatique", keywords: ["reporting", "client", "email"] },
      { href: "/calendar-share", label: "Calendrier client", icon: NavIconClientCalendar, description: "Vue en lecture seule des publications à venir", keywords: ["partage", "client"] }
    ]
  }
];

/** Onglets du menu latéral, principaux puis secondaires (sans « Publier »). */
export const SIDEBAR_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Compte (V2) : dans le menu du profil, en haut à droite — plus dans la
 * barre latérale. Toujours dans la palette Cmd/Ctrl+K et le fil d'Ariane.
 */
export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "Paramètres", icon: IconSettings, description: "Marque, apparence, sons, notifications, compte", keywords: ["réglages", "préférences", "thème", "mode focus", "mot de passe", "fuseau horaire", "notifications", "parrainage"] },
  { href: "/billing", label: "Abonnement", icon: IconCard, description: "Palier, paiement, factures", keywords: ["abonnement", "facturation", "factures", "plan", "stripe", "prix", "tarif"] },
  { href: "/automatisations", label: "Automatisations", icon: IconPlug, description: "API, webhooks, n8n, Make, Zapier (Agence)", keywords: ["api", "webhook", "zapier", "make", "n8n", "intégrations", "clé"] },
  { href: "/support", label: "Soutenir Nebula", icon: IconHeart, description: "Donner un coup de pouce au projet", keywords: ["don", "soutien"] }
];

/** Groupe de la barre latérale (« principal » ou « secondaire ») qui contient `pathname`, ou null. */
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

export const ALL_NAV_ITEMS: NavItem[] = [...SIDEBAR_NAV_ITEMS, PUBLISH_NAV_ITEM, ...ACCOUNT_NAV_ITEMS, ...OWNER_NAV_ITEMS];

/** Pages secondaires (sans entrée de menu) rattachées à une entrée parente pour le fil d'Ariane. */
const SECONDARY_PAGES: { prefix: string; label: string; parentHref: string }[] = [
  { prefix: "/posts/", label: "Publication", parentHref: "/publications" },
  ...TOOL_CATALOG.filter((t) => t.appHref.startsWith("/tools/")).map((t) => ({ prefix: t.appHref, label: t.title, parentHref: "/tools" })),
  { prefix: "/reussites/collection", label: "Collection des Easter eggs", parentHref: "/reussites" },
  { prefix: "/billing/garder", label: "Choisir ce que je garde", parentHref: "/billing" },
  { prefix: "/community/membre/", label: "Profil", parentHref: "/community" },
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
