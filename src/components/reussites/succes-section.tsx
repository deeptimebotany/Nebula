"use client";

// Easter eggs de la page Réussites. Lot U3 (brief « Essai 14 jours ») : la
// grille de toutes les cartes sort de la page Réussites — un bloc résumé
// « n / total Easter eggs trouvés » (EggSummary, onglet Récompenses) mène à
// la collection complète (EggCollection), sur sa propre page
// /reussites/collection, chargée à la demande (le bouton retour y marche).
// Les eggs se révèlent (titre, indice, date) dès qu'ils sont trouvés ; les
// autres restent des points d'interrogation numérotés.

import Link from "next/link";
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

interface EggsState {
  eggs: EggStatus[] | null;
  foundCount: number;
  total: number;
}

function useEggs(): EggsState {
  const [state, setState] = useState<EggsState>({ eggs: null, foundCount: 0, total: 0 });
  useEffect(() => {
    fetch("/api/easter-eggs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setState(d ? { eggs: d.eggs ?? [], foundCount: d.foundCount ?? 0, total: d.total ?? 0 } : { eggs: [], foundCount: 0, total: 0 }))
      .catch(() => setState({ eggs: [], foundCount: 0, total: 0 }));
  }, []);
  return state;
}

/** Bloc résumé de l'onglet Récompenses. */
export function EggSummary() {
  const { eggs, foundCount, total } = useEggs();
  const progress = total > 0 ? Math.round((foundCount / total) * 100) : 0;
  return (
    <section id="succes" aria-labelledby="succes-title" className="scroll-mt-24 flex flex-wrap items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] px-4 py-3">
      <span className="text-lg" aria-hidden="true">
        🥚
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="succes-title" className="font-display text-base font-medium text-white">
          {eggs ? `${foundCount}/${total} Easter eggs trouvés` : "Easter eggs"}
        </h2>
        <p className="text-xs text-slate-400">Des surprises cachées un peu partout dans Nebula, révélées dès que vous tombez dessus.</p>
        <span className="mt-1.5 block h-1 max-w-xs overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-label="Easter eggs trouvés" aria-valuemin={0} aria-valuemax={total} aria-valuenow={foundCount}>
          <span className="block h-full rounded-full bg-amber-300 transition-all duration-500" style={{ width: `${progress}%` }} />
        </span>
      </div>
      <Link href="/reussites/collection" className="shrink-0 rounded-xl border border-amber-300/35 px-3.5 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-300/[0.08]">
        Voir la collection
      </Link>
    </section>
  );
}

/** Collection complète (page /reussites/collection). */
export function EggCollection() {
  const { eggs, foundCount, total } = useEggs();
  const normalEggs = eggs?.filter((e) => !e.reward) ?? [];
  const rewardEggs = eggs?.filter((e) => e.reward) ?? [];

  return (
    <section aria-labelledby="collection-title" className="space-y-5">
      <div>
        <h2 id="collection-title" className="font-display text-lg font-semibold text-white">
          {eggs ? `${foundCount} / ${total} trouvés` : "Chargement…"}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Des easter eggs sont cachés un peu partout dans Nebula. Chacun se révèle ici dès que vous le trouvez : pas d&apos;indice, juste le plaisir de tomber dessus. En Mode
          focus (activé par défaut), les surprises ambiantes sont en pause : désactivez-le dans Paramètres → Apparence &amp; Succès pour les retrouver.
        </p>
      </div>
      {!eggs ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
          <span className="sr-only">Chargement des easter eggs</span>
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
    </section>
  );
}
