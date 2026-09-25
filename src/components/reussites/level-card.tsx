"use client";

// Carte « Rang de créateur » de la Vue d'ensemble (option B validée par
// Lucas ; rangs et missions de la semaine depuis Réussites v2) : rang,
// jauge, et la mission de la semaine la plus proche d'être réussie. Un clic
// ouvre la page Réussites.
import Link from "next/link";
import { useEffect, useState } from "react";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { SkeletonText } from "@/components/ui/skeleton";
import { LevelRing } from "./level-ring";
import type { ReussitesSummaryDTO } from "@/lib/reussites/types";

export function LevelCard({ initial }: { initial?: ReussitesSummaryDTO }) {
  // Lot 10 : résumé préparé par le serveur au premier affichage.
  const [data, setData] = useState<ReussitesSummaryDTO | null>(initial ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initial) {
      // Même vérification qu'après un chargement : l'évaluation a pu débloquer quelque chose.
      window.dispatchEvent(new Event("nebula:reussites-check"));
      return;
    }
    let alive = true;
    fetch("/api/reussites/summary", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ReussitesSummaryDTO) => {
        if (!alive) return;
        setData(d);
        // L'évaluation a pu débloquer quelque chose : on le fête.
        window.dispatchEvent(new Event("nebula:reussites-check"));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // Une seule fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = data?.focusChallenge ?? null;
  const pct = c ? Math.min(100, Math.round((c.value / c.target) * 100)) : 100;

  return (
    <MotionGlassCard className="h-full">
      <Link href="/reussites" className="flex h-full flex-col" aria-label="Rang de créateur — voir mes réussites">
        <h2 className="mb-3 font-display text-base font-medium text-white">Rang de créateur</h2>
        {failed ? (
          <p className="text-sm text-slate-500">Indisponible pour le moment.</p>
        ) : !data ? (
          <SkeletonText lines={3} />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <LevelRing level={data.level.level} pct={data.level.pct} size={62} stroke={6} />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold text-white">
                  {data.level.name} <span className="text-sm font-normal tabular-nums text-slate-400">· {data.level.pct} %</span>
                </p>
                <p className="text-xs tabular-nums text-slate-400">
                  {data.level.pending
                    ? `« ${data.level.pending.name} » en attente : ${data.level.pending.missing[0]}`
                    : data.level.nextXp !== null
                      ? `${(data.level.nextXp - data.level.xp).toLocaleString("fr-FR")} XP avant « ${data.level.nextName} »`
                      : "Dernier palier atteint"}
                </p>
              </div>
            </div>
            <div className="mt-auto pt-4">
              {c ? (
                <>
                  <p className="text-xs text-slate-300">
                    <span aria-hidden="true">⚡ </span>Mission : {c.title.charAt(0).toLowerCase() + c.title.slice(1)}
                    <span className="ml-1 tabular-nums text-slate-400">
                      ({c.value.toLocaleString("fr-FR")} / {c.target.toLocaleString("fr-FR")})
                    </span>
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className="h-full rounded-full bg-gradient-to-r from-nebula-500 to-aurora-400" style={{ width: `${pct}%` }} />
                  </div>
                </>
              ) : (
                <p className="text-xs text-emerald-300">{data.chestReady ? "3 missions sur 3 : votre coffre vous attend !" : "Toutes les missions de la semaine sont réussies, bravo !"}</p>
              )}
              <p className="mt-2 text-[11px] text-aurora-300">Voir mes réussites →</p>
            </div>
          </>
        )}
      </Link>
    </MotionGlassCard>
  );
}
