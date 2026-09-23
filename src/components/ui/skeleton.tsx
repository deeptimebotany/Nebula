// Squelettes de chargement partagés : à afficher à la place d'un texte
// « Chargement... » (23 occurrences avant ce fichier) ou d'un écran vide
// (Suspense fallback={null}). Un squelette garde la mise en page stable et
// dit visuellement CE QUI arrive (une liste, des cartes, un graphique).
// Respecte prefers-reduced-motion : l'animation de pulsation est coupée
// globalement dans globals.css.
import type { HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";
import { GlassCard } from "./glass-card";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={clsx("animate-pulse rounded-lg bg-white/[0.06]", className)} {...props} />;
}

/** Plusieurs lignes de texte fantômes, largeurs décroissantes. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-3/5"];
  return (
    <div aria-hidden="true" className={clsx("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={clsx("h-3", widths[i % widths.length])} />
      ))}
    </div>
  );
}

/** Carte fantôme aux dimensions d'une GlassCard (titre + lignes). */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <GlassCard hover={false} className={className} aria-hidden="true">
      <Skeleton className="mb-4 h-4 w-1/3" />
      <SkeletonText lines={lines} />
    </GlassCard>
  );
}

/** Grille de cartes fantômes (ex : 4 StatCards de la Vue d'ensemble). */
export function SkeletonGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={2} />
      ))}
      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}

/** Squelette d'une page entière de l'application (en-tête + grille de cartes) — même forme que (dashboard)/loading.tsx. */
export function PageSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <SkeletonGrid count={4} />
      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}
