// Nouveautés Nebula affichées dans le centre de notifications (onglet
// « Actus »). Pour annoncer quelque chose : ajouter une entrée EN HAUT, avec
// un id unique qui ne change plus jamais (il sert à ne l'afficher qu'une
// fois par compte, voir materializeNews dans src/lib/notifications.ts) et
// la date de mise en ligne. Ne mettre ici que ce qui concerne tout le monde.
export interface NebulaNewsItem {
  id: string;
  date: string; // ISO, ex. "2026-09-25T09:00:00Z"
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
}

export const NEBULA_NEWS: NebulaNewsItem[] = [
  {
    id: "2026-09-reussites",
    date: "2026-09-24T12:00:00Z",
    title: "Nouveau : vos Réussites",
    body: "Un niveau de créateur qui monte à chaque publication, 3 défis chaque semaine, des accomplissements à débloquer et des récompenses à gagner (anneaux d'avatar, fonds, cadres de page bio).",
    href: "/reussites",
    actionLabel: "Voir mes réussites"
  },
  {
    id: "2026-09-bluesky",
    date: "2026-09-25T08:00:00Z",
    title: "Nouveau réseau : Bluesky",
    body: "Connectez votre compte Bluesky et publiez-y en même temps que sur vos autres réseaux.",
    href: "/accounts",
    actionLabel: "Connecter Bluesky"
  },
  {
    id: "2026-09-notifications",
    date: "2026-09-25T07:59:00Z",
    title: "Bienvenue dans vos notifications",
    body: "Publications en ligne, échecs à corriger, succès et parrainage : tout arrive maintenant ici, d'un coup d'œil."
  }
];
