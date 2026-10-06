// Logos officiels des réseaux (06/10/2026), dans l'application seulement.
// Fichiers téléchargés par Lucas sur les pages officielles, copiés sans
// retouche (seulement redimensionnés) dans public/brands/. Ils remplacent le
// pictogramme dessiné par Nebula dans NetworkTile (network-badge.tsx) quand
// les règles de chaque réseau le permettent à la taille affichée ; sinon le
// dessin reste. Règles relevées (voir aussi le README, « Logos officiels ») :
//  - Instagram (Meta) : glyphe jamais plus petit que 29 × 29 px, entouré d'un
//    espace vide d'une demi-taille de glyphe de chaque côté, jamais retouché.
//    Cet espace ne tient pas dans nos listes : le glyphe n'est utilisé que là
//    où l'appelant le garantit (`roomy`) ;
//  - Threads (Meta) : espace vide d'un quart de la largeur autour ; noir sur
//    fond clair, blanc sur fond sombre ;
//  - Facebook (Meta) : logo principal (rond bleu et « f » blanc, jamais le
//    « f » seul), au moins 16 px de large, espace vide d'un quart de la
//    largeur autour ;
//  - Bluesky : papillon officiel, non recoloré, sans laisser croire à un
//    soutien de Bluesky ;
//  - LinkedIn : licence des conditions de l'API (« uniquement dans
//    l'application pour identifier l'intégration LinkedIn »), [in] au moins
//    21 px à l'écran, bleu sur fond clair, blanc sur fond sombre, ® lisible.
//    Jamais sur la page d'accueil ni dans la publicité sans accord écrit.
// Jamais : TikTok et Pinterest (pas d'autorisation pour une application),
// ni en gris ou transparent (couleurs non modifiables : un logo « éteint »
// reprend le dessin). YouTube garde le dessin : son icône doit mener à du
// contenu YouTube (lien), ce que nos pastilles ne font pas, et le fichier de
// l'icône seule n'a pas été fourni (seulement le logo avec le nom).
// La page d'accueil publique garde les dessins (NetworkLogo).
import type { Network } from "@/lib/types";

export interface OfficialNetworkLogo {
  /** Fichier pour le mode clair (et pour le mode sombre sans `dark`). */
  light: string;
  /** Variante pour le mode sombre (Threads blanc, LinkedIn blanc). */
  dark?: string;
  /** Plus petite pastille (px) où le logo atteint la taille minimale du réseau. */
  minPx: number;
  /** Le réseau exige un grand espace vide autour : seulement si l'appelant le garantit. */
  needsRoom?: boolean;
}

export const OFFICIAL_NETWORK_LOGOS: Partial<Record<Network, OfficialNetworkLogo>> = {
  INSTAGRAM: { light: "/brands/instagram/instagram-glyph.png", minPx: 29, needsRoom: true },
  FACEBOOK: { light: "/brands/facebook/facebook.png", minPx: 16 },
  THREADS: { light: "/brands/threads/threads-black.svg", dark: "/brands/threads/threads-white.svg", minPx: 16 },
  BLUESKY: { light: "/brands/bluesky/bluesky.png", minPx: 16 },
  // Le fichier bleu porte le ® à droite du carré : le [in] occupe 128/151 de
  // la largeur, d'où 25 px de pastille pour 21 px de logo.
  LINKEDIN: { light: "/brands/linkedin/linkedin-bug.png", dark: "/brands/linkedin/linkedin-bug-white.png", minPx: 25 }
};

/**
 * Logo officiel à montrer pour ce réseau à cette taille, ou null (le dessin
 * de Nebula reste) : taille sous le minimum du réseau, pastille « éteinte »
 * (`muted`), ou espace vide non garanti pour un réseau qui l'exige.
 */
export function officialNetworkLogo(network: Network, size: number, opts: { muted?: boolean; roomy?: boolean } = {}): OfficialNetworkLogo | null {
  const logo = OFFICIAL_NETWORK_LOGOS[network];
  if (!logo || opts.muted) return null;
  if (size < logo.minPx) return null;
  if (logo.needsRoom && !opts.roomy) return null;
  return logo;
}
