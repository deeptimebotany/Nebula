"use client";

// Primitives d'animation V2 ("cockpit spatial") — un point d'entrée unique
// pour les micro-interactions Framer Motion réutilisées sur la Landing, le
// Dashboard et le Calendrier : révélation séquencée à l'entrée dans le
// viewport, et un conteneur qui échelonne ses enfants automatiquement.
// Volontairement discrètes (translation courte, easing doux) pour rester
// dans l'esprit "épuré mais dense en valeur" plutôt que du motion gratuit.

import { motion, useInView, type Variants } from "framer-motion";
import { useRef, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } }
};

export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
};

/** Révèle son contenu (fondu + léger glissement vers le haut) dès qu'il
 * entre dans le viewport — ne se rejoue pas en scrollant à répétition. */
export function Reveal({
  children,
  delay = 0,
  className
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={revealVariants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Groupe d'enfants révélés en cascade (staggerChildren) — chaque enfant
 * direct doit utiliser revealVariants (via <RevealItem>) pour hériter du
 * décalage. Utile pour une grille de cartes qui apparaît "en escalier".
 *
 * Piloté par `animate` (via useInView) plutôt que `whileInView` : avec
 * whileInView, l'état "visible" n'est transmis qu'aux enfants DÉJÀ montés au
 * moment où le groupe entre dans l'écran. Un enfant ajouté ensuite (ex. les
 * cartes de stats d'Analytics, qui n'existent qu'une fois les données
 * chargées) héritait de initial="hidden" et restait invisible pour toujours
 * — constaté en prod : carte YouTube absente au-dessus du graphique. `animate`
 * est transmis par contexte, donc un enfant monté plus tard part bien de
 * "hidden" et s'anime vers "visible" tout seul. */
export function RevealGroup({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} initial="hidden" animate={inView ? "visible" : "hidden"} variants={staggerContainerVariants} className={className}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={revealVariants} className={className}>
      {children}
    </motion.div>
  );
}
