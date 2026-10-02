"use client";

// Fin de l'année « Fondateur Premium » (02/10/2026, voir
// src/lib/billing/founders.ts) : « Quel forfait vous faut-il ? », posée une
// fois (me.founder.endPending). Un forfait choisi ouvre directement le
// paiement Stripe (mensuel) ; « Rester en Gratuit » clôt la question ;
// « Plus tard » la repose à la prochaine session. Rien n'est jamais prélevé
// sans ce choix.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrap } from "@/components/bootstrap-provider";
import { FounderBadge } from "@/components/reussites/founder-badge";
import { PLAN_LIMITS, findTier, upToBrandsText, type PaidPlan } from "@/lib/plans";

const END_CHOICES: { key: "PRO-1" | "PRO-5" | "PRO-10" | "AGENCY"; plan: PaidPlan; maxBrands: number; hint: string }[] = [
  { key: "PRO-1", plan: "PRO", maxBrands: 1, hint: "Comme cette année" },
  { key: "PRO-5", plan: "PRO", maxBrands: 5, hint: "Plusieurs projets ou clients" },
  { key: "PRO-10", plan: "PRO", maxBrands: 10, hint: "Petite agence" },
  { key: "AGENCY", plan: "AGENCY", maxBrands: 15, hint: "Comptes et publications illimités" }
];

/** Fin de l'année Premium : « Quel forfait vous faut-il ? » (une fois). */
export function FounderEndModal() {
  const { data: me, patch } = useBootstrap();
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("nebula:founder-end-later") === "1") setHidden(true);
    } catch {
      // stockage indisponible : la question s'affiche
    }
  }, []);
  if (!me?.founder?.endPending || hidden) return null;

  async function answer(choice: string) {
    await fetch("/api/billing/founder-end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }) }).catch(() => undefined);
  }

  async function later() {
    setHidden(true);
    try {
      sessionStorage.setItem("nebula:founder-end-later", "1");
    } catch {
      // rien
    }
    await answer("later");
  }

  async function stayFree() {
    setHidden(true);
    patch({ founder: { ...me!.founder, endPending: false } });
    await answer("free");
  }

  async function pick(c: (typeof END_CHOICES)[number]) {
    setBusy(c.key);
    setError(null);
    await answer(c.key);
    patch({ founder: { ...me!.founder, endPending: false } });
    if (!me?.billingEnabled) {
      router.push("/billing#paliers");
      setHidden(true);
      return;
    }
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: c.plan, interval: "month", maxBrands: c.maxBrands, reason: "founder_end" }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) {
        window.location.assign(d.url);
        return;
      }
      setError(typeof d.error === "string" ? d.error : "Le paiement n'a pas pu s'ouvrir : choisissez votre forfait dans Facturation.");
    } catch {
      setError("Le paiement n'a pas pu s'ouvrir : choisissez votre forfait dans Facturation.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="founder-end-title" className="glass-panel-solid w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl sm:p-8">
        <p className="flex items-center gap-2">
          <FounderBadge />
        </p>
        <h2 id="founder-end-title" className="mt-3 font-display text-2xl font-semibold text-white">
          Quel forfait vous faut-il ?
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Votre année Fondateur Premium est terminée : merci de l&apos;avoir rendue possible. Rien n&apos;a été prélevé ; vous êtes en Gratuit et tout est
          conservé. Choisissez la suite, tout se réactive aussitôt.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {END_CHOICES.map((c) => {
            const tier = findTier(c.plan, c.maxBrands);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => void pick(c)}
                  disabled={busy !== null}
                  className="flex w-full flex-col items-start rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition hover:border-aurora-400/50 hover:bg-aurora-400/[0.06] disabled:opacity-60"
                >
                  <span className="text-sm font-medium text-white">
                    {PLAN_LIMITS[c.plan].label} · {upToBrandsText(c.maxBrands)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {tier ? `${tier.priceMonthly} € / mois` : ""} · {busy === c.key ? "Redirection…" : c.hint}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => void stayFree()} className="text-sm font-medium text-slate-200 underline-offset-2 hover:underline">
            Rester en Gratuit
          </button>
          <button type="button" onClick={() => void later()} className="text-sm text-slate-400 transition hover:text-white">
            Plus tard
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">L&apos;annuel (2 mois offerts) et tous les détails sont dans Facturation.</p>
      </div>
    </div>
  );
}
