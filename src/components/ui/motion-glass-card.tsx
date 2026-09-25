"use client";

// Variante animée de <GlassCard> (voir glass-card.tsx) : même habillage
// visuel (glass-panel), mais un survol piloté par Framer Motion — légère
// élévation + inclinaison 3D très subtile qui suit le curseur, façon
// "carte tenue dans la main". Réservée aux endroits où l'ambition
// esthétique de la V2 compte le plus (Hero, widgets phares du Dashboard,
// scrubber du Calendrier) : le reste de l'appli garde .glass-panel-hover
// (CSS pur, moins coûteux) pour ne pas alourdir chaque carte de la liste.

import { m as motion } from "framer-motion";
import { useRef, type HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";
import { MotionRoot } from "@/components/motion/motion-root";

export function MotionGlassCard({
  className,
  glow = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--tilt-x", `${(-py * 6).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(px * 6).toFixed(2)}deg`);
  }

  function onMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }

  return (
    <MotionRoot>
      <motion.div
        ref={ref}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        whileHover={{ y: -4, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        style={{
          transform: "perspective(800px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
          transformStyle: "preserve-3d"
        }}
        className={clsx("glass-panel rounded-2xl p-5", glow && "glow-border-spin", className)}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </motion.div>
    </MotionRoot>
  );
}
