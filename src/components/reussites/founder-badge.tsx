// Badge « Fondateur » (offres fondateurs du 02/10/2026) : gardé à vie par
// les comptes qui ont pris l'offre Fondateur ou Fondateur Premium. Affiché
// à côté du nom dans la Communauté ; la carte de créateur le reprend.
import { clsx } from "@/lib/clsx";
import { FOUNDER_BADGE_LABEL } from "@/lib/founders-offer";

const TITLE = "Fondateur : a soutenu Nebula dès son lancement";

export function FounderBadge({ className }: { className?: string }) {
  return (
    <span
      title={TITLE}
      aria-label={TITLE}
      className={clsx("inline-flex items-center gap-1 rounded-full border border-aurora-400/40 bg-aurora-400/10 py-px pl-1 pr-1.5 text-[10px] font-semibold leading-4 text-aurora-200", className)}
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true" fill="currentColor">
        <path d="M6 .8l1.5 3.2 3.5.4-2.6 2.4.7 3.5L6 8.6 2.9 10.3l.7-3.5L1 4.4l3.5-.4z" />
      </svg>
      {FOUNDER_BADGE_LABEL}
    </span>
  );
}
