"use client";

// Section « Succès » de la page Réussites (ex-page /succes) : les easter
// eggs cachés dans Nebula, en points d'interrogation numérotés tant qu'ils
// ne sont pas trouvés, révélés (titre, indice, date) dès qu'ils le sont.
// Repliable, sous les accomplissements : un bonus ludique, pas l'objectif
// principal. L'état replié/déplié est mémorisé sur cet appareil.

import { useEffect, useState } from "react";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { clsx } from "@/lib/clsx";

interface EggStatus {
  number: number;
  found: boolean;
  key?: string;
  emoji?: string;
  title?: string;
  hint?: string;
  foundAt?: string;
  // Présent même non trouvé : ces eggs à récompense sont affichés à part.
  reward?: string;
}

const COLLAPSED_KEY = "nebula:reussites-succes-collapsed";

export function SuccesSection({ forceOpen = false }: { forceOpen?: boolean }) {
  const [eggs, setEggs] = useState<EggStatus[] | null>(null);
  const [foundCount, setFoundCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // stockage indisponible : déplié par défaut
    }
    fetch("/api/easter-eggs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return setEggs([]);
        setEggs(d.eggs ?? []);
        setFoundCount(d.foundCount ?? 0);
        setTotal(d.total ?? 0);
      })
      .catch(() => setEggs([]));
  }, []);

  // Lien « Voir mes succès » (?focus=succes) : section dépliée d'office.
  useEffect(() => {
    if (forceOpen) setCollapsed(false);
  }, [forceOpen]);

  function toggle() {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, v ? "0" : "1");
      } catch {
        // pas grave
      }
      return !v;
    });
  }

  const progress = total > 0 ? Math.round((foundCount / total) * 100) : 0;
  const normalEggs = eggs?.filter((e) => !e.reward) ?? [];
  const rewardEggs = eggs?.filter((e) => e.reward) ?? [];

  return (
    <section id="succes" className="scroll-mt-24 space-y-4 rounded-2xl" aria-labelledby="succes-title">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="succes-content"
        className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-left transition hover:border-white/15"
      >
        <span className="text-lg" aria-hidden="true">
          🥚
        </span>
        <span className="min-w-0 flex-1">
          <span id="succes-title" className="font-display text-base font-medium text-white">
            Succès
          </span>
          <span className="ml-2 text-sm text-slate-400">
            {eggs ? `${foundCount} / ${total} easter eggs trouvés` : "…"} · le bonus caché de Nebula
          </span>
          <span className="mt-1.5 block h-1 max-w-xs overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full bg-amber-300 transition-all duration-500" style={{ width: `${progress}%` }} />
          </span>
        </span>
        <span className="shrink-0 text-xs text-slate-400">{collapsed ? "Déplier ▾" : "Replier ▴"}</span>
      </button>

      {!collapsed && (
        <div id="succes-content" className="space-y-5">
          <p className="text-sm text-slate-400">
            Des easter eggs sont cachés un peu partout dans Nebula. Chacun se révèle ici dès que vous le trouvez : pas d&apos;indice, juste le plaisir de tomber dessus. En Mode
            focus (activé par défaut), les surprises ambiantes sont en pause : désactivez-le dans Paramètres → Apparence &amp; Succès pour les retrouver.
          </p>
          {!eggs ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }, (_, i) => (
                <SkeletonCard key={i} lines={2} />
              ))}
              <span className="sr-only">Chargement des succès</span>
            </div>
          ) : (
            <>
              <Reveal>
                <RevealGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {normalEggs.map((egg) => (
                    <RevealItem key={egg.number}>
                      {egg.found ? (
                        <div className="flex h-full flex-col rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{egg.emoji}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">#{egg.number}</span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-white">{egg.title}</p>
                          <p className="mt-1 flex-1 text-xs text-slate-400">{egg.hint}</p>
                          {egg.foundAt && <p className="mt-2 text-[11px] text-amber-300">Trouvé le {new Date(egg.foundAt).toLocaleDateString("fr-FR")}</p>}
                        </div>
                      ) : (
                        <div className={clsx("flex h-full flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 text-center")}>
                          <span className="text-2xl text-slate-500">?</span>
                          <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Easter egg #{egg.number}</span>
                        </div>
                      )}
                    </RevealItem>
                  ))}
                </RevealGroup>
              </Reveal>

              {/* Eggs à récompense (thème, cosmétique…) : à part, sans numéro —
                  le nom de la récompense est affiché même non trouvé. */}
              {rewardEggs.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-slate-300">Easter eggs à récompense</h3>
                  <Reveal>
                    <RevealGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {rewardEggs.map((egg) => (
                        <RevealItem key={egg.reward}>
                          {egg.found ? (
                            <div className="flex h-full flex-col rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-3.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{egg.emoji}</span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">🎁 Débloqué</span>
                              </div>
                              <p className="mt-2 text-sm font-medium text-white">{egg.title}</p>
                              <p className="mt-1 text-xs text-slate-400">{egg.hint}</p>
                              <p className="mt-2 text-[11px] font-medium text-emerald-300">Récompense : {egg.reward}</p>
                              {egg.foundAt && <p className="mt-1 text-[11px] text-emerald-300">Trouvé le {new Date(egg.foundAt).toLocaleDateString("fr-FR")}</p>}
                            </div>
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-emerald-400/[0.15] bg-emerald-400/[0.02] p-3.5 text-center">
                              <span className="text-2xl text-slate-500">?</span>
                              <span className="mt-2 text-[11px] text-emerald-300">{egg.reward}</span>
                            </div>
                          )}
                        </RevealItem>
                      ))}
                    </RevealGroup>
                  </Reveal>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
