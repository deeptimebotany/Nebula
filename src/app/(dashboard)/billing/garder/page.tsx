"use client";

// Écran « Choisir ce que je garde » (lot E4, brief « Essai 14 jours ») :
// une ligne par marque (comptes connectés, publications programmées,
// dernière activité) et UN choix — la marque qui reste active en Gratuit.
// Si elle a plus de comptes connectés que le Gratuit n'en permet, même
// choix pour les comptes. Rien n'est jamais supprimé : le reste passe « en
// veille » et revient d'un coup au passage en Pro.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/ui/network-badge";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { clsx } from "@/lib/clsx";
import type { Network } from "@/lib/types";
import { connectionSlotsFor } from "@/lib/connection-slots";

interface ChoiceConnection {
  id: string;
  network: Network;
  displayName: string;
  dormant: boolean;
  uses: number;
}

interface ChoiceBrand {
  id: string;
  name: string;
  dormant: boolean;
  uses: number;
  scheduledPosts: number;
  lastActivityAt: string | null;
  connections: ChoiceConnection[];
}

interface ChoiceResponse {
  onTrial: boolean;
  paid: boolean;
  trialEndsAt: string | null;
  chosenBrandId: string | null;
  activeBrandId: string | null;
  keptConnectionIds: string[];
  changeableAt: string | null;
  freeLimits: { maxBrands: number; maxConnections: number };
  planLabel?: string;
  maxBrands?: number;
  brands: ChoiceBrand[];
}

const fr = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

/** Comptes comptés comme Nebula (connectionSlotsFor : un compte connecté = un compte). */
function slots(connections: ChoiceConnection[]): number {
  return connectionSlotsFor(connections.map((c) => c.network));
}

function lastActivity(v: string | null): string {
  if (!v) return "aucune publication";
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
  return days <= 0 ? "aujourd'hui" : days === 1 ? "hier" : `il y a ${days} jours`;
}

