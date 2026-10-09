"use client";

// Réglages du bilan du mois par e-mail (03/10/2026) : l'activer, choisir ses
// marques, s'envoyer un aperçu. Dans Paramètres → Notifications et sur la page
// « Bilan du mois » d'Analytics (variante compacte).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { monthLabel } from "@/lib/monthly-summary/period";

interface Settings {
  enabled: boolean;
  brandIds: string[];
  brands: { id: string; name: string; accounts: number }[];
  last: { month: string; sentAt: string | null; status: string } | null;
}

export function useSummarySettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => {
    fetch("/api/monthly-summary/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Settings | null) => d && setSettings(d))
      .catch(() => undefined);
  }, []);
  const save = useCallback(
    async (patch: { enabled?: boolean; brandIds?: string[] }) => {
      setSaving(true);
      // Affiché tout de suite, annulé si le serveur refuse.
      let before: Settings | null = null;
      setSettings((prev) => {
        before = prev;
        return prev ? { ...prev, ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), ...(patch.brandIds ? { brandIds: patch.brandIds } : {}) } : prev;
      });
      const res = await fetch("/api/monthly-summary/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      setSaving(false);
      if (!res?.ok) {
        if (before) setSettings(before);
        toast.error((d as { error?: string }).error ?? "Réglage non enregistré. Réessayez.");
        return false;
      }
      setSettings(d as Settings);
      return true;
    },
    [toast]
  );
  return { settings, saving, save };
}

/** `dialog` : dans la fenêtre Paramètres (10/10/2026), titre comme les autres réglages. */
export function MonthlySummarySettings({ compact = false, dialog = false }: { compact?: boolean; dialog?: boolean }) {
  const { settings, saving, save } = useSummarySettings();
  const [previewing, setPreviewing] = useState(false);
  const toast = useToast();

  async function preview() {
    setPreviewing(true);
    const res = await fetch("/api/monthly-summary/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setPreviewing(false);
    if (res?.ok) toast.success(`Aperçu envoyé à votre adresse : bilan de ${monthLabel((d as { month: string }).month)}.`);
    else toast.error((d as { error?: string }).error ?? "L'aperçu n'a pas pu partir. Réessayez.");
  }

  function toggleBrand(id: string) {
    if (!settings) return;
    const next = settings.brandIds.includes(id) ? settings.brandIds.filter((b) => b !== id) : [...settings.brandIds, id];
    if (next.length === 0) {
      toast.error("Gardez au moins une marque, ou désactivez le bilan.");
      return;
    }
    void save({ brandIds: next });
  }

  const enabled = settings?.enabled ?? false;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className={dialog ? "text-[15px] font-semibold text-white" : compact ? "font-display text-base font-medium text-white" : "text-sm font-medium text-white"}>Bilan du mois par e-mail</h3>
          <p className={dialog ? "mt-1 text-[13px] leading-relaxed text-slate-400" : "mt-1 text-sm text-slate-400"}>
            Le 3 de chaque mois, les chiffres du mois écoulé : abonnés, vues, interactions, publications, vos meilleures publications et ce qui a marché. Un
            e-mail par marque.{" "}
            {!compact && (
              <Link href="/analytics/bilan" className="text-aurora-300 underline underline-offset-2 hover:text-aurora-200">
                Voir le dernier bilan
              </Link>
            )}
          </p>
          {settings?.last && settings.last.status === "SENT" && settings.last.sentAt && (
            <p className="mt-1 text-xs text-slate-500">
              Dernier envoi : bilan de {monthLabel(settings.last.month)}, le {new Date(settings.last.sentAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.
            </p>
          )}
        </div>
        <Toggle checked={enabled} onChange={(v) => void save({ enabled: v })} disabled={!settings || saving} aria-label="Recevoir le bilan du mois par e-mail" className="mt-1 shrink-0" />
      </div>
      {enabled && settings && (
        <div className="mt-3 space-y-3">
          {settings.brands.length > 1 && (
            <fieldset>
              <legend className="text-xs text-slate-400">Marques incluses</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {settings.brands.map((b) => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-slate-200">
                    <input type="checkbox" checked={settings.brandIds.includes(b.id)} onChange={() => toggleBrand(b.id)} disabled={saving} className="h-3.5 w-3.5 accent-aurora-500" />
                    {b.name}
                    {b.accounts === 0 && <span className="text-slate-500">(aucun compte)</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Button type="button" variant="outline" onClick={preview} disabled={previewing}>
            {previewing ? "Envoi…" : "M'envoyer un aperçu"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Carte d'Analytics : invite à recevoir le bilan par e-mail (disparaît une fois activé). */
export function MonthlySummaryPromo() {
  const { settings, saving, save } = useSummarySettings();
  if (!settings || settings.enabled) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-aurora-400/25 bg-aurora-400/[0.06] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">Votre bilan du mois, par e-mail</p>
        <p className="text-xs text-slate-400">
          Le 3 de chaque mois : abonnés, vues, meilleures publications et ce qui a marché.{" "}
          <Link href="/analytics/bilan" className="text-aurora-300 underline underline-offset-2 hover:text-aurora-200">
            Voir le bilan
          </Link>
        </p>
      </div>
      <Button type="button" onClick={() => void save({ enabled: true })} disabled={saving}>
        {saving ? "Activation…" : "Le recevoir chaque mois"}
      </Button>
    </div>
  );
}
