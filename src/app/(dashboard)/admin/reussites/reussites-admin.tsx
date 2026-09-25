"use client";

// Réussites (admin) — lot C : objectif du défi collectif du mois
// (automatique : mois précédent + 10 %, au moins 10 ; modifiable ici) et
// vidéos à la une (en cours, en attente ; mettre à la une une vidéo d'un
// créateur qui l'accepte ; retirer une vidéo — droit de retrait).
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/dashboard/toast";
import { IconTrophy } from "@/components/dashboard/icons";
import { NETWORK_META, type Network } from "@/lib/types";

interface AdminView {
  collective: { month: string; label: string; target: number; source: string; total: number; participants: number; reachedAt: string | null; previousTotal: number; autoTarget: number };
  featured: {
    scheduled: { id: string; title: string; network: string; externalUrl: string; author: string; source: string; startsAt: string; endsAt: string; live: boolean }[];
    candidates: { id: string; title: string; network: string; externalUrl: string; author: string; createdAt: string; featured: boolean }[];
  };
}

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const net = (n: string) => NETWORK_META[n as Network]?.label ?? n;

export function ReussitesAdmin() {
  const toast = useToast();
  const [data, setData] = useState<AdminView | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reussites", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as AdminView;
      setData(json);
      setTarget(String(json.collective.target));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(key: string, body: Record<string, unknown>, ok: string) {
    setBusy(key);
    const res = await fetch("/api/admin/reussites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as AdminView & { error?: string };
    setBusy(null);
    if (!res.ok) {
      toast.error(json.error ?? "Action impossible.");
      return;
    }
    toast.success(ok);
    setData(json);
    setTarget(String(json.collective.target));
  }

  const c = data?.collective;
  return (
    <div className="space-y-6">
      <PageHeader icon={<IconTrophy className="h-5 w-5 text-amber-300" />} title="Réussites (admin)" description="Défi collectif du mois et vidéos à la une de la Communauté." />
      {!data || !c ? (
        <GlassCard>
          <p className="text-sm text-slate-400">Chargement…</p>
        </GlassCard>
      ) : (
        <>
          <GlassCard className="space-y-3">
            <h2 className="font-display text-base font-semibold text-white">Défi collectif · {c.label}</h2>
            <p className="text-sm text-slate-300">
              {c.total.toLocaleString("fr-FR")} / {c.target.toLocaleString("fr-FR")} vidéos mises en ligne par {c.participants} créateur{c.participants > 1 ? "s" : ""}
              {c.reachedAt ? ` · objectif atteint le ${day(c.reachedAt)}` : ""}.
            </p>
            <p className="text-xs text-slate-400">
              Objectif {c.source === "admin" ? "fixé à la main" : "automatique"}. Mois précédent : {c.previousTotal.toLocaleString("fr-FR")} vidéos → objectif automatique {c.autoTarget.toLocaleString("fr-FR")}.
            </p>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(target);
                if (!Number.isInteger(n) || n < 1) return toast.error("Objectif invalide.");
                void post("target", { action: "set-target", target: n }, "Objectif enregistré.");
              }}
            >
              <label className="text-xs text-slate-400">
                Objectif du mois
                <Input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-40" />
              </label>
              <Button type="submit" disabled={busy === "target"}>
                {busy === "target" ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </form>
          </GlassCard>

          <GlassCard className="space-y-3">
            <h2 className="font-display text-base font-semibold text-white">Vidéos à la une</h2>
            {data.featured.scheduled.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune vidéo à la une ni en attente. Les places libres montrent la « sélection du moment ».</p>
            ) : (
              <ul className="space-y-2">
                {data.featured.scheduled.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] px-3 py-2">
                    <span className="min-w-0 text-sm">
                      <a href={f.externalUrl} target="_blank" rel="noreferrer" className="block truncate text-white hover:underline">
                        {f.title}
                      </a>
                      <span className="text-[11px] text-slate-400">
                        {f.author} · {net(f.network)} · {f.live ? "à la une" : "en attente"} du {day(f.startsAt)} au {day(f.endsAt)} · {f.source === "admin" ? "choix de Nebula" : "gagnée"}
                      </span>
                    </span>
                    <Button variant="outline" disabled={busy === f.id} onClick={() => post(f.id, { action: "remove", id: f.id }, "Vidéo retirée.")}>
                      Retirer
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="pt-2 text-sm font-medium text-white">Vidéos partagées par des créateurs d&apos;accord</h3>
            {data.featured.candidates.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun créateur n&apos;a encore donné son accord (page Réussites → Vidéo à la une).</p>
            ) : (
              <ul className="space-y-2">
                {data.featured.candidates.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] px-3 py-2">
                    <span className="min-w-0 text-sm">
                      <a href={v.externalUrl} target="_blank" rel="noreferrer" className="block truncate text-white hover:underline">
                        {v.title}
                      </a>
                      <span className="text-[11px] text-slate-400">
                        {v.author} · {net(v.network)} · partagée le {day(v.createdAt)}
                      </span>
                    </span>
                    {v.featured ? (
                      <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-xs font-semibold text-amber-200">Déjà à la une</span>
                    ) : (
                      <Button disabled={busy === v.id} onClick={() => post(v.id, { action: "feature", sharedVideoId: v.id }, "Vidéo mise à la une (ou en attente d'une place).")}>
                        Mettre à la une
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
