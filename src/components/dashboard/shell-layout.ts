// Largeurs de la coquille de l'application (fichier sans React : lu aussi
// par les tests).
//
// Tiroir « Demander à Nebula » sur ordinateur (voir ai-assistant.tsx et
// .nb-assistant-window dans globals.css) : 420 px de large, sous la barre du
// haut, détaché de 12 px des bords (coins arrondis). Le contenu SOUS la barre
// du haut se rétrécit d'autant quand il est posé à côté, façon YouTube
// Studio, en gardant 12 px d'écart avec lui ; la barre du haut, elle, ne
// bouge pas (demande de Lucas, 09/10/2026).
export const ASSISTANT_WIDTH = 420;
export const ASSISTANT_GAP = 12;
export const ASSISTANT_SPACE = ASSISTANT_WIDTH + 2 * ASSISTANT_GAP;

// Zoom à 130 % et plus, petites fenêtres (10/10/2026, retour de Lucas : « ça
// se chevauche ») : la barre latérale dépliée (240 px) et l'assistant ouvert
// (444 px) prenaient tellement de place que les pages, toujours en mise en
// page « ordinateur » (la fenêtre faisait plus de 1 024 px), n'avaient plus
// que 500 px : colonnes et textes se superposaient. Règle : la zone de
// contenu garde toujours au moins CONTENT_MIN px.
//   - Barre latérale : réduite en icônes d'office quand la place manque
//     (sans toucher au choix mémorisé) ; « Déplier » l'ouvre alors PAR-DESSUS
//     la page, et elle se referme au clic à côté, sur Échap ou en changeant
//     de page.
//   - Assistant : posé à côté du contenu (qui se rétrécit) seulement s'il
//     reste CONTENT_MIN px ; sinon il flotte par-dessus la page.
export const RAIL_WIDTH = 72;
export const SIDEBAR_WIDTH = 240;
/** Largeur minimale de la zone de contenu pour les mises en page « ordinateur ». */
export const CONTENT_MIN = 900;

/** Largeurs (px CSS, zoom compris) : barre latérale forcée en icônes, assistant posé à côté. */
export function shellLayout(viewport: number, assistantOpen: boolean): { docked: boolean; forcedRail: boolean } {
  const desktop = viewport >= 1024;
  const canDock = desktop && viewport - RAIL_WIDTH - ASSISTANT_SPACE >= CONTENT_MIN;
  const docked = assistantOpen && canDock;
  const forcedRail = viewport >= 768 && (viewport - SIDEBAR_WIDTH < CONTENT_MIN || (docked && viewport - SIDEBAR_WIDTH - ASSISTANT_SPACE < CONTENT_MIN));
  return { docked, forcedRail };
}
