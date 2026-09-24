"use client";

// Onglet ENGAGEMENTS — le suivi des CHIFFRES d'engagement par publication
// (vues, likes, commentaires, partages, enregistrements), tous comptes de
// la marque confondus. Le TEXTE des commentaires est dans l'onglet
// Commentaires (/comments) ; les chiffres du COMPTE (abonnés, portée) dans
// Analytics. Les données viennent de PostMetric (voir schema.prisma),
// remplies par « Actualiser » (/api/engagements/sync) via l'API officielle
// de chaque réseau — chaque réseau n'expose pas tout (YouTube : pas de
// partages ; Facebook : pas de vues…), d'où les « — » assumés.
//
// Trois blocs, du plus synthétique au plus détaillé :
//   1. cinq tuiles (totaux + évolution depuis l'actualisation précédente) ;
//   2. la répartition par réseau pour UNE métrique à la fois (barres d'une
//      seule couleur : l'identité du réseau est portée par son logo, pas par
//      une teinte — les couleurs de marque des réseaux sont trop proches pour
//      être distinguées de façon fiable) ;
//   3. le tableau des publications, triable par colonne.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NetworkBadge, NetworkLogo, NetworkTile } from "@/components/ui/network-badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { IconRefresh, IconThumbUp } from "@/components/dashboard/icons";
import { NETWORK_META, type Network } from "@/lib/types";
import { METRIC_KEYS, METRIC_LABELS, NETWORK_METRIC_SUPPORT, formatCompact, type MetricKey } from "@/lib/engagement-metrics";
import { clsx } from "@/lib/clsx";

interface PostRow {
  id: string;
  connectionId: string;
  network: Network;
  postExternalId: string;
  title: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  prevViews: number | null;
  prevLikes: number | null;
  prevComments: number | null;
  prevShares: number | null;
  prevSaves: number | null;
  capturedAt: string;
}

interface ConnectionInfo {
  id: string;
  network: Network;
  displayName: string;
  handle: string | null;
  status: string;
  lastSyncedAt: string | null;
  supportsMetrics: boolean;
}

type SortKey = MetricKey | "publishedAt";

const PREV_KEY: Record<MetricKey, keyof PostRow> = {
  views: "prevViews",
  likes: "prevLikes",
  comments: "prevComments",
  shares: "prevShares",
  saves: "prevSaves"
};

function sumMetric(rows: PostRow[], key: MetricKey): { value: number; delta: number | null; known: boolean } {
  let value = 0;
  let delta = 0;
  let hasPrev = false;
  let known = false;
  for (const r of rows) {
    const cur = r[key];
    if (cur === null) continue;
    known = true;
    value += cur;
    const prev = r[PREV_KEY[key]] as number | null;
    if (prev !== null) {
      hasPrev = true;
      delta += cur - prev;
    }
  }
  return { value, delta: hasPrev ? delta : null, known };
}

export default function EngagementsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EngagementsPageInner />
    </Suspense>
  );
}

