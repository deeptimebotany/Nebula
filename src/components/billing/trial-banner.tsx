"use client";

// Bandeaux discrets sous l'en-tête de l'application (brief growth, lot G2) :
//   - « Essai Pro — n jours restants · Passer en Pro » pendant l'essai ;
//   - « Abonnement en pause jusqu'au … · Reprendre maintenant » en pause ;
//   - « -50 % sur votre premier mois — expire dans … » tant que l'offre de
//     bienvenue court (hors essai, hors payant).
// Et la modale unique « Votre essai Pro est terminé » à la première
// ouverture après la fin de l'essai (TrialEndedNotice). Rien de tout cela
// n'est un toast : Mode focus respecté.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useToast } from "@/components/dashboard/toast";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import { IconClose } from "@/components/dashboard/icons";
import { PLAN_LIMITS } from "@/lib/plans";

const PLAN_LABEL: Record<string, string> = { FREE: PLAN_LIMITS.FREE.label, PRO: PLAN_LIMITS.PRO.label, AGENCY: PLAN_LIMITS.AGENCY.label };
import { useUpgradeModal } from "./upgrade-modal";
import type { TrialSummary } from "@/lib/billing/trial-summary";

function useCountdown(until: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [until]);
  if (!until) return null;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

export function TrialBanner() {
  const { data: me, patch } = useBootstrap();
  const toast = useToast();
  const [resuming, setResuming] = useState(false);
  const countdown = useCountdown(me?.offerExpiresAt ?? null);

  if (!me) return null;

  async function resume() {
    setResuming(true);
    try {
      const res = await fetch("/api/billing/pause", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Reprise impossible.");
      patch({ pausedUntil: null, paid: true });
      toast.success("Abonnement repris.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResuming(false);
    }
  }

  if (me.pausedUntil) {
    return (
      <div className="border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-2 text-center text-xs text-amber-200 sm:px-6">
        Abonnement en pause jusqu&apos;au {new Date(me.pausedUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — vos données sont conservées.{" "}
        <button type="button" onClick={resume} disabled={resuming} className="font-medium underline-offset-2 hover:underline">
          {resuming ? "Reprise…" : "Reprendre maintenant"}
        </button>
      </div>
    );
  }

  if (me.comp) {
    return (
      <div className="border-b border-amber-400/20 bg-amber-400/[0.06] px-4 py-2 text-center text-xs text-amber-100 sm:px-6">
        <UpgradeGem className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Accès {PLAN_LABEL[me.plan] ?? me.plan} offert{me.comp.until ? ` jusqu'au ${new Date(me.comp.until).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""} ·{" "}
        <Link href="/billing" className="font-medium underline-offset-2 hover:underline">
          Détails
        </Link>
      </div>
    );
  }

  if (me.onTrial) {
    return (
      <div className="border-b border-aurora-400/20 bg-aurora-400/[0.06] px-4 py-2 text-center text-xs text-aurora-100 sm:px-6">
        <UpgradeGem className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Essai Pro — {me.trialDaysLeft} jour{me.trialDaysLeft > 1 ? "s" : ""} restant{me.trialDaysLeft > 1 ? "s" : ""} ·{" "}
        <Link href="/billing" className="font-medium underline-offset-2 hover:underline">
          Passer en Pro
        </Link>
      </div>
    );
  }

  if (!me.paid && countdown) {
    return (
      <div className="border-b border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 text-center text-xs text-emerald-200 sm:px-6">
        -50 % sur votre premier mois Pro — expire dans {countdown} ·{" "}
        <Link href="/billing" className="font-medium underline-offset-2 hover:underline">
          En profiter
        </Link>
      </div>
    );
  }

  return null;
}

/** Modale unique « Votre essai Pro est terminé ». */
export function TrialEndedNotice() {
  const { data: me, patch } = useBootstrap();
  const { open } = useUpgradeModal();
  const [summary, setSummary] = useState<TrialSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const due = Boolean(me?.trialEndedNoticeDue) && !dismissed;

  useEffect(() => {
    if (!due) return;
    fetch("/api/billing/trial", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSummary(d))
      .catch(() => undefined);
    // Offre de bienvenue déclenchée par la fin d'essai (lot G3, trial_ended)
    fetch("/api/billing/offer", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && patch({ offerExpiresAt: d.offerExpiresAt ?? null }))
      .catch(() => undefined);
  }, [due, patch]);

  async function markSeen() {
    setDismissed(true);
    patch({ trialEndedNoticeDue: false });
    await fetch("/api/billing/trial", { method: "POST" }).catch(() => undefined);
  }

  if (!due || !summary) return null;
  const u = summary.used;
  const used: string[] = [];
  if (u.scheduledPosts > 0) used.push(`${u.scheduledPosts} publication${u.scheduledPosts > 1 ? "s" : ""} programmée${u.scheduledPosts > 1 ? "s" : ""}`);
  if (u.reportsPublished > 0) used.push(`${u.reportsPublished} rapport${u.reportsPublished > 1 ? "s" : ""} client publié${u.reportsPublished > 1 ? "s" : ""}`);
  if (u.calendarSharesPublished > 0) used.push(`${u.calendarSharesPublished} calendrier${u.calendarSharesPublished > 1 ? "s" : ""} partagé${u.calendarSharesPublished > 1 ? "s" : ""}`);
  if (u.bioLinksBeyondFree > 0) used.push(`${u.bioLinksBeyondFree} lien${u.bioLinksBeyondFree > 1 ? "s" : ""} de page bio au-delà de ${summary.locked.bioLinksLimit}`);
  if (u.retentionAnalyses > 0) used.push(`${u.retentionAnalyses} analyse${u.retentionAnalyses > 1 ? "s" : ""} de rétention`);
  if (u.brandsBeyondFree > 0) used.push(`${u.brandsBeyondFree} marque${u.brandsBeyondFree > 1 ? "s" : ""} supplémentaire${u.brandsBeyondFree > 1 ? "s" : ""}`);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="trial-ended-title" className="glass-panel-solid w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h2 id="trial-ended-title" className="font-display text-2xl font-semibold text-white">Votre essai Pro est terminé</h2>
          <button type="button" onClick={markSeen} aria-label="Fermer" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">Vous êtes passé au palier Gratuit. Rien n&apos;a été supprimé.</p>

        {used.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pendant l&apos;essai, vous avez utilisé</p>
            <ul className="mt-1.5 space-y-1 text-sm text-slate-200">
              {used.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Désormais verrouillé en Gratuit</p>
          <ul className="mt-1.5 space-y-1 text-sm text-slate-400">
            {u.bioLinksBeyondFree > 0 && <li>· Vos liens de page bio au-delà de {summary.locked.bioLinksLimit} sont désactivés (conservés, grisés « Pro »).</li>}
            {(u.reportsPublished > 0 || u.calendarSharesPublished > 0) && <li>· Vos rapports et calendriers clients sont dépubliés (« n&apos;est plus partagé »).</li>}
            {u.brandsBeyondFree > 0 && <li>· Vos marques au-delà de {summary.locked.maxBrands} passent en lecture seule.</li>}
            <li>· Assistant IA et Rétention IA ne sont plus disponibles.</li>
            <li>· Les publications déjà programmées partiront normalement.</li>
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              markSeen();
              open("generic");
            }}
            className="btn-glow inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white"
          >
            <UpgradeGem className="h-4 w-4" /> Garder Pro — {PLAN_LIMITS.PRO.tiers[0].priceMonthly} €/mois
          </button>
          <button type="button" onClick={markSeen} className="text-sm text-slate-400 transition hover:text-white">
            Continuer en Gratuit
          </button>
        </div>
      </div>
    </div>
  );
}
