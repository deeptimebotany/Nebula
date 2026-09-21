"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useBrand } from "@/components/brand-context";
import { useQuickComposer } from "@/components/dashboard/quick-composer-context";
import { Button } from "@/components/ui/button";
import { NetworkDot } from "@/components/ui/network-badge";
import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { motion } from "framer-motion";
import { QuotaBar } from "@/components/dashboard/quota-bar";
import { PostEditModal } from "@/components/dashboard/post-edit-modal";
import { ApprovalLinkModal } from "@/components/dashboard/approval-link-modal";
import { WeekScrubber } from "@/components/dashboard/week-scrubber";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { useAiStatus } from "@/components/use-ai-status";
import { useToast } from "@/components/dashboard/toast";
import { IconChevron, IconPlus, IconSparkle } from "@/components/dashboard/icons";

interface ApiPost {
  id: string;
  title: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  media: { mediaAsset: { url: string; type: "VIDEO" | "IMAGE"; thumbnailUrl?: string } }[];
  targets: { network: Network; connectionId: string }[];
}

interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
}

interface DayEntry {
  id: string;
  title: string;
  networks: Network[];
  status: string;
  thumbnailUrl?: string;
  time: string;
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { activeBrand, brands } = useBrand();
  const { open: openQuickComposer } = useQuickComposer();
  const toast = useToast();
  const aiStatus = useAiStatus(activeBrand?.id);
  const [view, setView] = useState<"month" | "hours">("month");
  // "Proposer une idée IA" sur une case vide — voir handler plus bas.
  const [ideaLoadingKey, setIdeaLoadingKey] = useState<string | null>(null);
  const [ideaByKey, setIdeaByKey] = useState<Record<string, string>>({});
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [postsByBrand, setPostsByBrand] = useState<Record<string, ApiPost[]>>({});
  const [connectionsByBrand, setConnectionsByBrand] = useState<Record<string, ConnectionRow[]>>({});
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [hiddenConnectionIds, setHiddenConnectionIds] = useState<Set<string>>(new Set());
  // Filtre rapide par réseau, affiché juste au-dessus de la grille — distinct
  // du panneau "Filtres" (marques/comptes précis) pour un accès en un clic.
  const [hiddenNetworks, setHiddenNetworks] = useState<Set<Network>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  // Glisser-déposer : reprogrammation rapide d'un post sur une autre date en
  // le faisant glisser dans la grille (garde l'heure d'origine, change juste
  // le jour) — voir rescheduleToDay ci-dessous.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [agendaDay, setAgendaDay] = useState(() => new Date());

