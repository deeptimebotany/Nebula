"use client";

// Racine des animations framer-motion (lot 6) :
//  - LazyMotion : les composants animés utilisent `m` (léger) et le moteur
//    d'animation (motion/features.ts) est téléchargé APRÈS l'affichage ;
//  - MotionConfig reducedMotion="user" : le réglage « Réduire les
//    animations » du système est respecté (lot 4).
// Chaque composant animé (Reveal, MotionGlassCard, horloge, scrubber,
// aperçu de Publier…) porte sa propre racine : les pages sans animation ne
// chargent rien de framer-motion. Tout composant `m.*` DOIT être sous une
// racine, sinon il resterait dans son état initial (souvent invisible). Des
// racines imbriquées ne posent pas de problème (le moteur est téléchargé
// une seule fois).
import { LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

const loadMotionFeatures = () => import("./features").then((mod) => mod.default);

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
