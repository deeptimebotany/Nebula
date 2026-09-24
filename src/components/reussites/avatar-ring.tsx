"use client";

// Anneau d'avatar gagné dans Réussites (bronze, argent, or, stellaire
// animé) : un anneau fin autour de l'avatar, qui reprend sa forme
// (`shapeClassName`, ex. « rounded-lg » ou « rounded-full »). Sans anneau,
// rend simplement l'avatar. Styles : .nb-ring-* dans globals.css.
import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";
import { ringFromCosmetics, type RingStyle } from "@/lib/reussites/catalog";
import { useCosmetics } from "@/components/cosmetics-provider";

const RING_LABEL: Record<RingStyle, string> = {
  bronze: "Anneau bronze",
  argent: "Anneau argent",
  or: "Anneau or",
  stellaire: "Anneau stellaire"
};

export function AvatarRing({ ring, shapeClassName = "rounded-full", className, children }: { ring: RingStyle | null | undefined; shapeClassName?: string; className?: string; children: ReactNode }) {
  if (!ring) return <>{children}</>;
  return (
    <span className={clsx("relative inline-flex shrink-0", shapeClassName, className)} title={RING_LABEL[ring]}>
      {children}
      <span className={clsx("nb-ring", `nb-ring-${ring}`, shapeClassName)} aria-hidden="true" />
    </span>
  );
}

/** Anneau choisi par le compte connecté (le plus prestigieux activé). */
export function useMyRing(): RingStyle | null {
  const cosmetics = useCosmetics();
  return ringFromCosmetics(["anneau-bronze-avatar", "anneau-argent-avatar", "anneau-or-avatar", "anneau-stellaire-avatar"].filter((k) => cosmetics.has(k)));
}
