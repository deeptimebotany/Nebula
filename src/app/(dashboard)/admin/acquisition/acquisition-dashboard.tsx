"use client";

// Tableaux simples, sans bibliothèque de graphiques (brief G0) : chaque bloc
// répond à une question du fondateur en un coup d'œil. Un bouton par email
// de cycle de vie envoie un aperçu au propriétaire (lot G3).

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { IconChart } from "@/components/dashboard/icons";
import { LIFECYCLE_LABELS, type LifecycleKey } from "@/lib/emails/lifecycle-keys";

interface Row {
  key: string;
  signups: number;
  paid: number;
}

interface Data {
  generatedAt: string;
  totals: { users: number; paid: number };
  signups: { d7: number; d30: number; d90: number };
  paidInWindow: { d7: number; d30: number; d90: number };
  bySource: Row[];
  byMedium: Row[];
  byCampaign: Row[];
  byVia: Row[];
  byLanding: Row[];
  referred: { signups: number; paid: number };
  trials: { active: number; ended: number; converted: number };
  offers: { shown: number; used: number; active: number };
  leads: { total: number; consented: number; signupsFromLeads: number; byTool: { tool: string; count: number }[] };
  waitlist: { network: string; count: number }[];
  badges: { clicks7: number; clicks30: number; clicks90: number; bySurface: { surface: string; count: number }[] };
  conversionBlocks: { clicks30: number; clicks90: number; bySurface: { surface: string; count: number }[] };
  landings: { views30: number; views90: number };
  tools: { ctaClicks30: number; ctaClicks90: number };
  exitIntent: { shown30: number; clicked30: number };
  upgrade: { shown: { reason: string; count: number }[]; clicked: { reason: string; count: number }[]; converted: { reason: string; count: number }[] };
  referralPrompts: { shown30: number; copied30: number };
  imports: { csv30: number; linktree30: number; waitlist30: number };
  lifecycle: { key: LifecycleKey; sent: number }[];
}

