"use client";

// Onglet COMMENTAIRES — la modération du TEXTE reçu sur vos publications,
// tous comptes de la marque confondus (façon boîte de réception unifiée),
// filtrable par compte et par état (non lus), regroupable par publication
// pour lire un fil d'un coup. Les CHIFFRES (likes, partages…) sont dans
// l'onglet Engagements (/engagements) : les deux notions étaient mélangées
// dans l'ancien « Interactions », scindé depuis.
//
// ?connectionId=… (menu déroulant d'un compte sur la page Comptes, ou
// ancien lien /interactions redirigé) présélectionne simplement le filtre de
// compte — la page reste la même.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NetworkBadge, NetworkTile } from "@/components/ui/network-badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useAiAssistant } from "@/components/dashboard/ai-assistant-context";
import { IconAvatar, IconMessage, IconRefresh, IconSparkle } from "@/components/dashboard/icons";
import { NETWORK_META, type Network } from "@/lib/types";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { clsx } from "@/lib/clsx";

interface CommentRow {
  id: string;
  connectionId: string;
  network: Network;
  authorName: string | null;
  authorAvatarUrl: string | null;
  text: string | null;
  permalink: string | null;
  postExternalId: string | null;
  postPermalink: string | null;
  publishedAt: string | null;
  read: boolean;
  /** Réponse du compte repérée à la synchro (Réussites, lot B). */
  ownerRepliedAt?: string | null;
}

interface ConnectionInfo {
  id: string;
  network: Network;
  displayName: string;
  handle: string | null;
  lastSyncedAt: string | null;
  supportsEngagement: boolean;
}

type ReadFilter = "all" | "unread";
type Grouping = "date" | "post";

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

export default function CommentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CommentsPageInner />
    </Suspense>
  );
}

