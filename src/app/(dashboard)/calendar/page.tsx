"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { NetworkDot, NetworkLogo } from "@/components/ui/network-badge";
import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { m as motion } from "framer-motion";
import { QuotaBar } from "@/components/dashboard/quota-bar";
import { PostEditModal } from "@/components/dashboard/post-edit-modal";
import { ApprovalLinkModal } from "@/components/dashboard/approval-link-modal";
import { WeekScrubber, monthOfWeek } from "@/components/dashboard/week-scrubber";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { useAiStatus } from "@/components/use-ai-status";
import { IconChevron, IconList, IconPlus } from "@/components/dashboard/icons";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/dashboard/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { DEFAULT_TIMEZONE, dayKeyAndTime, timeZoneLabel, wallClockToUtc } from "@/lib/timezone";
import { calendarMonthsNeeded, monthKeysToRanges, type MonthKey } from "@/lib/calendar-range";
import { MotionRoot } from "@/components/motion/motion-root";

interface ApiPost {
  id: string;
  title: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  // Toujours présent (rempli par Prisma à la création) — sert de repère de
  // date pour les publications envoyées immédiatement, qui n'ont pas de
  // scheduledAt (voir entriesByDay ci-dessous).
  createdAt: string;
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

type CalendarView = "month" | "hours" | "list";
const VIEW_KEY = "nebula:calendar-view";

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// useSearchParams() impose un <Suspense> autour du composant qui l'appelle
// (voir accounts/page.tsx pour le même besoin, déjà en place ailleurs).
export default function CalendarPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const { activeBrand, brands } = useBrand();
  const aiStatus = useAiStatus(activeBrand?.id);
  const searchParams = useSearchParams();
  // Depuis le menu déroulant d'un compte sur la page Comptes : n'affiche que
  // les publications ciblant CE compte (voir l'effet plus bas, une fois les
  // connexions chargées).
  const filterConnectionId = searchParams.get("connectionId");
  // Trois vues : mois (grille), agenda (heures d'un jour), liste (jour par
  // jour — la vue par défaut sur téléphone, où une grille de 7 colonnes est
  // illisible). Le choix est mémorisé sur l'appareil.
  const [view, setView] = useState<CalendarView>("month");
  const toast = useToast();
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY) as CalendarView | null;
      if (stored === "month" || stored === "hours" || stored === "list") {
        setView(stored);
        return;
      }
    } catch {
      // stockage indisponible
    }
    if (window.matchMedia("(max-width: 767px)").matches) setView("list");
  }, []);
  function changeView(next: CalendarView) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignore
    }
  }
  // Fuseau horaire de programmation de la marque active (voir
  // src/lib/timezone.ts) : toutes les heures affichées et saisies ici sont
  // dans ce fuseau, pas dans celui de l'appareil.
  const timezone = activeBrand?.timezone ?? DEFAULT_TIMEZONE;
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

  // Publications chargées PAR MOIS (audit performance, lot 4) : seulement
  // les mois visibles (grille, vue Heures, scrubber), en version allégée
  // (view=light), puis fusionnées. Changer de mois ne charge que ce qui
  // manque ; revenir sur un mois déjà vu ne coûte rien.
  const loadedMonthsRef = useRef<Record<string, Set<MonthKey>>>({});
  const neededMonths = useMemo(
    () => calendarMonthsNeeded({ cursor, agendaDay, today: new Date() }),
    [cursor, agendaDay]
  );

  const loadPosts = useCallback(async (brandId: string, months: MonthKey[], replace: boolean) => {
    const ranges = monthKeysToRanges(months);
    const lists = await Promise.all(
      ranges.map((r) =>
        fetch(`/api/posts?brandId=${brandId}&view=light&from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(r.to.toISOString())}`)
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
          .then((d: { posts?: ApiPost[] }) => d.posts ?? [])
      )
    );
    setPostsByBrand((prev) => {
      const byId = new Map<string, ApiPost>(replace ? [] : (prev[brandId] ?? []).map((p) => [p.id, p]));
      for (const list of lists) for (const p of list) byId.set(p.id, p);
      return { ...prev, [brandId]: Array.from(byId.values()) };
    });
  }, []);

  useEffect(() => {
    selectedBrandIds.forEach((brandId) => {
      const loaded = (loadedMonthsRef.current[brandId] ??= new Set());
      const missing = neededMonths.filter((m) => !loaded.has(m));
      if (missing.length > 0) {
        missing.forEach((m) => loaded.add(m));
        loadPosts(brandId, missing, false).catch(() => {
          // Échec réseau : ces mois seront redemandés au prochain affichage.
          missing.forEach((m) => loaded.delete(m));
          toast.error("Impossible de charger une partie du calendrier. Réessayez dans un instant.");
        });
      }
      if (!connectionsByBrand[brandId]) {
        fetch(`/api/connections?brandId=${brandId}`)
          .then((r) => r.json())
          .then((d) => setConnectionsByBrand((prev) => ({ ...prev, [brandId]: d.connections ?? [] })))
          .catch(() => undefined);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrandIds, neededMonths, loadPosts]);

  // Rechargement complet des mois visibles (après une modification dans la
  // modale) : les mois déjà vus ailleurs seront redemandés à la demande.
  function refreshPosts() {
    selectedBrandIds.forEach((brandId) => {
      loadedMonthsRef.current[brandId] = new Set(neededMonths);
      loadPosts(brandId, neededMonths, true).catch(() => toast.error("Impossible de recharger le calendrier."));
    });
  }

  function patchPostLocally(postId: string, patch: Partial<ApiPost>) {
    setPostsByBrand((prev) => {
      const next: Record<string, ApiPost[]> = {};
      for (const [brandId, list] of Object.entries(prev)) {
        next[brandId] = list.some((p) => p.id === postId) ? list.map((p) => (p.id === postId ? { ...p, ...patch } : p)) : list;
      }
      return next;
    });
  }

  async function rescheduleToDay(entryId: string, time: string, newDay: Date) {
    const [h, m] = time.split(":").map(Number);
    // Même heure murale, autre jour — dans le fuseau de la marque.
    const newDate = wallClockToUtc({ year: newDay.getFullYear(), month: newDay.getMonth() + 1, day: newDay.getDate(), hour: h, minute: m }, timezone);
    // Déplacement vers un horaire déjà passé : refusé (le serveur refuse
    // aussi, voir src/lib/schedule-guard.ts).
    if (newDate.getTime() <= Date.now()) {
      toast.error(`Impossible de déplacer la publication à ${time} ce jour-là : cet horaire est déjà passé.`);
      return;
    }
    // Déplacement affiché tout de suite (mise à jour optimiste), annulé si
    // le serveur refuse — plus de rechargement complet du calendrier.
    const before = Object.values(postsByBrand).flat().find((p) => p.id === entryId);
    if (!before) return;
    patchPostLocally(entryId, { scheduledAt: newDate.toISOString(), status: "SCHEDULED" });
    const res = await fetch(`/api/posts/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: newDate.toISOString() })
    }).catch(() => null);
    if (!res || !res.ok) {
      patchPostLocally(entryId, { scheduledAt: before.scheduledAt, status: before.status });
      const data = res ? await res.json().catch(() => ({})) : {};
      toast.error((data as { error?: string }).error ?? "Impossible de déplacer cette publication (connexion perdue ?).");
    }
  }

  const allConnections = useMemo(
    () => selectedBrandIds.flatMap((id) => (connectionsByBrand[id] ?? []).map((c) => ({ ...c, brandId: id }))),
    [selectedBrandIds, connectionsByBrand]
  );

  // Applique le filtre "un seul compte" dès que ses connexions sont
  // chargées : masque tous les autres comptes plutôt que de n'afficher que
  // celui-là dans un mécanisme séparé, pour rester compatible avec le
  // panneau Filtres existant (qui peut ensuite le réélargir normalement).
  useEffect(() => {
    if (!filterConnectionId || allConnections.length === 0) return;
    if (!allConnections.some((c) => c.id === filterConnectionId)) return;
    setHiddenConnectionIds(new Set(allConnections.filter((c) => c.id !== filterConnectionId).map((c) => c.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterConnectionId, allConnections]);

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
        // Une publication envoyée immédiatement ("Publier maintenant" dans le
        // Composer, pas de date programmée) n'a pas de scheduledAt — avant,
        // ça la faisait sauter complètement du calendrier (elle existait bien
        // dans "Liste des publications", juste invisible ici). On retombe sur
        // createdAt dans ce cas, qui correspond au moment de l'envoi.
        const dateForDisplay = p.scheduledAt ?? p.createdAt;
        if (!dateForDisplay) continue;
        const visibleTargets = p.targets.filter(
          (t) => !hiddenConnectionIds.has(t.connectionId) && !hiddenNetworks.has(t.network)
        );
        if (p.targets.length > 0 && visibleTargets.length === 0) continue; // tous les comptes de ce post sont masqués
        const { key, time } = dayKeyAndTime(new Date(dateForDisplay), timezone);
        push(key, {
          id: p.id,
          title: p.title || p.caption || "(sans titre)",
          networks: visibleTargets.map((t) => t.network),
          status: p.status,
          // Miniature de la vidéo, ou l'image elle-même — jamais l'adresse
          // du fichier vidéo (ce qui donnait une icône d'image cassée).
          thumbnailUrl:
            p.media[0]?.mediaAsset.thumbnailUrl || (p.media[0]?.mediaAsset.type === "IMAGE" ? p.media[0]?.mediaAsset.url : undefined),
          time
        });
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [postsByBrand, selectedBrandIds, hiddenConnectionIds, hiddenNetworks, timezone]);

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

  const todayKey = dayKeyAndTime(new Date(), timezone).key;
  const agendaEntries = entriesByDay.get(dateKey(agendaDay)) ?? [];

  // Vue liste : les jours du mois affiché qui ont au moins une publication.
  const listDays = useMemo(() => {
    const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-`;
    return Array.from(entriesByDay.keys())
      .filter((k) => k.startsWith(monthPrefix))
      .sort()
      .map((k) => ({ key: k, date: new Date(`${k}T12:00:00`), entries: entriesByDay.get(k) ?? [] }));
  }, [entriesByDay, cursor]);

  // Scrubber temporel : nombre de publications par jour, tous jours
  // chargés confondus (indépendant du mois affiché à l'écran).
  const entryCountByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, list] of entriesByDay) map.set(key, list.length);
    return map;
  }, [entriesByDay]);

  // Scrubber : une semaine ouvre le mois de son jeudi (celui qui contient la
  // majorité de ses jours, voir monthOfWeek) ; en vue Heures, elle ouvre
  // aussi son lundi, ou aujourd'hui si c'est la semaine en cours.
  function onSelectWeek(monday: Date) {
    setCursor(monthOfWeek(monday));
    if (view === "hours") {
      const today = new Date();
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 7);
      setAgendaDay(today >= monday && today < sunday ? today : monday);
    }
  }

  function onSelectMonth(firstOfMonth: Date) {
    setCursor(firstOfMonth);
    if (view === "hours") {
      const today = new Date();
      setAgendaDay(today.getFullYear() === firstOfMonth.getFullYear() && today.getMonth() === firstOfMonth.getMonth() ? today : firstOfMonth);
    }
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

  return (
    <MotionRoot>
      <div className="space-y-6">
        <PageHeader
          title="Calendrier"
          description="Planifiez et visualisez vos publications multi-réseaux en un coup d'œil."
          actions={
            <>
              {aiStatus?.plan === "AGENCY" && (
                <Button variant="outline" onClick={() => setApprovalModalOpen(true)}>
                  Lien d&apos;approbation client
                </Button>
              )}
              <ButtonLink href="/publications" variant="outline" className="inline-flex items-center gap-2">
                <IconList className="h-4 w-4" /> Publications
              </ButtonLink>
              <ButtonLink href="/composer" className="inline-flex items-center gap-2">
                <IconPlus className="h-4 w-4" /> Nouvelle publication
              </ButtonLink>
            </>
          }
        />

        {filterConnectionId && (
          <div className="flex items-center gap-2 rounded-lg border border-aurora-400/30 bg-aurora-400/[0.06] px-3 py-2 text-sm text-aurora-200">
            <span>
              Filtré sur {allConnections.find((c) => c.id === filterConnectionId)?.displayName ?? "un compte"} — les
              publications des autres comptes sont masquées.
            </span>
            <Link href="/calendar" className="ml-auto shrink-0 text-xs underline hover:text-white">
              Voir tous les comptes
            </Link>
          </div>
        )}

        <QuotaBar brandId={activeBrand?.id} />

        <WeekScrubber
          entryCountByDay={entryCountByDay}
          mode={view === "hours" ? "week" : "month"}
          activeDate={view === "hours" ? agendaDay : cursor}
          onSelectWeek={onSelectWeek}
          onSelectMonth={onSelectMonth}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            items={[
              { value: "month" as const, label: "Mois" },
              { value: "list" as const, label: "Liste" },
              { value: "hours" as const, label: "Agenda (heures)" }
            ]}
            value={view}
            onChange={changeView}
            aria-label="Vue du calendrier"
          />

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

        {view === "list" ? (
          <MotionGlassCard>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg text-white">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" aria-label="Mois précédent" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>←</Button>
                <Button variant="ghost" onClick={() => setCursor(new Date(new Date().setDate(1)))}>Aujourd&apos;hui</Button>
                <Button variant="outline" aria-label="Mois suivant" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>→</Button>
              </div>
            </div>
            {listDays.length === 0 ? (
              <EmptyState
                bare
                title="Rien de programmé ce mois-ci"
                description="Les publications programmées apparaîtront ici, jour par jour."
                action={
                  <Link href="/composer" className="inline-block">
                    <Button>Nouvelle publication</Button>
                  </Link>
                }
              />
            ) : (
              <ol className="space-y-4">
                {listDays.map((day) => (
                  <li key={day.key}>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className={clsx("text-sm font-medium", day.key === todayKey ? "text-aurora-300" : "text-slate-300")}>
                        {day.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                        {day.key === todayKey && " · aujourd'hui"}
                      </h3>
                      {activeBrand && (
                        <Link href={`/composer?date=${day.key}`} className="text-xs text-slate-500 hover:text-white">
                          + Ajouter
                        </Link>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {day.entries.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => setEditingPostId(e.id)}
                            style={e.networks[0] ? { borderLeft: `3px solid ${NETWORK_META[e.networks[0]].color}` } : undefined}
                            className="flex w-full items-center gap-3 rounded-xl bg-nebula-700/30 px-3 py-2.5 text-left text-sm text-slate-100 transition hover:bg-nebula-700/60"
                          >
                            <span className="w-12 shrink-0 font-mono text-xs text-slate-400">{e.time}</span>
                            <PostThumb entry={e} className="h-9 w-9 rounded-lg" sizes="36px" />
                            <span className="min-w-0 flex-1 truncate">{e.title}</span>
                            <span className="flex shrink-0 gap-0.5">
                              {e.networks.slice(0, 4).map((n, i) => (
                                <NetworkDot key={i} network={n} />
                              ))}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-[11px] text-slate-500">
              Heures de {timezone.replace(/_/g, " ")} ({timeZoneLabel(timezone)}).
            </p>
          </MotionGlassCard>
        ) : view === "month" ? (
          <MotionGlassCard>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg text-white">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" aria-label="Mois précédent" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>←</Button>
                <Button variant="ghost" onClick={() => setCursor(new Date(new Date().setDate(1)))}>Aujourd&apos;hui</Button>
                <Button variant="outline" aria-label="Mois suivant" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>→</Button>
              </div>
            </div>

            {/* minmax(0,1fr) : une colonne ne s'élargit jamais sous l'effet d'un
                titre long — le contenu reste dans sa case. */}
            <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-xl border border-white/[0.06]">
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
                // Jour passé (24/09/2026) : grisé, pas de « + », et ce n'est
                // plus une cible de glisser-déposer (le serveur refuse de toute
                // façon un horaire passé, voir schedule-guard.ts).
                const isPastDay = key < todayKey;
                return (
                  <div
                    key={key}
                    aria-disabled={isPastDay || undefined}
                    onDragOver={(ev) => {
                      if (isPastDay) return;
                      ev.preventDefault();
                      setDragOverKey(key);
                    }}
                    onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      setDragOverKey(null);
                      setDraggingId(null);
                      if (isPastDay) return;
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
                      // Hauteur fixe : toutes les cases d'une semaine restent
                      // alignées ; les publications défilent DANS la case.
                      "group/cell relative flex h-[152px] min-w-0 flex-col overflow-hidden p-2 align-top transition",
                      // Jours hors du mois : fond transparent et numéro plus discret,
                      // sans opacité (l'opacité rendait le numéro illisible, 2:1).
                      inMonth ? "bg-void-900/60" : "bg-transparent",
                      isPastDay && "cal-day-past",
                      draggingId && isPastDay && "cursor-not-allowed",
                      dragOverKey === key && "ring-2 ring-inset ring-aurora-400/60 bg-aurora-400/[0.06]"
                    )}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span
                        className={clsx(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          isToday ? "today-glow bg-nebula-500 text-white" : inMonth ? "text-slate-400" : "text-slate-500"
                        )}
                      >
                        {day.getDate()}
                      </span>
                      <div className="flex items-center gap-1">
                        {entries.length > 3 && (
                          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-400" title={`${entries.length} publications ce jour-là — faites défiler la case`}>
                            {entries.length}
                          </span>
                        )}
                        {activeBrand && !isPastDay && (
                          <Link
                            href={`/composer?date=${key}`}
                            title="Créer un post à cette date"
                            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/cell:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70"
                          >
                            <IconPlus className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                    {/* Toutes les publications du jour, dans une zone qui défile
                        avec sa propre mini barre (au-delà de 3, un fondu en bas
                        et le compteur de l'en-tête signalent la suite). */}
                    <motion.div
                      layoutScroll
                      className={clsx("cal-day-scroll -mr-1 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1", entries.length > 3 && "cal-day-scroll-fade")}
                    >
                      {entries.map((e) => {
                        // Seules les publications pas encore envoyées se
                        // reprogramment (même règle que PATCH /api/posts/[id]).
                        const movable = e.status === "DRAFT" || e.status === "SCHEDULED";
                        return (
                        // Le layoutId sur le conteneur (et non le <button> natif
                        // lui-même) anime la position lors d'un déplacement par
                        // glisser-déposer, sans entrer en conflit avec les
                        // événements HTML5 natifs draggable/onDragStart/onDragEnd
                        // du bouton (framer-motion redéfinit ces props pour son
                        // propre système de geste quand elles sont posées
                        // directement sur un composant motion).
                        <motion.div key={e.id} layout layoutId={`entry-${e.id}`} transition={{ type: "spring", stiffness: 350, damping: 28 }}>
                          <button
                            draggable={movable}
                            onDragStart={(ev) => {
                              if (!movable) return;
                              ev.dataTransfer.setData("text/plain", JSON.stringify({ id: e.id, time: e.time }));
                              ev.dataTransfer.effectAllowed = "move";
                              setDraggingId(e.id);
                            }}
                            onDragEnd={() => setDraggingId(null)}
                            onClick={() => setEditingPostId(e.id)}
                            title={movable ? `${e.title} — glissez vers un autre jour pour reprogrammer` : e.title}
                            style={e.networks[0] ? { borderLeft: `3px solid ${NETWORK_META[e.networks[0]].color}` } : undefined}
                            className={clsx(
                              "flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md bg-nebula-700/40 py-1 pl-1 pr-1.5 text-left text-[11px] text-slate-100 transition hover:bg-nebula-700/70",
                              movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                              draggingId === e.id && "opacity-40"
                            )}
                          >
                            <PostThumb entry={e} className="h-6 w-6 rounded" sizes="24px" />
                            <span className="flex shrink-0 gap-0.5">
                              {e.networks.slice(0, 3).map((n, i) => (
                                <NetworkDot key={i} network={n} />
                              ))}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{e.title}</span>
                            <span className="shrink-0 text-slate-400">{e.time}</span>
                          </button>
                        </motion.div>
                        );
                      })}
                    </motion.div>
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
                          <PostThumb entry={e} className="h-6 w-6 rounded" sizes="24px" />
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
                        <Link
                          href={`/composer?date=${dateKey(agendaDay)}&time=${String(h).padStart(2, "0")}:00`}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/slot:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70"
                          title={`Programmer à ${String(h).padStart(2, "0")}:00`}
                        >
                          <IconPlus className="h-3.5 w-3.5" />
                        </Link>
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
            Aucune publication sur cette période.{" "}
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
    </MotionRoot>
  );
}

// Vignette d'une publication dans le calendrier : miniature de la vidéo ou
// image publiée ; à défaut (vidéo sans miniature, image introuvable), le
// logo du premier réseau ciblé sur sa couleur — jamais d'image cassée.
function PostThumb({ entry, className, sizes }: { entry: DayEntry; className: string; sizes: string }) {
  const network = entry.networks[0];
  const fallback = network ? (
    <span className="flex h-full w-full items-center justify-center text-white" style={{ background: NETWORK_META[network].color }}>
      <NetworkLogo network={network} className="h-1/2 w-1/2" />
    </span>
  ) : (
    <span className="block h-full w-full bg-white/[0.06]" />
  );
  if (!entry.thumbnailUrl) return <span className={clsx("relative block shrink-0 overflow-hidden", className)}>{fallback}</span>;
  return <RemoteImage src={entry.thumbnailUrl} className={clsx("shrink-0", className)} sizes={sizes} fallback={fallback} />;
}
