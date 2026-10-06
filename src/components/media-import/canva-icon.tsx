// Logo officiel de Canva (06/10/2026, revue de l'app Canva : « Replace
// custom Canva branding with the approved Canva button and icon assets »).
// Fichier : « Canva Icon logo.svg » du kit officiel
// https://www.canva.dev/assets/connect/Canva-logos.zip, copié tel quel dans
// public/brands/canva/canva-icon.svg. Consignes de Canva :
//  - jamais redessiné, recoloré, étiré ni combiné à un autre logo ;
//  - l'icône pour les surfaces de moins de 50 px (le logo écrit au-delà) ;
//  - au moins 8 px de marge tout autour, et dans un bouton toujours
//    accompagnée d'un texte qui dit l'action.
// Sans hook : utilisable dans un composant serveur.
import { clsx } from "@/lib/clsx";

export const CANVA_ICON_SRC = "/brands/canva/canva-icon.svg";

export function CanvaIcon({ size = 16, className }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={CANVA_ICON_SRC} width={size} height={size} alt="" aria-hidden="true" className={clsx("shrink-0", className)} />;
}
