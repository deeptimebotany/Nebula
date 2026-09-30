"use client";

// Recharge Rétention (30/09/2026) : bouton « Ajouter 20 analyses » et sa
// fenêtre de confirmation. La case « accès immédiat et renonciation au droit
// de rétractation » est obligatoire (contenu numérique fourni tout de suite) ;
// ensuite, Stripe Checkout (paiement unique). Les analyses sont créditées par
// le webhook, utilisées après le quota du mois, et n'expirent pas.
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useBootstrap } from "@/components/bootstrap-provider";
import { RETENTION_PACK, formatEuroCents } from "@/lib/plans";
import { clsx } from "@/lib/clsx";

export const RETENTION_PACK_TEXT = `+${RETENTION_PACK.credits} analyses pour ${formatEuroCents(RETENTION_PACK.priceCents)}`;

export function RetentionPackButton({ returnTo = "retention", className, variant = "outline" }: { returnTo?: "retention" | "billing"; className?: string; variant?: "glow" | "outline" }) {
  const { data: me } = useBootstrap();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me?.retentionPacksOpen || !me.ai.quota.retentionPacks) return null;

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/retention-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiveWithdrawal: agreed, returnTo })
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) {
        window.location.assign(d.url);
        return;
      }
      setError(typeof d.error === "string" ? d.error : "Le paiement n'a pas pu s'ouvrir. Réessayez dans un instant.");
    } catch {
      setError("Le paiement n'a pas pu s'ouvrir. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant={variant} className={clsx("text-sm", className)} onClick={() => setOpen(true)}>
        Ajouter {RETENTION_PACK.credits} analyses ({formatEuroCents(RETENTION_PACK.priceCents)})
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Recharge Rétention">
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            <strong className="text-white">{RETENTION_PACK_TEXT}</strong>, en paiement unique. Elles s&apos;ajoutent à votre quota du mois,
            servent une fois ce quota utilisé et <strong className="text-white">n&apos;expirent pas</strong>.
          </p>
          <p className="text-xs text-slate-400">
            Utilisables en Pro et en Agence. Si votre abonnement s&apos;arrête, elles restent sur votre compte et reviennent avec lui.
            Facture envoyée par Stripe.
          </p>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-aurora-500" />
            <span>
              Je veux utiliser ces analyses tout de suite : je demande l&apos;accès immédiat et je renonce à mon droit de rétractation de
              14 jours.
            </span>
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="button" onClick={buy} disabled={!agreed || busy} className={clsx((!agreed || busy) && "opacity-60")}>
              {busy ? "Redirection…" : `Payer ${formatEuroCents(RETENTION_PACK.priceCents)}`}
            </Button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-400 transition hover:text-white">
              Annuler
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
