"use client";

// Fin d'essai propre (lot E4, brief « Essai 14 jours ») — ce que voit
// l'utilisateur dans l'application :
//   - TrialChoiceCard : sur la Vue d'ensemble, à partir de 3 jours avant la
//     fin de l'essai, « Choisissez la marque qui reste active en Gratuit » ;
//   - DormantBrandBanner : sur chaque page d'une marque en veille, le
//     bandeau et ses trois actions (Pro, en faire ma marque active,
//     supprimer). Jamais de toast pour annoncer une limite : Mode focus
//     respecté.
import Link from "next/link";
import { useState } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useBrand } from "@/components/brand-context";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { useConfirm } from "@/components/dashboard/confirm";
import { useToast } from "@/components/dashboard/toast";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import { PLAN_LIMITS } from "@/lib/plans";

const CHOICE_CARD_DAYS = 3;

function frDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/** Carte de la Vue d'ensemble, 3 jours avant la fin de l'essai (comptes à plusieurs marques). */
export function TrialChoiceCard() {
  const { data: me } = useBootstrap();
  if (!me?.onTrial || !me.trialEndsAt || me.trialDaysLeft > CHOICE_CARD_DAYS) return null;
  if (me.brandsOwned <= PLAN_LIMITS.FREE.tiers[0].maxBrands) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] px-5 py-4">
      <p className="text-sm text-slate-200">
        Votre essai se termine le {frDate(me.trialEndsAt)}. Choisissez la marque qui reste active en Gratuit.
      </p>
      <Link href="/billing/garder" className="rounded-xl border border-emerald-400/40 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/10">
        Choisir ce que je garde
      </Link>
    </div>
  );
}

/** Bandeau d'une marque en veille (sous l'en-tête, sur toutes ses pages). */
export function DormantBrandBanner() {
  const { data: me, refresh: refreshMe } = useBootstrap();
  const { activeBrand, brands, setActiveBrandId, refresh: refreshBrands } = useBrand();
  const upgrade = useUpgradeModal();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<"swap" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!activeBrand?.dormant || !me) return null;
  const brand = activeBrand;
  const owner = brand.role === "OWNER";

  async function makeActive() {
    const ok = await confirmDialog({
      title: `Faire de « ${brand.name} » votre marque active ?`,
      message: `Les deux marques échangent leurs états : celle-ci publie de nouveau, l'autre passe en veille (rien n'est supprimé). Changement possible une fois tous les 30 jours.`,
      confirmLabel: "En faire ma marque active"
    });
    if (!ok) return;
    setBusy("swap");
    setMessage(null);
    try {
      const res = await fetch("/api/billing/active-brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(d.error ?? "Changement impossible pour le moment.");
        return;
      }
      await Promise.all([refreshBrands(), refreshMe()]);
      toast.success(`« ${brand.name} » est votre marque active.`);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Supprimer « ${brand.name} » ?`,
      message:
        "La marque et tout son contenu seront supprimés définitivement : publications et programmations, comptes réseaux connectés, Page bio, rapports et médias envoyés. Vos autres marques ne sont pas touchées.",
      confirmLabel: "Supprimer définitivement",
      danger: true,
      requireText: brand.name
    });
    if (!ok) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(d.error ?? "Suppression impossible.");
        return;
      }
      const next = brands.find((b) => b.id !== brand.id && !b.dormant) ?? brands.find((b) => b.id !== brand.id);
      if (next) setActiveBrandId(next.id);
      await Promise.all([refreshBrands(), refreshMe()]);
      toast.success(`Marque « ${brand.name} » supprimée.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div role="region" aria-label="Marque en veille" className="border-b border-slate-400/20 bg-white/[0.03] px-4 py-2.5 text-xs text-slate-200 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1">
          <span className="mr-1.5 rounded-full border border-slate-400/30 px-1.5 text-[9px] font-semibold uppercase leading-4 tracking-wide text-slate-300">En veille</span>
          Marque en veille en Gratuit. Tout est conservé.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => upgrade.open("dormant_brand")} className="inline-flex items-center gap-1 font-medium text-aurora-200 underline-offset-2 hover:underline">
            <UpgradeGem className="h-3.5 w-3.5" /> Passer en Pro pour la réactiver
          </button>
          {owner && (
            <button type="button" onClick={makeActive} disabled={busy !== null} className="font-medium text-slate-200 underline-offset-2 hover:underline disabled:opacity-60">
              {busy === "swap" ? "Changement…" : "En faire ma marque active"}
            </button>
          )}
          {owner && (
            <button type="button" onClick={remove} disabled={busy !== null} className="text-slate-400 underline-offset-2 hover:text-red-300 hover:underline disabled:opacity-60">
              {busy === "delete" ? "Suppression…" : "Supprimer cette marque"}
            </button>
          )}
        </div>
        {message && (
          <p className="w-full text-amber-200" aria-live="polite">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
