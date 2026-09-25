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
  IconSparkle
} from "./icons";

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

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "work",
    items: [
      { href: "/dashboard", label: "Vue d'ensemble", shortLabel: "Accueil", icon: IconHome, description: "Vos chiffres et vos prochaines publications", keywords: ["accueil", "home", "tableau de bord"] },
      { href: "/composer", label: "Publier", icon: IconUpload, description: "Créer et programmer une publication", keywords: ["nouveau post", "composer", "importation", "créer"] },
      { href: "/studio", label: "Studio IA", icon: IconSparkle, description: "Idées, accroches et scripts tirés de vos chiffres", keywords: ["idées", "script", "accroche", "hook", "ia", "inspiration", "vidéo"] },
      { href: "/publications", label: "Publications", icon: IconList, description: "Toutes vos publications, filtrables par statut et réseau", keywords: ["posts", "liste", "historique", "échecs"] },
      { href: "/calendar", label: "Calendrier", icon: IconCalendar, description: "Le planning de vos publications", keywords: ["agenda", "planning"] },
      { href: "/analytics", label: "Analytics", icon: IconChart, description: "Abonnés, portée, engagement", keywords: ["statistiques", "stats", "audience"] }
    ]
  },
  {
    key: "presence",
    label: "Présence",
    items: [
      { href: "/accounts", label: "Comptes connectés", icon: IconLink, description: "Instagram, Facebook, TikTok, YouTube", keywords: ["réseaux", "connexion", "oauth"] },
      // Deux onglets distincts depuis la séparation de l'ancien
      // « Interactions » (fourre-tout) : le TEXTE des commentaires à modérer
      // d'un côté, les CHIFFRES d'engagement de l'autre — l'application a
      // vocation à accueillir d'autres plateformes (blogs…), le vocabulaire
      // doit rester clair.
      { href: "/comments", label: "Commentaires", icon: IconMessage, description: "Modérer les commentaires reçus sur vos publications", keywords: ["interactions", "messages", "modération", "réponses"] },
      { href: "/engagements", label: "Engagements", icon: IconThumbUp, description: "Likes, partages, enregistrements et vues par publication", keywords: ["réactions", "likes", "partages", "stories", "vues", "interactions"] },
      { href: "/link-in-bio", label: "Page bio", icon: IconBioLink, description: "Votre page « link in bio » publique", keywords: ["liens", "linktree", "bio"] },
      { href: "/media-kit", label: "Media kit", icon: IconMediaKit, description: "La page à envoyer aux sponsors, avec vos vrais chiffres", keywords: ["sponsors", "marques", "partenariats", "collaboration", "kit média", "presse", "pdf"] }
    ]
  },
  {
    key: "clients",
    label: "Clients",
    items: [
      { href: "/reports", label: "Rapports", icon: IconReport, description: "Page de reporting partageable et envoi automatique", keywords: ["reporting", "client", "email"] },
      { href: "/calendar-share", label: "Calendrier client", icon: IconCalendarShare, description: "Vue en lecture seule des publications à venir", keywords: ["partage", "client"] },
      { href: "/retention", label: "Rétention IA", icon: IconRetention, description: "Analyse de rétention de vos vidéos YouTube", keywords: ["vidéo", "youtube", "analyse", "ia"] }
    ]
  },
  {
    key: "account",
    label: "Compte",
    items: [
      { href: "/community", label: "Communauté", icon: IconUsers, description: "Entraide, guides et partages", keywords: ["forum", "guides"] },
      SUCCESS_NAV_ITEM,
      { href: "/billing", label: "Facturation", icon: IconCard, description: "Palier, paiement, factures", keywords: ["abonnement", "plan", "stripe", "prix", "tarif"] },
      { href: "/automatisations", label: "Automatisations", icon: IconPlug, description: "API, webhooks, n8n, Make, Zapier (Agence)", keywords: ["api", "webhook", "zapier", "make", "n8n", "intégrations", "clé"] },
      { href: "/settings", label: "Paramètres", icon: IconSettings, description: "Marque, apparence, compte", keywords: ["réglages", "préférences", "thème", "mode focus"] },
      { href: "/support", label: "Soutenir Nebula", icon: IconHeart, description: "Donner un coup de pouce au projet", keywords: ["don", "soutien"] }
    ]
  }
];

/** Lien privé du compte propriétaire (voir dev-preview.ts) — jamais dans NAV_GROUPS. */
export const OWNER_NAV_ITEM: NavItem = { href: "/dev-preview", label: "Test / QA", icon: IconFlask, description: "Aperçu de palier et tests" };
/** Autres pages réservées au compte propriétaire (menu + palette). */
export const OWNER_NAV_ITEMS: NavItem[] = [
  OWNER_NAV_ITEM,
  { href: "/admin/acquisition", label: "Acquisition", icon: IconChart, description: "D'où viennent inscrits et payants", keywords: ["admin", "stats", "croissance"] },
  { href: "/admin/partenaires", label: "Partenaires", icon: IconGift, description: "Accès Pro / Agence offerts", keywords: ["admin", "codes", "promo", "partenaires"] },
  { href: "/admin/reseaux", label: "Réseaux", icon: IconPlug, description: "Suspendre un réseau, disjoncteur", keywords: ["admin", "incident", "panne", "api", "suspendre"] },
  { href: "/admin/reussites", label: "Réussites (admin)", icon: IconTrophy, description: "Défi collectif, vidéos à la une", keywords: ["admin", "défi collectif", "à la une", "communauté"] }
];


/** Onglets de la barre du bas sur téléphone (4 + le bouton Menu). */
export const MOBILE_TAB_HREFS = ["/dashboard", "/calendar", "/composer", "/analytics"] as const;

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), ...OWNER_NAV_ITEMS];

/** Pages secondaires (sans entrée de menu) rattachées à une entrée parente pour le fil d'Ariane. */
const SECONDARY_PAGES: { prefix: string; label: string; parentHref: string }[] = [
  { prefix: "/posts/", label: "Publication", parentHref: "/publications" },
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
