"use client";

// Statistiques d'une publication (24/09/2026) : totaux (vues, j'aime,
// commentaires, partages, engagement) puis détail par réseau, avec
// l'évolution depuis le relevé précédent. Utilisé par la fenêtre du
// calendrier (clic sur une publication passée) et par la fiche complète.
// Les chiffres viennent du relevé de la page Engagements : « Actualiser »
// relance ce relevé pour la marque.
import { useCallback, useEffect, useState } from "react";
import { NetworkTile } from "@/components/ui/network-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconRefresh } from "@/components/dashboard/icons";
import { NETWORK_META } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import type { PostMetricsDTO, TargetMetrics } from "@/lib/posts/post-metrics";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("fr-FR"));

function ago(iso: string | null): string {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

function Delta({ now, before }: { now: number | null; before: number | null | undefined }) {
  if (now === null || before === null || before === undefined || now === before) return null;
  const diff = now - before;
  return (
    <span className={clsx("ml-1 text-[10px] tabular-nums", diff > 0 ? "text-emerald-400" : "text-slate-500")}>
      {diff > 0 ? "+" : "−"}
      {Math.abs(diff).toLocaleString("fr-FR")}
    </span>
  );
}

function TargetRow({ t }: { t: TargetMetrics }) {
  const meta = NETWORK_META[t.network];
  const m = t.metrics;
  const cells: [string, number | null, number | null | undefined][] = m
    ? [
        ["vues", m.views, m.previous?.views],
        ["j'aime", m.likes, m.previous?.likes],
        ["comm.", m.comments, m.previous?.comments],
        ["partages", m.shares, m.previous?.shares]
      ]
    : [];
  return (
    <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <NetworkTile network={t.network} size={20} />
        <span className="text-sm font-medium text-white">{meta.label}</span>
        <span className="min-w-0 truncate text-xs text-slate-500">{t.account.handle ? `@${t.account.handle.replace(/^@/, "")}` : t.account.name}</span>
        {t.url && t.status === "PUBLISHED" && (
          <a href={t.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-aurora-300 hover:underline">
            Voir en ligne ↗
          </a>
        )}
      </div>
      {t.status !== "PUBLISHED" ? (
        <p className="mt-2 text-xs text-red-300">{t.status === "FAILED" ? `Pas en ligne : ${t.error ?? "échec de la publication"}` : "Pas encore en ligne."}</p>
      ) : m ? (
        <>
          <dl className="mt-2 grid grid-cols-4 gap-2">
            {cells.map(([label, value, before]) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="text-sm font-medium tabular-nums text-white">
                  {fmt(value)}
                  <Delta now={value} before={before} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-1.5 text-[10px] text-slate-500">
            Relevé {ago(m.capturedAt)}
            {m.previousAt && ` · évolution depuis le relevé ${ago(m.previousAt).replace("il y a", "d'il y a")}`}
            {m.views === null && " · ce réseau ne communique pas les vues"}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Pas encore de chiffres pour cette publication sur {meta.label}. Actualisez les statistiques ci-dessous.</p>
      )}
    </li>
  );
}

export function PostStats({ postId, compact = false }: { postId: string; compact?: boolean }) {
  const [data, setData] = useState<PostMetricsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/metrics`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Statistiques indisponibles.");
      setData(body as PostMetricsDTO);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    if (!data) return;
    setSyncing(true);
    setSyncNote(null);
    try {
      const res = await fetch("/api/engagements/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: data.brandId }) });
      const body = (await res.json().catch(() => ({}))) as { results?: { displayName: string; error?: string }[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Actualisation impossible.");
      const failed = (body.results ?? []).filter((r) => r.error);
      if (failed.length) setSyncNote(`${failed.map((f) => f.displayName).join(", ")} : actualisation impossible pour le moment.`);
      await load();
    } catch (err) {
      setSyncNote((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  if (error) return <p className="text-sm text-slate-400">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  const live = data.targets.some((t) => t.status === "PUBLISHED");
  const kpis: [string, string][] = [
    ["Vues", fmt(data.totals.views)],
    ["J'aime", fmt(data.totals.likes)],
    ["Commentaires", fmt(data.totals.comments)],
    ["Partages", fmt(data.totals.shares)],
    ["Engagement", data.totals.engagementRate === null ? "—" : `${data.totals.engagementRate.toLocaleString("fr-FR")} %`]
  ];

  return (
    <div className="space-y-3">
      {live && (
        <dl className={clsx("grid gap-2", compact ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-5")}>
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-white">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="space-y-2">
        {data.targets.map((t) => (
          <TargetRow key={t.targetId} t={t} />
        ))}
      </ul>
      {live && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            {data.missing > 0
              ? "Les réseaux ne renvoient les chiffres que de vos publications récentes."
              : "Engagement = (j'aime + commentaires + partages + enregistrements) ÷ vues."}
          </p>
          <Button variant="outline" onClick={refresh} disabled={syncing} className="py-1.5 text-xs">
            <IconRefresh className={clsx("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Actualisation…" : "Actualiser les statistiques"}
          </Button>
        </div>
      )}
      {syncNote && <p className="text-xs text-amber-300">{syncNote}</p>}
    </div>
  );
}
