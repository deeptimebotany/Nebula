// Cœur des demandes d'avis (10/10/2026) : vide quand on peut en mettre un,
// plein et rose quand on l'a mis (petite animation, coupée si l'on réduit
// les animations).
import { clsx } from "@/lib/clsx";

export function HeartGlyph({ on, className }: { on: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={on ? 0 : 2} strokeLinejoin="round">
      <path d="M12 20.5s-7.5-4.6-9.6-9.2C1 8.2 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.7 0 5.6 3.7 4.2 6.8-2.1 4.6-9.6 9.2-9.6 9.2Z" />
    </svg>
  );
}

/** Cœur posé sur la proposition : vide au survol, plein (rose) quand on l'a mis. */
export function HeartBadge({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      className={clsx(
        "flex h-8 w-8 items-center justify-center rounded-full transition",
        on ? "nb-heart-pop bg-rose-500 text-white shadow-lg shadow-rose-500/30" : "bg-black/55 text-white/80 group-hover:bg-black/70 group-hover:text-white",
        className
      )}
      data-testid={on ? "heart-on" : "heart-off"}
    >
      <HeartGlyph on={on} className="h-4 w-4" />
    </span>
  );
}