function pct(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)} %`;
}

function Table({ title, rows, note }: { title: string; rows: Row[]; note?: string }) {
  return (
    <GlassCard hover={false}>
      <h2 className="font-display text-base font-medium text-white">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Rien sur les 90 derniers jours.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1 font-medium">Valeur</th>
              <th className="py-1 text-right font-medium">Inscrits</th>
              <th className="py-1 text-right font-medium">Payants</th>
              <th className="py-1 text-right font-medium">Taux</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-white/[0.06]">
                <td className="py-1.5 text-slate-200">{r.key}</td>
                <td className="py-1.5 text-right tabular-nums text-white">{r.signups}</td>
                <td className="py-1.5 text-right tabular-nums text-white">{r.paid}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-400">{pct(r.paid, r.signups)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GlassCard>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function AcquisitionDashboard() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/acquisition", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Chargement impossible.");
        setData(await r.json());
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function preview(key: LifecycleKey) {
    setSending(key);
    try {
      const res = await fetch("/api/admin/lifecycle-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Envoi impossible.");
      toast.success(`Aperçu « ${LIFECYCLE_LABELS[key]} » envoyé.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconChart className="h-5 w-5" />}
        title="Acquisition"
        description="D'où viennent les inscrits et les payants — mesure interne, sans outil tiers. Fenêtre : 90 derniers jours sauf mention contraire."
      />

      {error && (
        <GlassCard className="border-red-500/30 bg-red-500/[0.06]">
          <p className="text-sm text-red-300">{error}</p>
        </GlassCard>
      )}

      {!data ? (
        <div className="space-y-3" aria-busy="true">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Inscrits 7 j / 30 j / 90 j" value={`${data.signups.d7} · ${data.signups.d30} · ${data.signups.d90}`} />
            <Stat label="Payants 7 j / 30 j / 90 j" value={`${data.paidInWindow.d7} · ${data.paidInWindow.d30} · ${data.paidInWindow.d90}`} hint="parmi les inscrits de la fenêtre" />
            <Stat label="Comptes au total" value={data.totals.users} hint={`${data.totals.paid} payants (${pct(data.totals.paid, data.totals.users)})`} />
            <Stat label="Parrainés (90 j)" value={data.referred.signups} hint={`${data.referred.paid} devenus payants`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="Par source (utm_source)" rows={data.bySource} />
            <Table title="Par medium (utm_medium)" rows={data.byMedium} />
            <Table title="Par campagne (utm_campaign)" rows={data.byCampaign} />
            <Table title="Par marque apporteuse (via)" rows={data.byVia} note="Badge « Propulsé par Nebula » et blocs de conversion" />
            <Table title="Par page d'atterrissage" rows={data.byLanding} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Essais en cours" value={data.trials.active} />
            <Stat label="Essais terminés" value={data.trials.ended} />
            <Stat label="Conversions d'essai" value={data.trials.converted} hint={pct(data.trials.converted, data.trials.ended + data.trials.converted)} />
            <Stat label="Offres 48 h affichées" value={data.offers.shown} hint={`${data.offers.active} encore valides`} />
            <Stat label="Offres utilisées" value={data.offers.used} hint={pct(data.offers.used, data.offers.shown)} />
            <Stat label="Leads outils (90 j)" value={data.leads.total} hint={`${data.leads.consented} avec consentement · ${data.leads.signupsFromLeads} inscrits ensuite`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard hover={false}>
              <h2 className="font-display text-base font-medium text-white">Surfaces publiques</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                <li className="flex justify-between"><span>Clics sur le badge (7 j / 30 j / 90 j)</span><span className="tabular-nums text-white">{data.badges.clicks7} · {data.badges.clicks30} · {data.badges.clicks90}</span></li>
                {data.badges.bySurface.map((s) => (
                  <li key={s.surface} className="flex justify-between pl-4 text-slate-400"><span>badge · {s.surface}</span><span className="tabular-nums">{s.count}</span></li>
                ))}
                <li className="flex justify-between"><span>Clics sur les blocs de conversion (30 j / 90 j)</span><span className="tabular-nums text-white">{data.conversionBlocks.clicks30} · {data.conversionBlocks.clicks90}</span></li>
                {data.conversionBlocks.bySurface.map((s) => (
                  <li key={s.surface} className="flex justify-between pl-4 text-slate-400"><span>bloc · {s.surface}</span><span className="tabular-nums">{s.count}</span></li>
                ))}
                <li className="flex justify-between"><span>Vues des pages /decouvrir (30 j / 90 j)</span><span className="tabular-nums text-white">{data.landings.views30} · {data.landings.views90}</span></li>
                <li className="flex justify-between"><span>« Programmer avec Nebula » (outils, 30 j / 90 j)</span><span className="tabular-nums text-white">{data.tools.ctaClicks30} · {data.tools.ctaClicks90}</span></li>
                <li className="flex justify-between"><span>Exit intent /tarifs (affiché / cliqué, 30 j)</span><span className="tabular-nums text-white">{data.exitIntent.shown30} · {data.exitIntent.clicked30}</span></li>
                <li className="flex justify-between"><span>Invitations au parrainage (affichées / lien copié, 30 j)</span><span className="tabular-nums text-white">{data.referralPrompts.shown30} · {data.referralPrompts.copied30}</span></li>
                <li className="flex justify-between"><span>Imports CSV / Linktree (30 j)</span><span className="tabular-nums text-white">{data.imports.csv30} · {data.imports.linktree30}</span></li>
                <li className="flex justify-between"><span>Inscriptions aux listes d&apos;attente (30 j)</span><span className="tabular-nums text-white">{data.imports.waitlist30}</span></li>
              </ul>
            </GlassCard>

            <GlassCard hover={false}>
              <h2 className="font-display text-base font-medium text-white">Modales de mise à niveau (90 j)</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-1 font-medium">Raison</th>
                    <th className="py-1 text-right font-medium">Affichées</th>
                    <th className="py-1 text-right font-medium">Cliquées</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upgrade.shown.length === 0 && (
                    <tr><td colSpan={3} className="py-2 text-slate-500">Aucune modale affichée.</td></tr>
                  )}
                  {data.upgrade.shown.map((r) => (
                    <tr key={r.reason} className="border-t border-white/[0.06]">
                      <td className="py-1.5 text-slate-200">{r.reason}</td>
                      <td className="py-1.5 text-right tabular-nums text-white">{r.count}</td>
                      <td className="py-1.5 text-right tabular-nums text-white">{data.upgrade.clicked.find((c) => c.reason === r.reason)?.count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Listes d&apos;attente par réseau</h3>
              {data.waitlist.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Aucune inscription.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  {data.waitlist.map((w) => (
                    <li key={w.network} className="flex justify-between"><span>{w.network}</span><span className="tabular-nums text-white">{w.count}</span></li>
                  ))}
                </ul>
              )}
              {data.leads.byTool.length > 0 && (
                <>
                  <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Leads par outil</h3>
                  <ul className="mt-2 space-y-1 text-sm text-slate-300">
                    {data.leads.byTool.map((t) => (
                      <li key={t.tool} className="flex justify-between"><span>{t.tool}</span><span className="tabular-nums text-white">{t.count}</span></li>
                    ))}
                  </ul>
                </>
              )}
            </GlassCard>
          </div>

          <GlassCard hover={false}>
            <h2 className="font-display text-base font-medium text-white">Emails de cycle de vie</h2>
            <p className="mt-0.5 text-xs text-slate-500">Envois cumulés par clé. « Aperçu » vous envoie l&apos;email avec des données factices.</p>
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {data.lifecycle.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block text-slate-200">{LIFECYCLE_LABELS[l.key]}</span>
                    <span className="block font-mono text-[11px] text-slate-500">{l.key}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-white">{l.sent}</span>
                    <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => preview(l.key)} disabled={sending === l.key}>
                      {sending === l.key ? "Envoi…" : "M'envoyer un aperçu"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <p className="text-[11px] text-slate-500">Calculé le {new Date(data.generatedAt).toLocaleString("fr-FR")}.</p>
        </>
      )}
    </div>
  );
}
