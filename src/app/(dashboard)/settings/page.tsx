"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";
import { THEMES } from "@/lib/themes";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/components/dashboard/toast";
import { IconGift, IconSettings } from "@/components/dashboard/icons";

interface ReferralInfo {
  code: string;
  referredByCode: string | null;
  aiTrialActive: boolean;
  aiTrialUntil: string | null;
}

function swatchPreview(vars: Record<string, string>) {
  const nebula500 = `rgb(${vars["--c-nebula-500"]})`;
  const aurora400 = `rgb(${vars["--c-aurora-400"]})`;
  const accentCyan = `rgb(${vars["--c-accent-cyan"]})`;
  return `linear-gradient(135deg, ${nebula500}, ${aurora400} 55%, ${accentCyan})`;
}

export default function SettingsPage() {
  const { themeKey, setThemeKey } = useTheme();
  const toast = useToast();
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/referral")
      .then((r) => (r.ok ? r.json() : null))
      .then(setReferral)
      .catch(() => undefined);
  }, []);

  const referralUrl = referral ? `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${referral.code}` : "";

  async function copyReferral() {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    toast.success("Lien de parrainage copié.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
          <IconSettings className="h-5 w-5 text-slate-400" /> Paramètres
        </h1>
        <p className="mt-1 text-sm text-slate-400">Personnalisez votre espace Nebula.</p>
      </div>

      <GlassCard>
        <h2 className="font-display text-base font-medium text-white">Thème de couleurs</h2>
        <p className="mt-1 text-sm text-slate-400">
          Change l&apos;accent de couleur dans toute l&apos;application. Votre choix est mémorisé sur cet
          appareil et sur votre compte.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => setThemeKey(t.key)}
              className={clsx(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition",
                themeKey === t.key ? "border-aurora-400 bg-white/[0.04]" : "border-white/10 hover:border-white/25"
              )}
            >
              <span
                className="h-10 w-full rounded-lg shadow-inner"
                style={{ background: swatchPreview(t.vars) }}
              />
              <span className="text-xs text-slate-300">{t.label}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="flex items-center gap-2 font-display text-base font-medium text-white">
          <IconGift className="h-4 w-4 text-aurora-300" /> Parrainage
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Partagez votre code : toute personne qui l&apos;utilise à son inscription reçoit l&apos;assistant IA
          gratuitement pendant 14 jours, même sur le palier Gratuit.
        </p>

        {referral ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 font-display text-lg tracking-widest text-white">
                {referral.code}
              </span>
              <Button variant="outline" onClick={copyReferral}>
                {copied ? "Copié !" : "Copier le lien d'invitation"}
              </Button>
            </div>
            <p className="break-all text-xs text-slate-500">{referralUrl}</p>
            {referral.aiTrialActive && referral.aiTrialUntil && (
              <p className="text-xs text-emerald-300">
                IA offerte via parrainage jusqu&apos;au{" "}
                {new Date(referral.aiTrialUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Chargement...</p>
        )}
      </GlassCard>
    </div>
  );
}