function CommentsPageInner() {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const assistant = useAiAssistant();
  const params = useSearchParams();
  const preselected = params.get("connectionId");

  const [connections, setConnections] = useState<ConnectionInfo[] | null>(null);
  const [items, setItems] = useState<CommentRow[] | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | "all">(preselected ?? "all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [grouping, setGrouping] = useState<Grouping>("date");
  const [syncing, setSyncing] = useState(false);
  const [syncNotes, setSyncNotes] = useState<string[]>([]);

  // Dépend de l'identifiant (stable) et non de l'objet marque : un objet
  // recréé au rendu relancerait le chargement en boucle.
  const brandId = activeBrand?.id;
  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await fetch(`/api/engagement?brandId=${brandId}`, { cache: "no-store" });
      const d = await res.json();
      setConnections(d.connections ?? []);
      setItems(d.items ?? []);
    } catch {
      setConnections([]);
      setItems([]);
    }
  }, [brandId]);

  useEffect(() => {
    setConnections(null);
    setItems(null);
    void load();
  }, [load]);

  // Le filtre présélectionné par l'URL ne doit pas survivre à un changement
  // de marque (le compte n'existe plus dans la liste).
  useEffect(() => {
    if (connections && accountFilter !== "all" && !connections.some((c) => c.id === accountFilter)) setAccountFilter("all");
  }, [connections, accountFilter]);

  // Easter egg « Inbox zero » : tout est traité sur au moins un compte.
  useEffect(() => {
    if (items && items.length > 0 && items.every((it) => it.read)) reportEasterEggFound("inbox-zero");
  }, [items]);

  const connectionById = useMemo(() => new Map((connections ?? []).map((c) => [c.id, c])), [connections]);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((it) => (accountFilter === "all" || it.connectionId === accountFilter) && (readFilter === "all" || !it.read));
  }, [items, accountFilter, readFilter]);

  // Regroupement par publication : clé = lien de la publication (ou son
  // identifiant), tri par commentaire le plus récent.
  const groups = useMemo(() => {
    if (grouping !== "post") return null;
    const map = new Map<string, { key: string; permalink: string | null; network: Network; rows: CommentRow[] }>();
    for (const it of filtered) {
      const key = it.postPermalink || it.postExternalId || `${it.connectionId}:sans-publication`;
      const g = map.get(key) ?? { key, permalink: it.postPermalink, network: it.network, rows: [] };
      g.rows.push(it);
      map.set(key, g);
    }
    return [...map.values()];
  }, [filtered, grouping]);

  const unreadCount = items?.filter((it) => !it.read && (accountFilter === "all" || it.connectionId === accountFilter)).length ?? 0;
  const unsupported = (connections ?? []).filter((c) => !c.supportsEngagement);
  const syncableCount = (connections ?? []).filter((c) => c.supportsEngagement).length;

  async function onSync() {
    if (!activeBrand) return;
    setSyncing(true);
    setSyncNotes([]);
    try {
      const body = accountFilter === "all" ? { brandId: activeBrand.id } : { connectionId: accountFilter };
      const res = await fetch("/api/engagement/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Échec de la synchronisation.");
        return;
      }
      const failures: string[] = (data.results ?? [])
        .filter((r: { error?: string }) => r.error)
        .map((r: { network: string; error: string }) => `${NETWORK_META[r.network as Network]?.label ?? r.network} : ${r.error}`);
      setSyncNotes(failures);
      toast.success(`${data.count ?? 0} commentaire(s) synchronisé(s).`);
      await load();
    } catch {
      toast.error("Connexion perdue pendant la synchronisation.");
    } finally {
      setSyncing(false);
    }
  }

  async function markRead(id: string) {
    setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, read: true } : it)) : prev));
    await fetch(`/api/engagement/${id}/read`, { method: "POST" }).catch(() => undefined);
  }

  async function markAllRead() {
    const targets = accountFilter === "all" ? (connections ?? []).map((c) => c.id) : [accountFilter];
    setItems((prev) => (prev ? prev.map((it) => (targets.includes(it.connectionId) ? { ...it, read: true } : it)) : prev));
    await Promise.all(
      targets.map((connectionId) =>
        fetch("/api/engagement/read-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId }) }).catch(() => undefined)
      )
    );
  }

  function askAssistant(it: CommentRow) {
    const network = NETWORK_META[it.network]?.label ?? it.network;
    assistant.ask(`Aide-moi à répondre à ce commentaire reçu sur ${network} (propose 2 tons : chaleureux et sobre) :\n« ${(it.text ?? "").slice(0, 600)} »`, {
      submit: true,
      contextKey: "comments"
    });
  }

  const loading = connections === null || items === null;

  if (!loading && connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader icon={<IconMessage className="h-5 w-5" />} title="Commentaires" description="Modérez les commentaires reçus sur vos publications, tous comptes confondus." />
        <EmptyState
          icon={<IconMessage className="h-5 w-5" />}
          title="Aucun compte connecté"
          description="Connectez un compte Instagram, Facebook ou YouTube pour voir ici les commentaires reçus."
          action={<ButtonLink href="/accounts">Connecter un compte</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconMessage className="h-5 w-5" />}
        title="Commentaires"
        description={
          <>
            Les commentaires reçus sur vos publications, tous comptes confondus — à lire, marquer comme traités et, au besoin, faire relire par
            l&apos;assistant. Les chiffres (likes, partages) sont dans <span className="text-slate-300">Engagements</span>.
          </>
        }
        actions={
          <>
            {unreadCount > 0 && (
              <Button variant="outline" onClick={markAllRead}>
                Tout marquer comme lu
              </Button>
            )}
            <Button onClick={onSync} disabled={syncing || loading || syncableCount === 0}>
              <IconRefresh className={clsx("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Synchronisation…" : "Actualiser"}
            </Button>
          </>
        }
      />

      {/* Filtres : compte, état, regroupement */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par compte">
            <FilterChip active={accountFilter === "all"} onClick={() => setAccountFilter("all")}>
              Tous les comptes
            </FilterChip>
            {connections.map((c) => (
              <FilterChip key={c.id} active={accountFilter === c.id} onClick={() => setAccountFilter(c.id)} title={c.supportsEngagement ? undefined : "Commentaires non disponibles pour ce réseau"}>
                {/* Filtre de compte : logo officiel + nom, sans pastille dans la pastille. */}
                <NetworkTile network={c.network} size={18} />
                <span className="max-w-[140px] truncate" title={NETWORK_META[c.network].label}>{c.displayName}</span>
              </FilterChip>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />
          <div className="flex gap-1.5" role="group" aria-label="Filtrer par état">
            <FilterChip active={readFilter === "all"} onClick={() => setReadFilter("all")}>
              Tous
            </FilterChip>
            <FilterChip active={readFilter === "unread"} onClick={() => setReadFilter("unread")}>
              Non lus{unreadCount > 0 && <span className="ml-1 rounded-full bg-aurora-400/20 px-1.5 text-[10px] text-aurora-200">{unreadCount}</span>}
            </FilterChip>
          </div>
          <span className="hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />
          <div className="flex gap-1.5" role="group" aria-label="Regrouper">
            <FilterChip active={grouping === "date"} onClick={() => setGrouping("date")}>
              Par date
            </FilterChip>
            <FilterChip active={grouping === "post"} onClick={() => setGrouping("post")}>
              Par publication
            </FilterChip>
          </div>
        </div>
      )}

      {unsupported.length > 0 && (accountFilter === "all" || unsupported.some((c) => c.id === accountFilter)) && (
        <GlassCard className="border-amber-500/30 bg-amber-500/[0.04]">
          <p className="text-sm text-amber-200">
            {unsupported.map((c) => NETWORK_META[c.network].label).filter((v, i, a) => a.indexOf(v) === i).join(", ")} ne permet pas encore de lire les commentaires via son API publique — ces comptes n&apos;apparaîtront pas ici tant que la plateforme ne l&apos;autorise pas.
          </p>
        </GlassCard>
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

      {!loading && items.length > 0 && filtered.length > 0 && unreadCount === 0 && readFilter === "all" && (
        <GlassCard className="border-emerald-500/30 bg-emerald-500/[0.05] text-center">
          <p className="text-sm text-emerald-300">📭 Inbox zero — tout est traité, pour l&apos;instant.</p>
        </GlassCard>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <span className="sr-only">Chargement des commentaires</span>
        </div>
      ) : filtered.length === 0 ? (
        <GlassCard className="text-center">
          <p className="text-sm text-slate-400">
            {items.length === 0
              ? "Aucun commentaire synchronisé pour l'instant — cliquez sur « Actualiser » pour aller les chercher sur vos réseaux."
              : readFilter === "unread"
                ? "Aucun commentaire non lu avec ces filtres."
                : "Aucun commentaire pour ce compte."}
          </p>
        </GlassCard>
      ) : groups ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <NetworkBadge network={g.network} size="sm" />
                  {g.permalink ? (
                    <a href={g.permalink} target="_blank" rel="noreferrer" className="text-aurora-300 hover:underline">
                      Voir la publication
                    </a>
                  ) : (
                    <span>Publication</span>
                  )}
                  <span className="text-slate-600">·</span>
                  <span>
                    {g.rows.length} commentaire{g.rows.length > 1 ? "s" : ""}
                  </span>
                </p>
              </div>
              <div className="space-y-2 border-l border-white/[0.06] pl-3">
                {g.rows.map((it) => (
                  <CommentCard key={it.id} item={it} connection={connectionById.get(it.connectionId)} onRead={markRead} onAsk={assistant.enabled ? askAssistant : undefined} compact />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => (
            <CommentCard key={it.id} item={it} connection={connectionById.get(it.connectionId)} onRead={markRead} onAsk={assistant.enabled ? askAssistant : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentCard({
  item,
  connection,
  onRead,
  onAsk,
  compact
}: {
  item: CommentRow;
  connection?: ConnectionInfo;
  onRead: (id: string) => void;
  onAsk?: (item: CommentRow) => void;
  compact?: boolean;
}) {
  const networkLabel = NETWORK_META[item.network]?.label ?? item.network;
  return (
    <GlassCard
      className={clsx("flex items-start gap-3", compact && "py-3", !item.read && "border-aurora-400/30 bg-aurora-400/[0.04]")}
      onClick={() => !item.read && onRead(item.id)}
    >
      {item.authorAvatarUrl ? (
        <RemoteImage src={item.authorAvatarUrl} className="h-9 w-9 shrink-0 rounded-full" sizes="36px" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-400">
          <IconAvatar className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-medium text-white">{item.authorName || "Utilisateur"}</p>
          {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-400" aria-label="Non lu" />}
          {!compact && connection && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              <NetworkBadge network={item.network} size="sm" />
              {connection.displayName}
            </span>
          )}
          {item.publishedAt && (
            <span className="shrink-0 text-xs text-slate-500" title={new Date(item.publishedAt).toLocaleString("fr-FR")}>
              {relativeDate(item.publishedAt)}
            </span>
          )}
        </div>
        {item.text && <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-300">{item.text}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          {item.ownerRepliedAt && (
            <span className="inline-flex items-center rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300" title="Réponse de votre compte repérée à la dernière actualisation">
              Vous avez répondu
            </span>
          )}
          {(item.permalink || item.postPermalink) && (
            <a
              href={item.permalink || item.postPermalink || "#"}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-aurora-300 hover:underline"
            >
              Répondre sur {networkLabel} ↗
            </a>
          )}
          {onAsk && item.text && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAsk(item);
              }}
              className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-white"
              title="Demander une proposition de réponse à l'assistant"
            >
              <IconSparkle className="h-3.5 w-3.5 text-aurora-300" /> Proposer une réponse
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