export default function KeepChoicePage() {
  const toast = useToast();
  const upgrade = useUpgradeModal();
  const { refresh: refreshMe } = useBootstrap();
  const { refresh: refreshBrands } = useBrand();
  const [data, setData] = useState<ChoiceResponse | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/billing/active-brand", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ChoiceResponse | null) => {
        if (!d) return;
        setData(d);
        setBrandId(d.activeBrandId);
        setConnectionIds(d.keptConnectionIds);
      })
      .catch(() => undefined);
  }, []);

  const selected = useMemo(() => data?.brands.find((b) => b.id === brandId) ?? null, [data, brandId]);
  const needsConnectionChoice = Boolean(selected && data && slots(selected.connections) > data.freeLimits.maxConnections);
  const keptConnections = selected ? selected.connections.filter((c) => connectionIds.includes(c.id)) : [];
  const overConnections = Boolean(data && slots(keptConnections) > data.freeLimits.maxConnections);

  function pickBrand(id: string) {
    setBrandId(id);
    setSaved(false);
    setError(null);
    // Nouvelle marque : comptes les plus utilisés par défaut, dans la limite.
    const b = data?.brands.find((x) => x.id === id);
    if (!b || !data) return;
    const sorted = [...b.connections].sort((a, c) => c.uses - a.uses);
    const keep: ChoiceConnection[] = [];
    for (const c of sorted) if (slots([...keep, c]) <= data.freeLimits.maxConnections) keep.push(c);
    setConnectionIds(keep.map((c) => c.id));
  }

  function toggleConnection(id: string) {
    setSaved(false);
    setConnectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!brandId || overConnections) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/active-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, connectionIds: needsConnectionChoice ? connectionIds : null })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Enregistrement impossible pour le moment.");
        return;
      }
      setSaved(true);
      setData((prev) => (prev ? { ...prev, chosenBrandId: brandId, activeBrandId: brandId } : prev));
      await Promise.all([refreshBrands(), refreshMe()]);
      toast.success("Choix enregistré.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <PageSkeleton />;

  const afterTrial = !data.onTrial && !data.paid;
  const locked = afterTrial && data.changeableAt && new Date(data.changeableAt).getTime() > Date.now();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Choisir ce que je garde"
        description={
          data.paid && data.maxBrands !== undefined && data.brands.length > data.maxBrands
            ? `Votre palier ${data.planLabel ?? "actuel"} permet ${data.maxBrands} marque${data.maxBrands > 1 ? "s" : ""} : la marque choisie ici publie, les autres restent visibles en lecture seule. Rien n'est supprimé ; un palier avec plus de marques les réactive.`
            : data.paid
            ? "Vous êtes sur un palier payant : toutes vos marques sont actives. Ce choix ne servira que si vous repassez en Gratuit."
            : data.onTrial && data.trialEndsAt
              ? `Votre essai se termine le ${fr(data.trialEndsAt)}. En Gratuit, une seule marque reste active ; les autres sont mises en veille, rien n'est supprimé.`
              : "En Gratuit, une seule marque reste active ; les autres sont en veille : tout reste visible, rien ne se publie ni ne se synchronise."
        }
      />

      {locked && data.changeableAt && (
        <p role="note" className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-2.5 text-sm text-amber-100">
          Prochain changement possible le {fr(data.changeableAt)} (une fois tous les 30 jours). En Pro, toutes vos marques sont actives.
        </p>
      )}

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Marque active en Gratuit</legend>
        <div className="space-y-2">
          {data.brands.map((b) => {
            const checked = b.id === brandId;
            return (
              <label
                key={b.id}
                className={clsx(
                  "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition",
                  checked ? "border-aurora-400/50 bg-aurora-400/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20",
                  locked && "cursor-not-allowed opacity-70"
                )}
              >
                <input type="radio" name="active-brand" className="mt-1 accent-aurora-500" checked={checked} disabled={Boolean(locked)} onChange={() => pickBrand(b.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{b.name}</span>
                    {b.dormant && (
                      <span className="rounded-full border border-slate-400/30 px-1.5 text-[9px] font-semibold uppercase leading-4 tracking-wide text-slate-300">En veille</span>
                    )}
                    {b.id === data.chosenBrandId && <span className="text-[11px] text-emerald-300">choix enregistré</span>}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {b.connections.length} compte{b.connections.length > 1 ? "s" : ""} connecté{b.connections.length > 1 ? "s" : ""} · {b.scheduledPosts} publication
                    {b.scheduledPosts > 1 ? "s" : ""} programmée{b.scheduledPosts > 1 ? "s" : ""} · dernière activité {lastActivity(b.lastActivityAt)}
                  </span>
                  {b.connections.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {b.connections.map((c) => (
                        <NetworkBadge key={c.id} network={c.network} size="sm" />
                      ))}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {selected && needsConnectionChoice && (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Comptes gardés sur « {selected.name} »</legend>
          <p className="mb-2 text-sm text-slate-400">
            En Gratuit, {data.freeLimits.maxConnections} comptes par marque. Les autres devront être déconnectés pour
            continuer à utiliser Nebula : ceux que vous ne cochez pas ici seront proposés à la déconnexion.
          </p>
          <div className="space-y-1.5">
            {selected.connections.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
                <input type="checkbox" className="accent-aurora-500" checked={connectionIds.includes(c.id)} disabled={Boolean(locked)} onChange={() => toggleConnection(c.id)} />
                <NetworkBadge network={c.network} size="sm" />
                <span className="min-w-0 flex-1 truncate text-slate-200">{c.displayName}</span>
                <span className="text-xs text-slate-500">{c.uses} publication{c.uses > 1 ? "s" : ""} (14 j)</span>
              </label>
            ))}
          </div>
          <p className={clsx("mt-2 text-xs", overConnections ? "text-amber-200" : "text-slate-500")} aria-live="polite">
            {slots(keptConnections)} / {data.freeLimits.maxConnections} comptes choisis{overConnections ? " : retirez-en pour rester dans la limite." : "."}
          </p>
        </fieldset>
      )}

      {error && (
        <p className="text-sm text-amber-200" aria-live="polite">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving || !brandId || overConnections || Boolean(locked)}>
          {saving ? "Enregistrement…" : afterTrial ? "En faire ma marque active" : "Enregistrer mon choix"}
        </Button>
        {!data.paid && (
          <button type="button" onClick={() => upgrade.open("dormant_brand")} className="text-sm font-medium text-aurora-300 underline-offset-2 hover:underline">
            Tout garder avec Pro
          </button>
        )}
        {saved && <span className="text-sm text-emerald-300">Enregistré.</span>}
      </div>

      <GlassCard className="border-white/[0.06] bg-white/[0.015]">
        <p className="text-sm text-slate-400">
          Sans choix de votre part, la marque la plus utilisée sur les 14 derniers jours reste active. Les publications des marques en veille prévues dans les 7 jours après la fin de l&apos;essai partent normalement ; les
          suivantes repassent en brouillon, avec leur date d&apos;origine gardée, et repartent d&apos;un clic au passage en Pro.{" "}
          <Link href="/billing" className="text-aurora-300 underline underline-offset-2">
            Retour à Abonnement
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
