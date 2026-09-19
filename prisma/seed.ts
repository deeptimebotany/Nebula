import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GUIDES = [
  {
    slug: "demarrer-avec-nebula",
    title: "Nebula pour les débutants absolus",
    summary: "Le guide ultra simple pour poster votre première vidéo, étape par étape, même si vous n'avez jamais utilisé un outil comme celui-ci.",
    order: 0,
    body: `Ce guide part du principe que vous n'avez jamais utilisé Nebula, ni aucun autre outil de gestion de réseaux sociaux. Chaque étape est volontairement détaillée : suivez-les dans l'ordre et tout ira bien.

## Étape 1 — Connecter vos comptes
Allez dans l'onglet "Comptes" (en haut de l'écran), ou utilisez le petit "+" à côté du nom de votre marque dans la barre de navigation. Cliquez sur le réseau que vous voulez ajouter (Instagram, TikTok, YouTube...) puis suivez les écrans de connexion. C'est exactement comme vous connecter normalement sur ce réseau : Nebula ne voit jamais votre mot de passe.

## Étape 2 — Comprendre votre formule
À côté du nom de votre marque, en haut de l'écran, un petit badge indique votre formule (Gratuit, Pro ou Agence). Chaque formule a un nombre de publications par mois, un nombre de comptes connectés et un nombre de marques que vous pouvez gérer — allez dans "Facturation" pour voir le détail ou changer de formule.

## Étape 3 — Créer votre première publication
Cliquez sur "Composer". Ajoutez votre vidéo ou votre image, écrivez un titre et une légende, puis cochez le ou les réseaux sur lesquels vous voulez publier. Vous pouvez personnaliser le texte pour chaque réseau si besoin.

## Étape 4 — Programmer ou publier immédiatement
En bas du composer, choisissez une date et une heure pour programmer votre publication, ou publiez-la tout de suite. Elle apparaîtra ensuite dans le "Calendrier".

## Étape 5 — Suivre ce qui se passe
Une fois publiée, ouvrez la publication pour voir son statut sur chaque réseau, copier son lien, ou (si vous êtes en formule Pro/Agence) analyser sa rétention grâce à l'assistant IA.

## Astuces
- Le raccourci Ctrl+Entrée (ou Cmd+Entrée sur Mac) valide rapidement une publication depuis le composer.
- Vos brouillons sont sauvegardés automatiquement : pas de panique si vous fermez la page par erreur.
- Une question, un bug, une idée ? Le Forum de la Communauté est fait pour ça.`
  },
  {
    slug: "choisir-sa-formule",
    title: "Quelle formule choisir : Gratuit, Pro ou Agence ?",
    summary: "Un résumé simple des différences entre les trois formules pour savoir laquelle correspond à votre usage.",
    order: 1,
    body: `## Gratuit
1 marque, 4 comptes connectés au choix, 20 publications programmées par mois, sans assistant IA. Idéal pour découvrir Nebula ou gérer une seule marque simple.

## Pro
Jusqu'à 3, 5 ou 10 marques selon le palier choisi, tous les réseaux disponibles avec la possibilité d'ajouter un deuxième compte par réseau (double compte partout), 100 publications par marque et par mois, assistant IA (légendes, analyse de rétention vidéo, miniatures).

## Agence
Jusqu'à 15, 25 ou 50 marques selon le palier choisi, comptes et publications illimités, publication en masse (une seule vidéo envoyée en un clic vers tous les comptes/réseaux que vous sélectionnez), tout ce que propose Pro — pensé pour gérer plusieurs marques ou clients à la fois.

Pour Pro comme pour Agence, vous choisissez vous-même combien de marques vous voulez pouvoir gérer : le prix augmente avec ce nombre. Vous pouvez aussi régler votre abonnement au mois ou à l'année depuis "Facturation" — l'abonnement annuel revient toujours moins cher que 12 mois payés séparément.`
  },
  {
    slug: "partager-une-video-communaute",
    title: "Partager une vidéo dans la Communauté",
    summary: "Comment fonctionne le partage de vos vidéos déjà publiées dans l'onglet « Vidéos du jour ».",
    order: 2,
    body: `Le partage vers la Communauté est entièrement volontaire : rien n'est jamais partagé automatiquement.

## Comment partager
Ouvrez une publication déjà en ligne (statut "Publié") depuis le Calendrier, puis cliquez sur "Partager avec la communauté" à côté du réseau concerné.

## Ce qui est partagé
Uniquement le lien vers la publication d'origine (sur Instagram, TikTok, etc.) et sa miniature. Nebula ne recopie jamais votre fichier vidéo : les visiteurs cliquent sur le lien pour la regarder directement sur la plateforme d'origine.

## Retirer un partage
Vous pouvez retirer un partage à tout moment ; seul l'auteur du partage peut le faire.`
  }
];

async function main() {
  for (const g of GUIDES) {
    await prisma.guide.upsert({
      where: { slug: g.slug },
      update: { title: g.title, summary: g.summary, body: g.body, order: g.order },
      create: g
    });
  }
  console.log(`Guides synchronisés : ${GUIDES.length}`);
  // Il n'y a plus de compte de démonstration créé ici : chaque utilisateur
  // crée son propre compte gratuit Nebula depuis /register, puis ajoute
  // lui-même ses marques et connecte ses comptes réseaux.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
