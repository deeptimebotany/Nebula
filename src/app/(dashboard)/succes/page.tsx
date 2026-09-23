"use client";

// Onglet "Succès" — volontairement absent des barres de navigation
// principales (voir sidebar.tsx : un seul petit lien, glissé parmi
// Comptes/Facturation/Paramètres) : la liste des 20 easter eggs du site,
// affichés en points d'interrogation numérotés tant qu'ils ne sont pas
// trouvés, révélés (titre, indice, date) dès qu'ils le sont. Le compte de
// progression est aussi repris dans la Communauté (voir community/page.tsx).

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { IconTrophy } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";
import { CosmeticDecorOverlay } from "@/components/cosmetics/decor-overlay";

interface EggStatus {
  number: number;
  found: boolean;
  key?: string;
  emoji?: string;
  title?: string;
  hint?: string;
  foundAt?: string;
  // Nom de la récompense (thème, cosmétique...) débloquée par cet egg —
  // présent même quand `found` est false (voir /api/easter-eggs). Sa seule
  // présence sert de marqueur : ces eggs sont affichés à part, sans numéro,
  // à la fin de la page.
  reward?: string;
}

export default function SuccesPage() {
  const [eggs, setEggs] = useState<EggStatus[] | null>(null);
  const [foundCount, setFoundCount] = useState(0);
  const [total, setTotal] = useState(20);

  useEffect(() => {
    fetch("/api/easter-eggs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEggs(d.eggs ?? []);
        setFoundCount(d.foundCount ?? 0);
        setTotal(d.total ?? 20);
      })
      .catch(() => setEggs([]));
  }, []);

  const progress = total > 0 ? Math.round((foundCount / total) * 100) : 0;
  // Les eggs à récompense sortent de la grille numérotée pour aller dans
  // leur propre section, en fin de page (voir plus bas).
  const normalEggs = eggs?.filter((e) => !e.reward) ?? [];
  const rewardEggs = eggs?.filter((e) => e.reward) ?? [];

  return (
    // "isolate" : nécessaire pour que le -z-10 de CosmeticDecorOverlay ne
    // remonte pas jusqu'au contexte d'empilement de <main class="noise-grid">
    // (voir decor-overlay.tsx et globals.css) — sans lui, "Voûte céleste"
    // était totalement invisible, pas seulement discret.
    <div className="relative isolate space-y-6">
      <CosmeticDecorOverlay cosmeticKey="papier-peint-succes" />
      <PageHeader
        icon={<IconTrophy className="h-6 w-6 text-amber-300" />}
        title="Succès"
        description={`${total} easter eggs sont cachés un peu partout dans Nebula. Chacun se révèle ici dès que vous le trouvez — pas d'indice, juste le plaisir de tomber dessus. En Mode focus (activé par défaut), les surprises ambiantes sont en pause : désactivez-le dans Paramètres → Apparence & Succès pour les retrouver.`}
      />

      <GlassCard>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-white">
            {foundCount} / {total} trouvés
          </span>
          <span className="text-slate-400">{progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-nebula-500 to-aurora-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </GlassCard>

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
            <RevealGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {normalEggs.map((egg) => (
                <RevealItem key={egg.number}>
                  {egg.found ? (
                    <div className="flex h-full flex-col rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{egg.emoji}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                          #{egg.number}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-white">{egg.title}</p>
                      <p className="mt-1 flex-1 text-xs text-slate-400">{egg.hint}</p>
                      {egg.foundAt && (
                        <p className="mt-2 text-[11px] text-amber-300">
                          Trouvé le {new Date(egg.foundAt).toLocaleDateString("fr-FR")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div
                      className={clsx(
                        "flex h-full flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 text-center"
                      )}
                    >
                      <span className="text-2xl text-slate-500">?</span>
                      <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Easter egg #{egg.number}
                      </span>
                    </div>
                  )}
                </RevealItem>
              ))}
            </RevealGroup>
          </Reveal>

          {/* Eggs à récompense (thème, cosmétique...) : volontairement à
              part, sans numéro — le nom de la récompense est affiché même
              non trouvé (voir /api/easter-eggs), pour donner un objectif
              clair sans dévoiler comment l'obtenir. */}
          {rewardEggs.length > 0 && (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-medium text-slate-300">Autres easter eggs</h2>
              <Reveal>
                <RevealGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {rewardEggs.map((egg) => (
                    <RevealItem key={egg.reward}>
                      {egg.found ? (
                        <div className="flex h-full flex-col rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{egg.emoji}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                              🎁 Débloqué
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-white">{egg.title}</p>
                          <p className="mt-1 text-xs text-slate-400">{egg.hint}</p>
                          <p className="mt-2 text-[11px] font-medium text-emerald-300">Récompense : {egg.reward}</p>
                          {egg.foundAt && (
                            <p className="mt-1 text-[11px] text-emerald-300">
                              Trouvé le {new Date(egg.foundAt).toLocaleDateString("fr-FR")}
                            </p>
                          )}
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
  );
}
