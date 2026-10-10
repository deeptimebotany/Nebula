"use client";

// Onglets de la page « Interactions » (09/10/2026, demande de Lucas :
// Commentaires et Engagements réunis) : soulignés, comme ceux d'Analytics.
import Link from "next/link";
import { clsx } from "@/lib/clsx";

export type InteractionsView = "comments" | "engagement";

export const INTERACTIONS_TABS: { id: InteractionsView; label: string; href: string }[] = [
  { id: "comments", label: "Commentaires", href: "/interactions" },
  { id: "engagement", label: "Engagement", href: "/interactions?vue=engagement" }
];

export function InteractionsTabs({ current }: { current: InteractionsView }) {
  return (
    <nav aria-label="Interactions" className="nb-tabrow gap-1">
      {INTERACTIONS_TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          scroll={false}
          aria-current={t.id === current ? "page" : undefined}
          className={clsx(
            "shrink-0 border-b-2 px-3 py-2.5 text-[14px] transition",
            t.id === current ? "border-current font-semibold text-white" : "border-transparent text-slate-400 hover:text-white"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