function EngagementsPageInner() {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const params = useSearchParams();
  const preselected = params.get("connectionId");

  const [connections, setConnections] = useState<ConnectionInfo[] | null>(null);
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | "all">(preselected ?? "all");
  const [metric, setMetric] = useState<MetricKey>("likes");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "publishedAt", dir: "desc" });
  const [syncing, setSyncing] = useState(false);
  const [syncNotes, setSyncNotes] = useState<string[]>([]);

  // Dépend de l'identifiant (stable) et non de l'objet marque : un objet
  // recréé au rendu relancerait le chargement en boucle.
  const brandId = activeBrand?.id;
  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await fetch(`/api/engagements?brandId=${brandId}`, { cache: "no-store" });
      const d = await res.json();
      setConnections(d.connections ?? []);
      setPosts(d.posts ?? []);
      setLastSyncedAt(d.lastSyncedAt ?? null);
    } catch {
      setConnections([]);
      setPosts([]);
    }
  }, [brandId]);

  useEffect(() => {
    setConnections(null);
    setPosts(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (connections && accountFilter !== "all" && !connections.some((c) => c.id === accountFilter)) setAccountFilter("all");
  }, [connections, accountFilter]);

  const connectionById = useMemo(() => new Map((connections ?? []).map((c) => [c.id, c])), [connections]);

  const filtered = useMemo(() => (posts ?? []).filter((p) => accountFilter === "all" || p.connectionId === accountFilter), [posts, accountFilter]);

  const totals = useMemo(() => Object.fromEntries(METRIC_KEYS.map((k) => [k, sumMetric(filtered, k)])) as Record<MetricKey, ReturnType<typeof sumMetric>>, [filtered]);

  // Répartition par réseau pour la métrique choisie — seulement les réseaux
  // présents dans le filtre courant.
  const byNetwork = useMemo(() => {
    const networks = [...new Set(filtered.map((p) => p.network))];
    const rows = networks.map((network) => {
      const subset = filtered.filter((p) => p.network === network);
      const { value, known } = sumMetric(subset, metric);
      return { network, posts: subset.length, value, known, supported: NETWORK_METRIC_SUPPORT[network]?.[metric] ?? false };
    });
    const max = Math.max(1, ...rows.map((r) => r.value));
    const total = rows.reduce((acc, r) => acc + r.value, 0);
    return { rows: rows.sort((a, b) => b.value - a.value), max, total };
  }, [filtered, metric]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sort.key === "publishedAt") {
        const av = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const bv = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return (av - bv) * dir;
      }
      // Les « — » (non fournis) vont toujours en bas, quel que soit le sens.
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
    return rows;
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  async function onSync() {
    if (!activeBrand) return;
    setSyncing(true);
    setSyncNotes([]);
    try {
      const body = accountFilter === "all" ? { brandId: activeBrand.id } : { connectionId: accountFilter };
      const res = await fetch("/api/engagements/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Échec de l'actualisation.");
        return;
      }
      const failures: string[] = (data.results ?? [])
        .filter((r: { error?: string }) => r.error)
        .map((r: { displayName: string; network: string; error: string }) => `${r.displayName} (${NETWORK_META[r.network as Network]?.label ?? r.network}) : ${r.error}`);
      setSyncNotes(failures);
      toast.success(`${data.count ?? 0} publication(s) actualisée(s).`);
      await load();
    } catch {
      toast.error("Connexion perdue pendant l'actualisation.");
    } finally {
      setSyncing(false);
    }
  }

  const loading = connections === null || posts === null;
  const hasPrev = filtered.some((p) => p.prevLikes !== null || p.prevViews !== null || p.prevComments !== null || p.prevShares !== null || p.prevSaves !== null);

  if (!loading && connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader icon={<IconThumbUp className="h-5 w-5" />} title="Engagements" description="Likes, partages, enregistrements et vues, publication par publication." />
        <EmptyState
          icon={<IconThumbUp className="h-5 w-5" />}
          title="Aucun compte connecté"
          description="Connectez un compte Instagram, Facebook, TikTok ou YouTube pour suivre ici l'engagement de vos publications."
          action={<ButtonLink href="/accounts">Connecter un compte</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconThumbUp className="h-5 w-5" />}
        title="Engagements"
        description={
          <>
            Ce que vos publications déclenchent : likes, partages (y compris en story), enregistrements, vues et nombre de commentaires — tous comptes
            confondus. Le texte des commentaires est dans <span className="text-slate-300">Commentaires</span>.
            {lastSyncedAt && <span className="block text-xs text-slate-500">Dernière actualisation : {new Date(lastSyncedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</span>}
          </>
        }
        actions={
          <Button onClick={onSync} disabled={syncing || loading}>
            <IconRefresh className={clsx("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Actualisation…" : "Actualiser"}
          </Button>
        }
      />

      {!loading && connections.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par compte">
          <FilterChip active={accountFilter === "all"} onClick={() => setAccountFilter("all")}>
            Tous les comptes
          </FilterChip>
          {connections.map((c) => (
            <FilterChip key={c.id} active={accountFilter === c.id} onClick={() => setAccountFilter(c.id)}>
              {/* Filtre de compte : logo officiel + nom, sans pastille dans la pastille. */}
              <NetworkTile network={c.network} size={18} />
              <span className="max-w-[140px] truncate" title={NETWORK_META[c.network].label}>{c.displayName}</span>
            </FilterChip>
          ))}
        </div>
      )}

      {syncNotes.length > 0 && (
        <GlassCard className="border-red-500/30 bg-red-500/[0.06]">
          <p className="text-sm font-medium text-red-300">Certains comptes n&apos;ont pas pu être actualisés :</p>
          <ul className="mt-1 space-y-0.5 text-sm text-red-300/90">
            {syncNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </GlassCard>
      )}

      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {METRIC_KEYS.map((k) => (
              <SkeletonCard key={k} lines={1} />
            ))}
          </div>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
          <span className="sr-only">Chargement des engagements</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconThumbUp className="h-5 w-5" />}
          title="Rien de synchronisé pour l'instant"
          description="Cliquez sur « Actualiser » : Nebula interroge l'API de chaque réseau et rapatrie les chiffres des 15 dernières publications de chaque compte."
          action={
            <Button onClick={onSync} disabled={syncing}>
              <IconRefresh className={clsx("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Actualisation…" : "Actualiser maintenant"}
            </Button>
          }
        />
      ) : (
        <>
          {/* 1. Tuiles — totaux et évolution */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {METRIC_KEYS.map((k) => {
              const t = totals[k];
              const active = metric === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMetric(k)}
                  aria-pressed={active}
                  title={METRIC_LABELS[k].hint}
                  className={clsx(
                    "glass-panel rounded-2xl p-4 text-left transition",
                    active ? "border-aurora-400/50 shadow-glow" : "hover:border-white/20"
                  )}
                >
                  <p className="text-xs text-slate-400">{METRIC_LABELS[k].label}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{t.known ? formatCompact(t.value) : "—"}</p>
                  <p className={clsx("mt-1 text-[11px]", t.delta === null ? "text-slate-500" : t.delta > 0 ? "text-emerald-300" : t.delta < 0 ? "text-red-300" : "text-slate-500")}>
                    {t.delta === null ? (t.known ? "première mesure" : "non fourni") : `${t.delta > 0 ? "+" : ""}${formatCompact(t.delta)} depuis la dernière fois`}
                  </p>
                </button>
              );
            })}
          </div>

          {/* 2. Répartition par réseau pour la métrique sélectionnée */}
          <GlassCard hover={false}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-base font-medium text-white">
                {METRIC_LABELS[metric].label} par réseau
              </h2>
              <p className="text-xs text-slate-500">
                {byNetwork.total > 0 ? `${formatCompact(byNetwork.total)} au total` : "—"} · cliquez une tuile pour changer de métrique
              </p>
            </div>
            <ul className="space-y-2.5">
              {byNetwork.rows.map((r) => {
                const share = byNetwork.total > 0 ? Math.round((r.value / byNetwork.total) * 100) : 0;
                return (
                  <li key={r.network} className="group flex items-center gap-3" title={r.supported ? `${NETWORK_META[r.network].label} : ${r.value.toLocaleString("fr-FR")} (${share} %) sur ${r.posts} publication${r.posts > 1 ? "s" : ""}` : `${NETWORK_META[r.network].label} ne fournit pas cette métrique`}>
                    <span className="flex w-28 shrink-0 items-center text-sm text-slate-300">
                      <NetworkBadge network={r.network} size="sm" />
                    </span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      {r.supported && r.known && (
                        <span className="absolute inset-y-0 left-0 rounded-full bg-aurora-400 transition-[width] duration-300 group-hover:bg-aurora-300" style={{ width: `${Math.max(2, (r.value / byNetwork.max) * 100)}%` }} />
                      )}
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-white">
                      {r.supported && r.known ? formatCompact(r.value) : <span className="text-slate-500">—</span>}
                      {r.supported && r.known && byNetwork.total > 0 && <span className="ml-1 text-[11px] text-slate-500">{share} %</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {byNetwork.rows.some((r) => !r.supported) && (
              <p className="mt-3 text-[11px] text-slate-500">
                « — » : {byNetwork.rows.filter((r) => !r.supported).map((r) => NETWORK_META[r.network].label).join(", ")} ne fournit pas cette métrique via son API.
              </p>
            )}
          </GlassCard>

          {/* 3. Tableau des publications */}
          <GlassCard hover={false} className="overflow-hidden p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
              <h2 className="font-display text-base font-medium text-white">Publications</h2>
              <p className="text-xs text-slate-500">
                {filtered.length} publication{filtered.length > 1 ? "s" : ""} · cliquez un en-tête pour trier
                {hasPrev && " · petit chiffre = évolution depuis la dernière actualisation"}
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-y border-white/[0.06] text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-5 py-2 font-medium" aria-sort={sort.key === "publishedAt" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                      <SortButton active={sort.key === "publishedAt"} dir={sort.dir} onClick={() => toggleSort("publishedAt")}>
                        Publication
                      </SortButton>
                    </th>
                    {METRIC_KEYS.map((k) => (
                      <th key={k} scope="col" className="px-3 py-2 text-right font-medium" title={METRIC_LABELS[k].hint} aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                        <SortButton active={sort.key === k} dir={sort.dir} onClick={() => toggleSort(k)} align="right">
                          {METRIC_LABELS[k].short}
                        </SortButton>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => {
                    const conn = connectionById.get(p.connectionId);
                    return (
                      <tr key={p.id} className="border-b border-white/[0.04] transition hover:bg-white/[0.02]">
                        <td className="max-w-[360px] px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            {p.thumbnailUrl ? (
                              <RemoteImage src={p.thumbnailUrl} className="h-10 w-16 shrink-0 rounded-md object-cover" sizes="64px" />
                            ) : (
                              <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-slate-400">
                                <NetworkLogo network={p.network} className="h-5 w-5" />
                              </span>
                            )}
                            <div className="min-w-0">
                              {p.permalink ? (
                                <a href={p.permalink} target="_blank" rel="noreferrer" className="block truncate text-sm text-white hover:underline">
                                  {p.title || "(sans titre)"}
                                </a>
                              ) : (
                                <p className="truncate text-sm text-white">{p.title || "(sans titre)"}</p>
                              )}
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                                <NetworkBadge network={p.network} size="sm" />
                                <span className="truncate">{conn?.displayName ?? NETWORK_META[p.network].label}</span>
                                {p.publishedAt && <span>· {new Date(p.publishedAt).toLocaleDateString("fr-FR")}</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        {METRIC_KEYS.map((k) => {
                          const cur = p[k];
                          const prev = p[PREV_KEY[k]] as number | null;
                          const delta = cur !== null && prev !== null ? cur - prev : null;
                          const supported = NETWORK_METRIC_SUPPORT[p.network]?.[k] ?? false;
                          return (
                            <td key={k} className="px-3 py-2.5 text-right tabular-nums" title={!supported ? `Non fourni par ${NETWORK_META[p.network].label}` : cur !== null ? cur.toLocaleString("fr-FR") : undefined}>
                              {cur === null ? (
                                <span className="text-slate-600">—</span>
                              ) : (
                                <>
                                  <span className="text-slate-200">{formatCompact(cur)}</span>
                                  {delta !== null && delta !== 0 && (
                                    <span className={clsx("ml-1 text-[10px]", delta > 0 ? "text-emerald-300" : "text-red-300")}>
                                      {delta > 0 ? "+" : ""}
                                      {formatCompact(delta)}
                                    </span>
                                  )}
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}

function SortButton({ active, dir, onClick, children, align }: { active: boolean; dir: "asc" | "desc"; onClick: () => void; children: React.ReactNode; align?: "right" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx("inline-flex items-center gap-1 transition hover:text-white", active && "text-white", align === "right" && "justify-end")}
    >
      {children}
      <span aria-hidden="true" className={clsx("text-[9px]", active ? "text-aurora-300" : "text-slate-600")}>
        {active ? (dir === "asc" ? "▲" : "▼") : "▽"}
      </span>
    </button>
  );
}
