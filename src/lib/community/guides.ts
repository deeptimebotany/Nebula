// Guides de la Communauté (onglet « Guides »), écrits par l'équipe Nebula.
//
// 10/10/2026 (question de Lucas : « ce sont des guides que je dois mettre
// moi ? ») : les guides vivaient seulement dans prisma/seed.ts, qu'il faut
// lancer à la main sur chaque base — jamais fait sur le site de test, d'où
// « Aucun guide disponible ». Ils sont maintenant dans le code : visibles
// partout dès le déploiement, sans commande. Réécrits pour l'interface V2
// (menu sans catégories, « Publier » en haut à droite, « Programmer » qui
// ouvre le calendrier…) ; les chiffres des formules viennent de plans.ts.
// Un guide ajouté en base (table Guide) avec un autre identifiant s'affiche
// en plus ; à identifiant égal, celui du code l'emporte.
import { PLAN_LIMITS, type Plan } from "@/lib/plans";

export interface CommunityGuide {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  order: number;
}

const many = (n: number, one: string, more: string, unlimitedFrom = 9999) => (n >= unlimitedFrom ? `${more} illimité${more.endsWith("s") ? "s" : ""}` : `${n} ${n > 1 ? more : one}`);

function brandsOf(plan: Plan): string {
  const counts = PLAN_LIMITS[plan].tiers.map((t) => t.maxBrands);
  if (counts.length === 1) return many(counts[0], "marque", "marques");
  return `de ${counts[0]} à ${counts[counts.length - 1]} marques selon l'option choisie (${counts.join(", ")})`;
}

function planLine(plan: Plan): string {
  const l = PLAN_LIMITS[plan];
  const posts = l.maxPostsPerMonth >= 99999 ? "publications illimitées" : `${l.maxPostsPerMonth} publications programmées par mois et par marque`;
  const accounts = l.maxConnections >= 9999 ? "comptes connectés illimités" : `${l.maxConnections} comptes connectés par marque (Instagram et Facebook comptent chacun pour un)`;
  return `${brandsOf(plan)}, ${accounts}, ${posts}, ${l.aiEnabled ? "assistant IA inclus" : "sans assistant IA"}.`;
}

function planGuideBody(): string {
  return [
    `## ${PLAN_LIMITS.FREE.label}`,
    `${planLine("FREE")} Idéal pour découvrir Nebula ou gérer une seule marque simple.`,
    "",
    `## ${PLAN_LIMITS.PRO.label}`,
    `${planLine("PRO")} L'assistant IA écrit vos titres et descriptions à partir de votre vidéo, analyse la rétention de vos vidéos YouTube et propose des idées dans le Studio IA. Rapports clients, calendrier client et media kit public sont inclus.`,
    "",
    `## ${PLAN_LIMITS.AGENCY.label}`,
    `${planLine("AGENCY")} Tout ce que propose ${PLAN_LIMITS.PRO.label}, plus la publication en masse (une même vidéo envoyée en un clic vers tous les comptes choisis) et la marque blanche : pensé pour gérer plusieurs marques ou clients à la fois.`,
    "",
    "## Changer de formule",
    "Cliquez sur votre photo en haut à droite, puis « Facturation » : vous y voyez votre formule, les prix, et vous pouvez payer au mois ou à l'année (l'année revient toujours moins cher que 12 mois payés séparément)."
  ].join("\n");
}

