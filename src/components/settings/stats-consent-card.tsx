"use client";

// Paramètres → Compte : accord facultatif aux statistiques anonymes
// (29/09/2026). Décoché par défaut, retirable à tout moment, date du choix
// affichée. Voir src/lib/anon-stats/ et la politique de confidentialité.
import { useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/dashboard/toast";
import { useBootstrap } from "@/components/bootstrap-provider";
import { ANON_MIN_ACCOUNTS } from "@/lib/anon-stats/aggregate";

export function StatsConsentCard() {
  const { data, loaded, patch } = useBootstrap();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const consent = data?.statsConsent ?? false;

  async function onChange(next: boolean) {
    setSaving(true);
    const res = await fetch("/api/settings/stats-consent", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent: next }) }).catch(() => null);
    setSaving(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      toast.error("Échec de l'enregistrement.");
      return;
    }
    patch({ statsConsent: next, statsConsentAt: typeof d.statsConsentAt === "string" ? d.statsConsentAt : new Date().toISOString() });
    toast.success(next ? "Merci ! Votre usage contribuera aux statistiques anonymes." : "C'est noté : votre usage ne sera plus pris en compte.");
  }

  const since = data?.statsConsentAt ? new Date(data.statsConsentAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-medium text-white">Statistiques anonymes (facultatif)</h2>
          <p className="mt-1 text-sm text-slate-400">
            Acceptez-vous que votre usage de Nebula contribue à des statistiques de groupe anonymes (par exemple : les
            créneaux et les formats les plus programmés par réseau) ? Uniquement des chiffres calculés sur au moins{" "}
            {ANON_MIN_ACCOUNTS} comptes, à partir de ce que vous faites dans Nebula — jamais les données de vos réseaux
            (vues, abonnés, commentaires), jamais vos textes ni rien qui permette de vous identifier. Ces statistiques
            pourront être partagées avec des partenaires. Refuser ne change rien à votre utilisation de Nebula.{" "}
            <Link href="/legal#statistiques" className="text-aurora-300 underline underline-offset-2 hover:text-aurora-200">
              En savoir plus
            </Link>
          </p>
          {since && <p className="mt-2 text-xs text-slate-500">{consent ? `Accord donné le ${since}.` : `Choix enregistré le ${since} : non.`}</p>}
        </div>
        <Toggle checked={consent} onChange={onChange} disabled={!loaded || saving} aria-label="Contribuer aux statistiques anonymes" className="mt-1 shrink-0" />
      </div>
    </GlassCard>
  );
}
