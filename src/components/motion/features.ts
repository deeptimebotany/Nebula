// Fonctionnalités d'animation de framer-motion (animations, gestes, mises en
// page animées du calendrier) chargées APRÈS l'affichage de la page (lot 6) :
// les composants `m.*` s'affichent tout de suite dans leur état initial, puis
// s'animent dès que ce morceau est arrivé. Voir providers.tsx (LazyMotion).
import { domMax } from "framer-motion";

export default domMax;