const GUIDES: CommunityGuide[] = [
  {
    id: "guide-demarrer-avec-nebula",
    slug: "demarrer-avec-nebula",
    title: "Nebula pour les débutants absolus",
    summary: "Le guide ultra simple pour poster votre première vidéo, étape par étape, même si vous n'avez jamais utilisé un outil comme celui-ci.",
    order: 0,
    body: [
      "Ce guide part du principe que vous n'avez jamais utilisé Nebula, ni aucun autre outil de gestion de réseaux sociaux. Suivez les étapes dans l'ordre et tout ira bien.",
      "",
      "## Étape 1 — Connecter vos comptes",
      "Dans le menu à gauche, ouvrez « Comptes connectés ». Cliquez sur le réseau à ajouter (YouTube, Instagram, Facebook, TikTok…) et suivez les écrans de connexion du réseau, comme quand vous vous connectez d'habitude. Nebula ne voit jamais votre mot de passe.",
      "",
      "## Étape 2 — Votre formule",
      "Cliquez sur votre photo, en haut à droite : votre formule (Gratuit, Pro ou Agence) est affichée à côté de votre nom. « Facturation » donne le détail et permet d'en changer.",
      "",
      "## Étape 3 — Créer votre première publication",
      "Cliquez sur « Publier », en haut à droite. Ajoutez votre vidéo ou votre image, écrivez le titre et la description, puis choisissez les réseaux. Si l'assistant IA est inclus dans votre formule, « Rédiger avec l'IA » regarde d'abord votre vidéo, puis propose un titre et une description. Vous pouvez adapter le texte pour chaque réseau.",
      "",
      "## Étape 4 — Publier tout de suite ou programmer",
      "« Publier maintenant » envoie tout de suite. « Programmer » ouvre un calendrier : choisissez le jour et l'heure (Nebula vous propose votre meilleur créneau). La publication apparaît ensuite dans « Calendrier » et dans « Publications ».",
      "",
      "## Étape 5 — Suivre ce qui se passe",
      "Dans « Publications », chaque ligne montre où en est la publication sur chaque réseau ; cliquez sur son titre pour ouvrir sa fiche. « Analytics » rassemble vos chiffres et « Interactions » les commentaires à lire et à qui répondre.",
      "",
      "## Astuces",
      "- Ctrl+K (Cmd+K sur Mac) : chercher une page ou une action et y aller tout de suite.",
      "- « Demander à Nebula », en haut à droite, répond à vos questions sur la page où vous êtes.",
      "- Vos brouillons sont enregistrés automatiquement : pas de panique si vous fermez la page par erreur.",
      "- Une question, un bug, une idée ? Le Forum de la Communauté est fait pour ça."
    ].join("\n")
  },
  {
    id: "guide-choisir-sa-formule",
    slug: "choisir-sa-formule",
    title: "Quelle formule choisir : Gratuit, Pro ou Agence ?",
    summary: "Un résumé simple des différences entre les trois formules pour savoir laquelle correspond à votre usage.",
    order: 1,
    body: planGuideBody()
  },
  {
    id: "guide-partager-une-video-communaute",
    slug: "partager-une-video-communaute",
    title: "Partager une vidéo dans la Communauté",
    summary: "Comment fonctionne le partage de vos vidéos déjà publiées dans l'onglet « Vidéos du jour ».",
    order: 2,
    body: [
      "Le partage vers la Communauté est entièrement volontaire : rien n'est jamais partagé automatiquement.",
      "",
      "## Comment partager",
      "Dans « Publications », cliquez sur le titre d'une publication déjà en ligne pour ouvrir sa fiche, puis sur « Partager avec la communauté » à côté du réseau concerné.",
      "",
      "## Ce qui est partagé",
      "Uniquement le lien vers la publication d'origine (sur Instagram, TikTok, YouTube…) et sa miniature. Nebula ne recopie jamais votre fichier vidéo : on clique sur le lien pour la regarder directement sur le réseau.",
      "",
      "## Retirer un partage",
      "Vous pouvez retirer un partage à tout moment ; seul l'auteur du partage peut le faire."
    ].join("\n")
  }
];

/** Guides écrits par l'équipe Nebula (dans le code). */
export function builtInGuides(): CommunityGuide[] {
  return GUIDES;
}

/** Guides du code + guides ajoutés en base (autres identifiants), dans l'ordre. */
export function mergeGuides(fromDb: CommunityGuide[]): CommunityGuide[] {
  const slugs = new Set(GUIDES.map((g) => g.slug));
  return [...GUIDES, ...fromDb.filter((g) => !slugs.has(g.slug))].sort((a, b) => a.order - b.order);
}

/**
 * Corps d'un guide (markdown léger : « ## titre », listes « - ») en HTML
 * simple. Un bloc qui commence par un titre garde la suite comme paragraphe
 * (avant, le texte sous un titre était affiché en titre lui aussi).
 */
export function guideBodyHtml(body: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraph = (lines: string[]): string => {
    const kept = lines.filter((l) => l.trim() !== "");
    if (kept.length === 0) return "";
    if (kept.every((l) => l.startsWith("- "))) return `<ul>${kept.map((l) => `<li>${esc(l.slice(2))}</li>`).join("")}</ul>`;
    return `<p>${kept.map(esc).join("<br/>")}</p>`;
  };
  return body
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines[0].startsWith("## ")) return `<h2>${esc(lines[0].slice(3))}</h2>${paragraph(lines.slice(1))}`;
      return paragraph(lines);
    })
    .join("");
}