  // Par défaut, seule la marque active est affichée — on peut en ajouter
  // d'autres depuis le panneau Filtres.
  useEffect(() => {
    if (activeBrand && selectedBrandIds.length === 0) setSelectedBrandIds([activeBrand.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand]);

  useEffect(() => {
    selectedBrandIds.forEach((brandId) => {
      if (postsByBrand[brandId]) return;
      fetch(`/api/posts?brandId=${brandId}`)
        .then((r) => r.json())
        .then((d) => setPostsByBrand((prev) => ({ ...prev, [brandId]: d.posts ?? [] })));
      fetch(`/api/connections?brandId=${brandId}`)
        .then((r) => r.json())
        .then((d) => setConnectionsByBrand((prev) => ({ ...prev, [brandId]: d.connections ?? [] })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrandIds]);

  function refreshPosts() {
    selectedBrandIds.forEach((brandId) => {
      fetch(`/api/posts?brandId=${brandId}`)
        .then((r) => r.json())
        .then((d) => setPostsByBrand((prev) => ({ ...prev, [brandId]: d.posts ?? [] })));
    });
  }

  async function rescheduleToDay(entryId: string, time: string, newDay: Date) {
    const [h, m] = time.split(":").map(Number);
    const newDate = new Date(newDay);
    newDate.setHours(h, m, 0, 0);
    await fetch(`/api/posts/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: newDate.toISOString() })
    }).catch(() => undefined);
    refreshPosts();
  }

  const allConnections = useMemo(
    () => selectedBrandIds.flatMap((id) => (connectionsByBrand[id] ?? []).map((c) => ({ ...c, brandId: id }))),
    [selectedBrandIds, connectionsByBrand]
  );

  const availableNetworks = useMemo(() => {
    const set = new Set<Network>();
    for (const c of allConnections) set.add(c.network);
    return Array.from(set);
  }, [allConnections]);

  function toggleNetworkFilter(n: Network) {
    setHiddenNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  const entriesByDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const push = (key: string, entry: DayEntry) => map.set(key, [...(map.get(key) ?? []), entry]);

    for (const brandId of selectedBrandIds) {
      for (const p of postsByBrand[brandId] ?? []) {
        if (!p.scheduledAt) continue;
        const visibleTargets = p.targets.filter(
          (t) => !hiddenConnectionIds.has(t.connectionId) && !hiddenNetworks.has(t.network)
        );
        if (p.targets.length > 0 && visibleTargets.length === 0) continue; // tous les comptes de ce post sont masqués
        const d = new Date(p.scheduledAt);
        push(dateKey(d), {
          id: p.id,
          title: p.title || p.caption || "(sans titre)",
          networks: visibleTargets.map((t) => t.network),
          status: p.status,
          thumbnailUrl: p.media[0]?.mediaAsset.thumbnailUrl || p.media[0]?.mediaAsset.url,
          time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        });
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [postsByBrand, selectedBrandIds, hiddenConnectionIds, hiddenNetworks]);

  const grid = useMemo(() => {
    const first = new Date(cursor);
    const startOffset = (first.getDay() + 6) % 7; // lundi = 0
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const today = new Date();
  const todayKey = dateKey(today);
  const agendaEntries = entriesByDay.get(dateKey(agendaDay)) ?? [];

  // Scrubber temporel : nombre de publications par jour, tous jours
  // chargés confondus (indépendant du mois affiché à l'écran).
  const entryCountByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, list] of entriesByDay) map.set(key, list.length);
    return map;
  }, [entriesByDay]);

  function onSelectWeek(monday: Date) {
    setCursor(new Date(monday.getFullYear(), monday.getMonth(), 1));
    if (view === "hours") setAgendaDay(monday);
  }

  function toggleBrand(id: string) {
    setSelectedBrandIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  function toggleConnection(id: string) {
    setHiddenConnectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Détection des jours creux & idées IA : disponible uniquement sur une
  // case sans aucune publication programmée (voir bouton discret plus bas).
  async function onSuggestIdea(key: string) {
    if (!activeBrand) return;
    setIdeaLoadingKey(key);
    const res = await fetch("/api/ai/content-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, date: key })
    });
    const data = await res.json();
    setIdeaLoadingKey(null);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors de la génération de l'idée.");
      return;
    }
    setIdeaByKey((prev) => ({ ...prev, [key]: data.idea }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Calendrier de publication</h1>
          <p className="mt-1 text-sm text-slate-400">
            Planifiez et visualisez vos publications multi-réseaux en un coup d&apos;œil.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {aiStatus?.plan === "AGENCY" && (
            <Button variant="outline" onClick={() => setApprovalModalOpen(true)}>
              Lien d&apos;approbation client
            </Button>
          )}
          <Button onClick={() => openQuickComposer()}>Planifier un post</Button>
        </div>
      </div>

      <QuotaBar brandId={activeBrand?.id} />

      <WeekScrubber
        entryCountByDay={entryCountByDay}
        activeDate={view === "hours" ? agendaDay : cursor}
        onSelectWeek={onSelectWeek}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
          {[
            { id: "month", label: "Mois" },
            { id: "hours", label: "Agenda (heures)" }
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id as "month" | "hours")}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                view === v.id ? "bg-nebula-600/60 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-white/25"
          >
            Filtres · {selectedBrandIds.length} marque(s)
          </button>
          {filtersOpen && (
            <div className="glass-panel absolute left-0 top-[calc(100%+6px)] z-20 w-72 rounded-xl p-3">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">Marques affichées</p>
              <div className="space-y-1">
                {brands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={selectedBrandIds.includes(b.id)}
                      onChange={() => toggleBrand(b.id)}
                      className="accent-aurora-500"
                    />
                    {b.name}
                  </label>
                ))}
              </div>
              {allConnections.length > 0 && (
                <>
                  <p className="mb-1.5 mt-3 text-[11px] uppercase tracking-wide text-slate-500">Comptes affichés</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {allConnections.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={!hiddenConnectionIds.has(c.id)}
                          onChange={() => toggleConnection(c.id)}
                          className="accent-aurora-500"
                        />
                        <NetworkDot network={c.network} />
                        <span className="truncate">{c.displayName}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {availableNetworks.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Réseaux :</span>
          {availableNetworks.map((n) => {
            const active = !hiddenNetworks.has(n);
            return (
              <button
                key={n}
                onClick={() => toggleNetworkFilter(n)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  active
                    ? "border-aurora-400/40 bg-aurora-400/[0.08] text-white"
                    : "border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20"
                )}
              >
                <NetworkDot network={n} /> {NETWORK_META[n].label}
              </button>
            );
          })}
        </div>
      )}

      {view === "month" ? (
        <MotionGlassCard>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg text-white">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>←</Button>
              <Button variant="ghost" onClick={() => setCursor(new Date(new Date().setDate(1)))}>Aujourd&apos;hui</Button>
              <Button variant="outline" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>→</Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-white/[0.06]">
            {WEEKDAYS.map((d) => (
              <div key={d} className="bg-white/[0.02] px-2 py-2 text-center text-xs font-medium text-slate-500">
                {d}
              </div>
            ))}
            {grid.map((day) => {
              const key = dateKey(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              const entries = entriesByDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  onDragOver={(ev) => {
                    ev.preventDefault();
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    setDragOverKey(null);
                    setDraggingId(null);
                    const raw = ev.dataTransfer.getData("text/plain");
                    if (!raw) return;
                    try {
                      const { id, time } = JSON.parse(raw) as { id: string; time: string };
                      rescheduleToDay(id, time, day);
                    } catch {
                      // charge utile invalide — on ignore simplement
                    }
                  }}
                  className={clsx(
                    "group/cell relative min-h-[112px] bg-void-900/60 p-2 align-top transition",
                    !inMonth && "opacity-30",
                    dragOverKey === key && "ring-2 ring-inset ring-aurora-400/60 bg-aurora-400/[0.06]"
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={clsx(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isToday ? "today-glow bg-nebula-500 text-white" : "text-slate-400"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <div className="flex items-center gap-1">
                      {activeBrand && aiStatus?.enabled && entries.length === 0 && inMonth && (
                        <button
                          onClick={() => onSuggestIdea(key)}
                          disabled={ideaLoadingKey === key}
                          title="Proposer une idée IA pour ce jour"
                          className="flex h-5 w-5 items-center justify-center rounded-full text-slate-600 opacity-0 transition hover:bg-aurora-400/15 hover:text-aurora-300 group-hover/cell:opacity-100"
                        >
                          <IconSparkle className={clsx("h-3 w-3", ideaLoadingKey === key && "animate-pulse")} />
                        </button>
                      )}
                      {activeBrand && (
                        <button
                          type="button"
                          onClick={() => openQuickComposer({ date: key })}
                          title="Créer un post à cette date"
                          className="flex h-5 w-5 items-center justify-center rounded-full text-slate-600 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/cell:opacity-100"
                        >
                          <IconPlus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {entries.length === 0 && ideaByKey[key] && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                      <button
                        type="button"
                        onClick={() => openQuickComposer({ date: key })}
                        className="mb-1 block w-full rounded-md border border-aurora-400/20 bg-aurora-400/[0.06] p-1.5 text-left text-[10px] leading-tight text-aurora-100 transition hover:border-aurora-400/40"
                        title="Cliquez pour rédiger ce post"
                      >
                        <IconSparkle className="mb-0.5 inline h-2.5 w-2.5 text-aurora-300" /> {ideaByKey[key]}
                      </button>
                    </motion.div>
                  )}
                  <div className="space-y-1">
                    {entries.slice(0, 3).map((e) => (
                      // Le layoutId sur le conteneur (et non le <button> natif
                      // lui-même) anime la position lors d'un déplacement par
                      // glisser-déposer, sans entrer en conflit avec les
                      // événements HTML5 natifs draggable/onDragStart/onDragEnd
                      // du bouton (framer-motion redéfinit ces props pour son
                      // propre système de geste quand elles sont posées
                      // directement sur un composant motion).
                      <motion.div key={e.id} layout layoutId={`entry-${e.id}`} transition={{ type: "spring", stiffness: 350, damping: 28 }}>
                        <button
                          draggable
                          onDragStart={(ev) => {
                            ev.dataTransfer.setData("text/plain", JSON.stringify({ id: e.id, time: e.time }));
                            ev.dataTransfer.effectAllowed = "move";
                            setDraggingId(e.id);
                          }}
                          onDragEnd={() => setDraggingId(null)}
                          onClick={() => setEditingPostId(e.id)}
                          title={`${e.title} — glissez vers un autre jour pour reprogrammer`}
                          style={e.networks[0] ? { borderLeft: `3px solid ${NETWORK_META[e.networks[0]].color}` } : undefined}
                          className={clsx(
                            "flex w-full cursor-grab items-center gap-1.5 overflow-hidden rounded-md bg-nebula-700/40 py-1 pl-1 pr-1.5 text-left text-[11px] text-slate-100 transition hover:z-10 hover:scale-[1.04] hover:bg-nebula-700/70 hover:shadow-glow active:cursor-grabbing",
                            draggingId === e.id && "opacity-40"
                          )}
                        >
                          {e.thumbnailUrl ? (
                            <img src={e.thumbnailUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                          ) : (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/5 text-[9px] text-slate-500">
                              {e.networks[0] ? "" : "—"}
                            </span>
                          )}
                          <span className="flex shrink-0 gap-0.5">
                            {e.networks.slice(0, 3).map((n, i) => (
                              <NetworkDot key={i} network={n} />
                            ))}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{e.title}</span>
                          <span className="shrink-0 text-slate-400">{e.time}</span>
                        </button>
                      </motion.div>
                    ))}
                    {entries.length > 3 && <p className="text-[11px] text-slate-500">+{entries.length - 3} autre(s)</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </MotionGlassCard>
      ) : (
        <MotionGlassCard>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg text-white">
              {agendaDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAgendaDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))}>
                <IconChevron className="h-3.5 w-3.5 rotate-90" />
              </Button>
              <Button variant="ghost" onClick={() => setAgendaDay(new Date())}>Aujourd&apos;hui</Button>
              <Button variant="outline" onClick={() => setAgendaDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))}>
                <IconChevron className="h-3.5 w-3.5 -rotate-90" />
              </Button>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.06]">
            {Array.from({ length: 24 }, (_, h) => h).map((h) => {
              const slotEntries = agendaEntries.filter((e) => Number(e.time.slice(0, 2)) === h);
              return (
                <div key={h} className="group/slot flex min-h-[46px] items-stretch gap-3 bg-void-900/60 px-3 py-1.5">
                  <span className="w-12 shrink-0 pt-1 text-xs text-slate-500">{String(h).padStart(2, "0")}:00</span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-0.5">
                    {slotEntries.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setEditingPostId(e.id)}
                        style={e.networks[0] ? { borderLeft: `3px solid ${NETWORK_META[e.networks[0]].color}` } : undefined}
                        className="flex items-center gap-1.5 rounded-md bg-nebula-700/40 py-1 pl-1 pr-2 text-left text-[11px] text-slate-100 transition hover:scale-[1.03] hover:bg-nebula-700/70"
                      >
                        {e.thumbnailUrl && <img src={e.thumbnailUrl} alt="" className="h-6 w-6 rounded object-cover" />}
                        <span className="flex gap-0.5">
                          {e.networks.slice(0, 3).map((n, i) => (
                            <NetworkDot key={i} network={n} />
                          ))}
                        </span>
                        <span className="truncate">{e.title}</span>
                        <span className="text-slate-400">{e.time}</span>
                      </button>
                    ))}
                    {activeBrand && (
                      <button
                        type="button"
                        onClick={() =>
                          openQuickComposer({ date: dateKey(agendaDay), time: `${String(h).padStart(2, "0")}:00` })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-700 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/slot:opacity-100"
                        title={`Programmer à ${String(h).padStart(2, "0")}:00`}
                      >
                        <IconPlus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </MotionGlassCard>
      )}

      {Object.values(postsByBrand).every((list) => list.length === 0) && (
        <p className="text-center text-sm text-slate-500">
          Aucune publication programmée pour l&apos;instant.{" "}
          <Link href="/composer" className="text-aurora-300 hover:underline">Créez la première</Link>.
        </p>
      )}

      {editingPostId && (
        <PostEditModal
          postId={editingPostId}
          onClose={() => setEditingPostId(null)}
          onSaved={() => {
            setEditingPostId(null);
            refreshPosts();
          }}
        />
      )}

      {approvalModalOpen && activeBrand && (
        <ApprovalLinkModal brandId={activeBrand.id} onClose={() => setApprovalModalOpen(false)} />
      )}
    </div>
  );
}
