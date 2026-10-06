"use client";

// Variante animée de <GlassCard> (voir glass-card.tsx) : même habillage
// visuel (glass-panel), mais un survol piloté par Framer Motion — légère
// élévation + inclinaison 3D très subtile qui suit le curseur, façon
// "carte tenue dans la main". Réservée aux endroits où l'ambition
// esthétique de la V2 compte le plus (Hero, widgets phares du Dashboard) :
// le reste de l'appli garde .glass-panel-hover (CSS pur, moins coûteux)
// pour ne pas alourdir chaque carte de la liste.
//
// 03/10/2026 : l'inclinaison passait par une transformation CSS écrite à la
// main, que Framer Motion remplaçait par la sienne au premier survol : la
// carte penchait en 3D puis sautait à plat (« Évolution des abonnés » qui
// bouge dans tous les sens au premier survol). Tout passe maintenant par les
// valeurs de Framer Motion (rotateX / rotateY + perspective), l'inclinaison
// diminue sur les grandes cartes, et `still` garde immobiles les cartes
// qu'on lit ou qu'on manipule (graphiques, calendrier).

import { m as motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { type HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";
import { MotionRoot } from "@/components/motion/motion-root";

/** Inclinaison maximale (degrés) : 6° sur une petite carte, moins sur une grande. */
export function tiltAmplitude(width: number): number {
  if (!(width > 0)) return 0;
  return Math.min(6, 1800 / width);
}

export function MotionGlassCard({
  className,
  glow = false,
  still = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  glow?: boolean;
  /** Carte immobile au survol (graphique, calendrier : on y lit, on y clique). */
  still?: boolean;
}) {
  const reduce = useReducedMotion();
  const moving = !still && !reduce;
  const spring = { stiffness: 300, damping: 24 };
  const rotateX = useSpring(useMotionValue(0), spring);
  const rotateY = useSpring(useMotionValue(0), spring);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const amp = tiltAmplitude(rect.width);
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateX.set(-py * amp);
    rotateY.set(px * amp);
  }

  function onMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <MotionRoot>
      <motion.div
        onMouseMove={moving ? onMouseMove : undefined}
        onMouseLeave={moving ? onMouseLeave : undefined}
        whileHover={moving ? { y: -4, scale: 1.01 } : undefined}
        transition={{ type: "spring", ...spring }}
        style={moving ? { rotateX, rotateY, transformPerspective: 800 } : undefined}
        className={clsx("glass-panel rounded-2xl p-5", glow && "glow-border-spin", className)}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </motion.div>
    </MotionRoot>
  );
}
