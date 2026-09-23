"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useBrand } from "@/components/brand-context";
import { NetworkBadge } from "@/components/ui/network-badge";
import { IconAvatar, IconMessage } from "@/components/dashboard/icons";
import { NETWORK_META, type Network } from "@/lib/types";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { clsx } from "@/lib/clsx";

interface EngagementItemRow {
  id: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  text: string | null;
  permalink: string | null;
  postPermalink: string | null;
  publishedAt: string | null;
  read: boolean;
}

interface ConnectionInfo {
  id: string;
  network: Network;
  displayName: string;
  handle: string | null;
  lastSyncedAt: string | null;
}

// Boîte de réception d'engagement PAR COMPTE (façon "Community" de Buffer) :
// commentaires reçus sur les publications récentes de CE compte connecté,
// distincte de la page Communauté (/community, forum public partagé entre
// tous les utilisateurs de Nebula). Toujours ouverte avec ?connectionId=...
// depuis le menu déroulant d'un compte sur la page Comptes, ou depuis le
// menu (Lot 3) — sans ce paramètre, on liste les comptes de la marque
// active pour en choisir un.
export default function InteractionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InteractionsPageInner />
    </Suspense>
  );
}

function InteractionsPageInner() {
  const params = useSearchParams();
  const connectionId = params.get("connectionId");

  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [supportsEngagement, setSupportsEngagement] = useState(true);
  const [items, setItems] = useState<EngagementItemRow[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!connectionId) return;
    fetch(`/api/engagement?connectionId=${connectionId}`)
      .then((r) => r.json())
      .then((d) => {
        setConnection(d.connection ?? null);
        setSupportsEngagement(d.supportsEngagement ?? true);
        setItems(d.items ?? []);
      })
      .catch(() => setItems([]));
  }, [connectionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Easter egg "Inbox zero" (voir le bandeau plus bas) : déclenché dès que
  // tout est traité pour ce compte.
  useEffect(() => {
    if (items && items.length > 0 && items.every((it) => it.read)) {
      reportEasterEggFound("inbox-zero");
    }
  }, [items]);

  async function onSync() {
    if (!connectionId) return;
    setSyncing(true);
    setSyncError(null);
    const res = await fetch("/api/engagement/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId })
    });
    const data = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setSyncError(data.error ?? "Échec de la synchronisation.");
      return;
    }
    load();
  }

  async function markRead(id: string) {
    setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, read: true } : it)) : prev));
    await fetch(`/api/engagement/${id}/read`, { method: "POST" }).catch(() => undefined);
  }

  async function markAllRead() {
    if (!connectionId) return;
    setItems((prev) => (prev ? prev.map((it) => ({ ...it, read: true })) : prev));
    await fetch("/api/engagement/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId })
    }).catch(() => undefined);
  }

  if (!connectionId) {
    return <InteractionsAccountPicker />;
  }

  const unreadCount = items?.filter((it) => !it.read).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Interactions {connection && <NetworkBadge network={connection.network} size="sm" />}
          </span>
        }
        description={
          connection ? (
            <>
              Commentaires reçus sur les publications de <span className="text-slate-300">{connection.displayName}</span>.
            </>
          ) : (
            "Chargement du compte…"
          )
        }
        actions={
          <>
            {unreadCount > 0 && (
              <Button variant="outline" onClick={markAllRead}>
                Tout marquer comme lu
              </Button>
            )}
            <Button onClick={onSync} disabled={syncing || !supportsEngagement}>
              {syncing ? "Synchronisation..." : "Actualiser"}
            </Button>
          </>
        }
      />

      {!supportsEngagement && connection && (
        <GlassCard className="border-amber-500/30 bg-amber-500/[0.04]">
          <p className="text-sm text-amber-200">
            {NETWORK_META[connection.network].label} ne permet pas encore de récupérer les commentaires via son API
            publique — cette boîte de réception restera vide pour ce compte tant que la plateforme ne l&apos;autorise
            pas.
          </p>
        </GlassCard>
      )}

      {syncError && (
        <GlassCard className="border-red-500/30 bg-red-500/[0.06]">
          <p className="text-sm text-red-300">{syncError}</p>
        </GlassCard>
      )}

      {/* Easter egg discret : plus rien à lire, on le dit plutôt que de
          laisser une liste silencieuse de commentaires déjà traités. */}
      {items && items.length > 0 && unreadCount === 0 && (
        <GlassCard className="border-emerald-500/30 bg-emerald-500/[0.05] text-center">
          <p className="text-sm text-emerald-300">📭 Inbox zero — tout est traité, pour l&apos;instant.</p>
        </GlassCard>
      )}

      {items === null ? (
        <div className="space-y-3" aria-busy="true">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <span className="sr-only">Chargement des interactions</span>
        </div>
      ) : items.length === 0 ? (
        <GlassCard className="text-center">
          <p className="text-sm text-slate-400">
            {supportsEngagement
              ? "Aucun commentaire synchronisé pour l'instant — cliquez sur « Actualiser » pour aller les chercher."
              : "Rien à afficher pour ce réseau."}
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <GlassCard
              key={it.id}
              className={clsx("flex items-start gap-3", !it.read && "border-aurora-400/30 bg-aurora-400/[0.04]")}
              onClick={() => !it.read && markRead(it.id)}
            >
              {it.authorAvatarUrl ? (
                <RemoteImage src={it.authorAvatarUrl} className="h-9 w-9 shrink-0 rounded-full" sizes="36px" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-400">
                  <IconAvatar className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-white">{it.authorName || "Utilisateur"}</p>
                  {!it.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-400" />}
                  {it.publishedAt && (
                    <span className="shrink-0 text-xs text-slate-500">
                      {new Date(it.publishedAt).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>
                {it.text && <p className="mt-0.5 text-sm text-slate-300">{it.text}</p>}
                {(it.permalink || it.postPermalink) && (
                  <a
                    href={it.permalink || it.postPermalink || "#"}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-xs text-aurora-300 hover:underline"
                  >
                    Voir sur {NETWORK_META[connection?.network ?? "INSTAGRAM"].label}
                  </a>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

// Sans ?connectionId (arrivée depuis le menu) : les comptes connectés de la
// marque active, à choisir en un clic.
function InteractionsAccountPicker() {
  const { activeBrand } = useBrand();
  const [connections, setConnections] = useState<ConnectionInfo[] | null>(null);

  useEffect(() => {
    if (!activeBrand) return;
    let cancelled = false;
    setConnections(null);
    fetch(`/api/connections?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setConnections((d.connections ?? []) as ConnectionInfo[]);
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBrand]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconMessage className="h-5 w-5" />}
        title="Interactions"
        description="Les commentaires reçus sur les publications d'un compte connecté. Choisissez le compte à consulter."
      />
      {connections === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={<IconMessage className="h-5 w-5" />}
          title="Aucun compte connecté"
          description="Connectez un compte Instagram, Facebook, TikTok ou YouTube pour voir ici les commentaires reçus."
          action={<ButtonLink href="/accounts">Connecter un compte</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Comptes connectés">
          {connections.map((c) => (
            <li key={c.id}>
              <Link
                href={`/interactions?connectionId=${c.id}`}
                className="glass-panel glass-panel-hover flex items-center gap-3 rounded-2xl p-4 transition"
              >
                <NetworkBadge network={c.network} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{c.displayName}</span>
                  <span className="block text-xs text-slate-500">{NETWORK_META[c.network].label}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
