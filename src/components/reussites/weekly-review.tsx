"use client";

// Bilan de la semaine (Réussites v2, lot B) : les trois chiffres de la
// semaine passée, puis UN cap choisi pour la semaine en cours. Compte pour
// la compétence Stratégie (premier bilan, 3 semaines d'affilée, 8 bilans).
import Link from "next/link";
import { useState } from "react";
import { NETWORK_META, type Network } from "@/lib/types";
import type { ReviewDTO } from "@/lib/reussites/types";
import type { ReviewFocus } from "@/lib/reussites/review";
import { clsx } from "@/lib/clsx";

const fmt = (n: number) => n.toLocaleString("fr-FR");

function Figure({ label, value, detail, empty }: { label: string; value: string; detail?: string | null; empty?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 truncate font-display text-2xl font-semibold tabular-nums text-white">{value}</p>
      {detail && <p className="mt-0.5 truncate text-xs text-slate-400">{detail}</p>}
      {empty && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{empty}</p>}
    </div>
  );
}

export function WeeklyReview({ review, busy, onChoose, highlight }: { review: ReviewDTO; busy: boolean; onChoose: (focus: ReviewFocus) => void; highlight: boolean }) {
  const [editing, setEditing] = useState(false);
  const chosen = review.options.find((o) => o.key === review.focus) ?? null;
  const showOptions = !review.done || editing;
  const gained = review.followersGained;
  const top = review.top;

  return (
    <section id="bilan" aria-labelledby="bilan-title" className={clsx("scroll-mt-24 space-y-3 rounded-2xl", highlight && "nb-focus-flash")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="bilan-title" className="font-display text-lg font-semibold text-white">
            Bilan de la semaine
          </h2>
          <p className="text-xs text-slate-400">Semaine passée, {review.weekLabel}. Trois chiffres, puis un seul cap pour cette semaine.</p>
        </div>
        {review.done && <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-300">Bilan fait</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure
          label="Abonnés gagnés"
          value={gained === null ? "—" : `${gained > 0 ? "+" : ""}${fmt(gained)}`}
          empty={gained === null ? "Pas assez de relevés : synchronisez vos comptes dans Analytics." : undefined}
        />
        <Figure
          label="Publication la plus vue"
          value={top ? `${fmt(top.views)} vues` : "—"}
          detail={top ? `${top.title || "Sans titre"} · ${NETWORK_META[top.network as Network]?.label ?? top.network}` : null}
          empty={top ? undefined : "Aucune vue relevée : actualisez vos statistiques dans Engagements."}
        />
        <Figure label="Publications en ligne" value={fmt(review.posts)} detail={`sur ${review.days} jour${review.days > 1 ? "s" : ""}`} />
      </div>

      {chosen && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-aurora-400/30 bg-aurora-500/[0.07] px-4 py-3">
          <p className="text-sm text-white">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aurora-300">Cap de la semaine · </span>
            {chosen.label}
          </p>
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-aurora-300 transition hover:text-white">
            Changer
          </button>
        </div>
      )}

      {showOptions && (
        <div className="space-y-2">
          <p className="text-sm text-slate-300">Votre cap pour cette semaine :</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2" role="group" aria-label="Choisir le cap de la semaine">
            {review.options.map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={o.key === review.focus}
                disabled={busy}
                onClick={() => {
                  onChoose(o.key);
                  setEditing(false);
                }}
                className={clsx(
                  "min-h-[44px] rounded-xl border px-3.5 py-2.5 text-left text-sm transition disabled:opacity-60",
                  o.key === review.focus ? "border-aurora-400/60 bg-aurora-400/[0.12] font-semibold text-white" : "border-white/[0.1] text-slate-300 hover:border-aurora-400/40 hover:text-white"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            Un bilan par semaine compte pour la compétence Stratégie. Ensuite, choisissez une mission Progression qui va dans le sens de ce cap.{" "}
            <Link href="/analytics" className="text-aurora-300 hover:text-white">
              Synchroniser mes statistiques
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
