"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/ui/network-badge";
import { IconAvatar, IconMessage } from "@/components/dashboard/icons";
import { NETWORK_META, type Network } from "@/lib/types";
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
// depuis le menu déroulant d'un compte sur la page Comptes — sans ce
// paramètre, on affiche une invite à y retourner plutôt qu'une liste vide.
export default function InteractionsPage() {
  return (
    <Suspense fallback={null}>
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
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-nebula-500 to-accent-cyan text-white">
          <IconMessage className="h-5 w-5" />
        </div>
        <h1 className="font-display text-xl font-semibold text-white">Interactions</h1>
        <p className="mt-2 text-sm text-slate-400">
          Choisissez un compte depuis la page Comptes pour voir les commentaires reçus sur ses publications.
        </p>
        <Link href="/accounts" className="mt-4 inline-block">
          <Button variant="outline">Aller aux Comptes</Button>
        </Link>
      </div>
    );
  }

  const unreadCount = items?.filter((it) => !it.read).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-white">Interactions</h1>
            {connection && <NetworkBadge network={connection.network} size="sm" />}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {connection ? (
              <>
                Commentaires reçus sur les publications de <span className="text-slate-300">{connection.displayName}</span>.
              </>
            ) : (
              "Chargement du compte..."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllRead}>
              Tout marquer comme lu
            </Button>
          )}
          <Button onClick={onSync} disabled={syncing || !supportsEngagement}>
            {syncing ? "Synchronisation..." : "Actualiser"}
          </Button>
        </div>
      </div>

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

      {items === null ? (
        <p className="text-sm text-slate-500">Chargement...</p>
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
                <img src={it.authorAvatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
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
