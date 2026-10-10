"use client";

// Interactions › Commentaires (09/10/2026 : Commentaires et Engagements
// réunis dans une seule page « Interactions », /interactions, demande de
// Lucas ; ce composant était la page /comments, qui redirige ici).
//
// Façon YouTube Studio (10/10/2026, demande de Lucas) :
//  - une barre de tri et de filtres sur une ligne : plus récents ou plus
//    anciens, compte, état de la réponse (sans réponse / avec réponse),
//    lecture (non lus), recherche, et le contenu choisi ;
//  - un tableau : le commentaire à gauche (photo, nom, date, texte, puis
//    Répondre, J'aime, ⋮), le contenu commenté à droite (miniature et
//    titre ; un clic n'affiche que les commentaires de ce contenu) ;
//  - J'aime : Facebook et Bluesky ; Supprimer (menu ⋮, avec confirmation) :
//    Instagram et Facebook — ce que les réseaux ouvrent aux applications
//    (voir src/lib/social/comment-actions-support.ts).
//
// ?connectionId=… (menu déroulant d'un compte sur la page Comptes, ou
// ancien lien /interactions redirigé) présélectionne le filtre de compte.
// ?post=… (bouton « Commentaires » d'une ligne de la page Publications) :
// seulement les commentaires de cette publication, sur tous ses réseaux ;
// une pastille « Publication : … ✕ » retire le filtre.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { NetworkLogo } from "@/components/ui/network-badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { useAiAssistant } from "@/components/dashboard/ai-assistant-context";
import { IconAvatar, IconClose, IconDots, IconMessage, IconRefresh, IconSearch, IconThumbUp } from "@/components/dashboard/icons";
import { NETWORK_META, commentNetworks, networksSentence, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { CommentReplyBox } from "@/components/comments/comment-reply-box";
import type { CommentReplySupport } from "@/lib/social/comment-reply-support";
import type { CommentActionSupport } from "@/lib/social/comment-actions-support";
import { AiIcon } from "@/components/ai/ai-icon";
import { commentOfPost, type TargetRef } from "@/lib/posts/comment-match";

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
  /** J'aime du compte sur ce commentaire (10/10/2026). */
  ownerLikedAt?: string | null;
  /** Contenu commenté (10/10/2026). */
  postTitle?: string | null;
  postThumbnailUrl?: string | null;
}

interface ConnectionInfo {
  id: string;
  network: Network;
  displayName: string;
  handle: string | null;
  lastSyncedAt: string | null;
  supportsEngagement: boolean;
  /** Répondre depuis Nebula (01/10/2026) : possible, ou pourquoi pas. */
  reply?: CommentReplySupport;
  /** J'aime et suppression depuis Nebula (10/10/2026). */
  actions?: CommentActionSupport;
}

type Sort = "recent" | "oldest";
type ReplyState = "all" | "unanswered" | "answered";
type ReadFilter = "all" | "unread";

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.round(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.round(months / 12);
  return `il y a ${years} an${years > 1 ? "s" : ""}`;
}

/** Clé d'un contenu commenté (compte + publication). */
const contentKey = (it: Pick<CommentRow, "connectionId" | "postExternalId" | "postPermalink">) => `${it.connectionId}|${it.postExternalId ?? it.postPermalink ?? ""}`;

function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

function IconFilterLines({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  );
}

export function CommentsView({ tabs }: { tabs?: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CommentsPageInner tabs={tabs} />
    </Suspense>
  );
}

function CommentsPageInner({ tabs }: { tabs?: ReactNode }) {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const confirm = useConfirm();
  const assistant = useAiAssistant();
  const params = useSearchParams();
  const preselected = params.get("connectionId");
  const router = useRouter();
  const postParam = params.get("post");
  const [postFilter, setPostFilter] = useState<{ id: string; title: string; targets: TargetRef[] } | null>(null);
  useEffect(() => {
    if (!postParam) {
      setPostFilter(null);
      return;
    }
    let alive = true;
    fetch(`/api/posts/${encodeURIComponent(postParam)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.post) return;
        const p = d.post as { id: string; title: string; caption: string; targets: TargetRef[] };
        const title = p.title.trim() || p.caption.trim().split("\n")[0] || "(sans titre)";
        setPostFilter({ id: p.id, title, targets: p.targets.map((t) => ({ connectionId: t.connectionId, externalPostId: t.externalPostId, externalUrl: t.externalUrl })) });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [postParam]);

  const [connections, setConnections] = useState<ConnectionInfo[] | null>(null);
  const [items, setItems] = useState<CommentRow[] | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | "all">(preselected ?? "all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [replyState, setReplyState] = useState<ReplyState>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  // Contenu choisi d'un clic sur sa miniature (colonne de droite).
  const [contentFilter, setContentFilter] = useState<{ key: string; title: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotes, setSyncNotes] = useState<string[]>([]);
  // La marque a-t-elle des comptes, même sans commentaires lisibles ?
  const [hasAccounts, setHasAccounts] = useState(false);

  // Dépend de l'identifiant (stable) et non de l'objet marque : un objet
  // recréé au rendu relancerait le chargement en boucle.
  const brandId = activeBrand?.id;
  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await fetch(`/api/engagement?brandId=${brandId}`, { cache: "no-store" });
      const d = await res.json();
      // Seuls les comptes dont l'API laisse lire les commentaires (03/10/2026 :
      // TikTok et Pinterest ne le permettent pas, ils n'apparaissent plus ici).
      setConnections(((d.connections ?? []) as ConnectionInfo[]).filter((c) => c.supportsEngagement));
      setHasAccounts((d.connections ?? []).length > 0);
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

  const connectionById = useMemo(() => new Map((connections ?? []).map((c) => [c.id, c])), [connections]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    const rows = items.filter(
      (it) =>
        (accountFilter === "all" || it.connectionId === accountFilter) &&
        (readFilter === "all" || !it.read) &&
        (replyState === "all" || (replyState === "unanswered" ? !it.ownerRepliedAt : Boolean(it.ownerRepliedAt))) &&
        (!contentFilter || contentKey(it) === contentFilter.key) &&
        (!postFilter || commentOfPost(it, postFilter.targets)) &&
        (!q || [it.text, it.authorName, it.postTitle].some((v) => v?.toLowerCase().includes(q)))
    );
    const time = (it: CommentRow) => (it.publishedAt ? new Date(it.publishedAt).getTime() : 0);
    return rows.sort((a, b) => (sort === "recent" ? time(b) - time(a) : time(a) - time(b)));
  }, [items, accountFilter, readFilter, replyState, contentFilter, postFilter, query, sort]);

  const unreadCount = items?.filter((it) => !it.read && (accountFilter === "all" || it.connectionId === accountFilter)).length ?? 0;
  const syncableCount = (connections ?? []).length;
  const filtersActive = accountFilter !== "all" || readFilter !== "all" || replyState !== "all" || Boolean(contentFilter) || query.trim() !== "" || sort !== "recent";

  function resetFilters() {
    setAccountFilter("all");
    setReadFilter("all");
    setReplyState("all");
    setContentFilter(null);
    setQuery("");
    setSort("recent");
  }

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

  // Réponse envoyée depuis Nebula : commentaire lu et « Vous avez répondu ».
  function onReplied(id: string, repliedAt: string) {
    setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, read: true, ownerRepliedAt: it.ownerRepliedAt ?? repliedAt } : it)) : prev));
  }

  // J'aime du compte (Facebook, Bluesky) : affiché tout de suite, annulé si le réseau refuse.
  async function toggleLike(it: CommentRow) {
    const like = !it.ownerLikedAt;
    const label = NETWORK_META[it.network]?.label ?? it.network;
    setItems((prev) => (prev ? prev.map((x) => (x.id === it.id ? { ...x, ownerLikedAt: like ? new Date().toISOString() : null, read: true } : x)) : prev));
    const res = await fetch(`/api/engagement/${it.id}/like`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ like }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setItems((prev) => (prev ? prev.map((x) => (x.id === it.id ? { ...x, ownerLikedAt: it.ownerLikedAt ?? null } : x)) : prev));
      toast.error(data?.error ?? `${label} n'a pas pris en compte le j'aime : réessayez.`);
    }
  }

  // Suppression (Instagram, Facebook) : confirmée, définitive sur le réseau.
  async function remove(it: CommentRow) {
    const label = NETWORK_META[it.network]?.label ?? it.network;
    const ok = await confirm({
      title: `Supprimer ce commentaire sur ${label} ?`,
      message: `Le commentaire de ${it.authorName || "cette personne"} sera effacé de ${label} pour tout le monde, définitivement. La personne n'est pas prévenue.`,
      confirmLabel: "Supprimer",
      danger: true
    });
    if (!ok) return;
    const res = await fetch(`/api/engagement/${it.id}`, { method: "DELETE" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      toast.error(data?.error ?? `Suppression impossible pour le moment : réessayez, ou supprimez-le sur ${label}.`);
      return;
    }
    setItems((prev) => (prev ? prev.filter((x) => x.id !== it.id) : prev));
    toast.success(`Commentaire supprimé de ${label}.`);
  }

  const loading = connections === null || items === null;

  if (!loading && connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader icon={<IconMessage className="h-5 w-5" />} title="Interactions" description="Modérez les commentaires reçus sur vos publications, tous comptes confondus." />
        {tabs}
        <EmptyState
          icon={<IconMessage className="h-5 w-5" />}
          title={hasAccounts ? "Aucun compte avec commentaires" : "Aucun compte connecté"}
          description={`Connectez un compte ${networksSentence(commentNetworks(), "ou")} pour voir ici les commentaires reçus et y répondre.`}
          action={<ButtonLink href="/accounts">Connecter un compte</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<IconMessage className="h-5 w-5" />}
        title="Interactions"
        description={
          <>
            Les commentaires reçus sur vos publications, tous comptes confondus : lisez-les et répondez directement d&apos;ici, la réponse
            part sur le réseau au nom du compte. Les chiffres (likes, partages) sont dans l&apos;onglet <span className="text-slate-300">Engagement</span>.
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
      {tabs}

      {/* Tri et filtres sur une ligne, comme YouTube Studio. */}
      {!loading && (
        <div className="grid grid-cols-2 gap-2 border-b border-[color:var(--nb-sep)] pb-3 lg:flex lg:flex-wrap lg:items-center" role="group" aria-label="Trier et filtrer les commentaires" data-testid="comments-filters">
          <span className="hidden text-slate-400 lg:block" aria-hidden="true">
            <IconFilterLines className="h-5 w-5" />
          </span>
          {postFilter && (
            <FilterChip active onClick={() => router.replace("/interactions")} className="col-span-2 justify-self-start">
              <span className="max-w-[220px] truncate">Publication : « {postFilter.title} »</span>
              <span aria-hidden="true">✕</span>
              <span className="sr-only">Retirer le filtre de publication</span>
            </FilterChip>
          )}
          {contentFilter && (
            <FilterChip active onClick={() => setContentFilter(null)} className="col-span-2 justify-self-start">
              <span className="max-w-[220px] truncate">Contenu : « {contentFilter.title} »</span>
              <span aria-hidden="true">✕</span>
              <span className="sr-only">Retirer le filtre de contenu</span>
            </FilterChip>
          )}
          <Select aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value as Sort)} wrapperClassName="lg:w-44">
            <option value="recent">Les plus récents</option>
            <option value="oldest">Les plus anciens</option>
          </Select>
          <Select aria-label="Filtrer par compte" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} wrapperClassName="lg:w-52">
            <option value="all">Tous les comptes</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {NETWORK_META[c.network].label} · {c.displayName}
              </option>
            ))}
          </Select>
          <Select aria-label="État de la réponse" value={replyState} onChange={(e) => setReplyState(e.target.value as ReplyState)} wrapperClassName="lg:w-52">
            <option value="all">Réponse : tous</option>
            <option value="unanswered">Sans réponse</option>
            <option value="answered">Avec réponse</option>
          </Select>
          <Select aria-label="Filtrer par lecture" value={readFilter} onChange={(e) => setReadFilter(e.target.value as ReadFilter)} wrapperClassName="lg:w-40">
            <option value="all">Lus et non lus</option>
            <option value="unread">Non lus{unreadCount > 0 ? ` (${unreadCount})` : ""}</option>
          </Select>
          <div className="relative col-span-2 lg:ml-auto lg:w-64">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input aria-label="Rechercher dans les commentaires" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-full text-xs text-slate-300 transition hover:bg-white/[0.08] hover:text-white lg:w-9 lg:gap-0"
              title="Effacer les filtres"
              aria-label="Effacer les filtres"
            >
              <IconClose className="h-4 w-4" />
              <span className="lg:sr-only">Effacer les filtres</span>
            </button>
          )}
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

      {!loading && items.length > 0 && filtered.length > 0 && unreadCount === 0 && readFilter === "all" && !filtersActive && (
        <p className="text-sm text-emerald-300">📭 Tout est traité, pour l&apos;instant.</p>
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
              : postFilter
                ? "Aucun commentaire synchronisé pour cette publication — cliquez sur « Actualiser » pour aller chercher les derniers."
                : "Aucun commentaire avec ces filtres."}
          </p>
          {filtersActive && (
            <button type="button" onClick={resetFilters} className="mt-2 text-sm text-aurora-300 hover:text-white">
              Effacer les filtres
            </button>
          )}
        </GlassCard>
      ) : (
        <div role="table" aria-label="Commentaires reçus" data-testid="comments-table">
          <div role="rowgroup" className="hidden lg:block">
            <div role="row" className="grid grid-cols-[minmax(0,1fr)_300px] gap-6 border-b border-[color:var(--nb-sep)] pb-2.5 text-xs font-medium text-slate-400">
              <span role="columnheader">Commentaire</span>
              <span role="columnheader">Contenu</span>
            </div>
          </div>
          <ul role="rowgroup" className="divide-y divide-[color:var(--nb-sep)]">
            {filtered.map((it) => (
              <CommentRowView
                key={it.id}
                item={it}
                connection={connectionById.get(it.connectionId)}
                aiEnabled={assistant.enabled}
                onRead={markRead}
                onReplied={onReplied}
                onLike={toggleLike}
                onDelete={remove}
                onPickContent={(title) => setContentFilter({ key: contentKey(it), title })}
              />
            ))}
          </ul>
          <p className="pt-3 text-center text-xs text-slate-500">
            {filtered.length.toLocaleString("fr-FR")} commentaire{filtered.length > 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function RowMenu({ item, connection, onDelete, onRead }: { item: CommentRow; connection?: ConnectionInfo; onDelete: () => void; onRead: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const label = NETWORK_META[item.network]?.label ?? item.network;
  const link = item.permalink || item.postPermalink;
  const canRemove = Boolean(connection?.actions?.remove);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Plus d'actions"
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
      >
        <IconDots className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="nb-popover glass-panel-solid absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border py-1 shadow-2xl">
          {link && (
            <a role="menuitem" href={link} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="nb-menu-item flex items-center gap-2 px-3 py-2 text-sm text-slate-200">
              Ouvrir sur {label} ↗
            </a>
          )}
          {!item.read && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onRead();
              }}
              className="nb-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200"
            >
              Marquer comme lu
            </button>
          )}
          {canRemove ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="nb-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300"
              data-testid="comment-delete"
            >
              <IconTrash className="h-4 w-4" /> Supprimer
            </button>
          ) : (
            <p className="px-3 py-2 text-xs text-slate-500">
              {item.network === "INSTAGRAM" || item.network === "FACEBOOK"
                ? "Votre rôle sur cette marque ne permet pas de supprimer un commentaire."
                : `${label} ne permet pas aux applications de supprimer un commentaire : faites-le sur ${label}.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CommentRowView({
  item,
  connection,
  aiEnabled,
  onRead,
  onReplied,
  onLike,
  onDelete,
  onPickContent
}: {
  item: CommentRow;
  connection?: ConnectionInfo;
  aiEnabled: boolean;
  onRead: (id: string) => void;
  onReplied: (id: string, repliedAt: string) => void;
  onLike: (item: CommentRow) => void;
  onDelete: (item: CommentRow) => void;
  onPickContent: (title: string) => void;
}) {
  const networkLabel = NETWORK_META[item.network]?.label ?? item.network;
  const toast = useToast();
  // Champ de réponse : fermé, ouvert vide, ou ouvert avec une proposition de l'IA.
  const [replying, setReplying] = useState<null | "write" | "suggest">(null);
  const [sentText, setSentText] = useState<string | null>(null);
  const support: CommentReplySupport = connection?.reply ?? { mode: "manual", how: "Répondez directement sur le réseau." };
  const viaApi = support.mode === "api";
  const link = item.permalink || item.postPermalink;
  const actions = connection?.actions;
  const liked = Boolean(item.ownerLikedAt);
  const contentTitle = item.postTitle || "Publication";
  const openReply = (mode: "write" | "suggest") => {
    if (!item.read) onRead(item.id);
    setReplying(mode);
  };

  const content = (
    <button
      type="button"
      onClick={() => onPickContent(contentTitle)}
      className="group flex w-full items-start gap-3 text-left"
      title="Voir seulement les commentaires de ce contenu"
      data-testid="comment-content"
    >
      <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-white/[0.06] lg:w-[120px]">
        <RemoteImage
          src={item.postThumbnailUrl ?? ""}
          className="h-full w-full transition group-hover:opacity-90"
          sizes="120px"
          fallback={
            <span className="flex h-full w-full items-center justify-center">
              <NetworkLogo network={item.network} className="h-6 w-6 opacity-70" />
            </span>
          }
        />
        <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/60" aria-hidden="true">
          <NetworkLogo network={item.network} className="h-3 w-3" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] text-slate-200 group-hover:text-white">{contentTitle}</span>
        {connection && <span className="mt-0.5 block truncate text-[11px] text-slate-500">{connection.displayName}</span>}
      </span>
    </button>
  );

  return (
    <li
      role="row"
      className={clsx("grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6", !item.read && "bg-aurora-400/[0.035]")}
      onClick={() => !item.read && onRead(item.id)}
      data-testid="comment-row"
    >
      <div role="cell" className="flex min-w-0 items-start gap-3">
        {item.authorAvatarUrl ? (
          <RemoteImage src={item.authorAvatarUrl} className="h-10 w-10 shrink-0 rounded-full" sizes="40px" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-400">
            <IconAvatar className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="truncate font-medium text-slate-200">{item.authorName || "Utilisateur"}</span>
            {item.publishedAt && (
              <span className="text-slate-500" title={new Date(item.publishedAt).toLocaleString("fr-FR")}>
                · {relativeDate(item.publishedAt)}
              </span>
            )}
            {!item.read && <span role="img" className="h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-400" aria-label="Non lu" />}
          </p>
          {item.text && <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-slate-100">{item.text}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {replying === null && (viaApi || aiEnabled) && (
              <button type="button" onClick={() => openReply("write")} className="h-8 rounded-full bg-white/[0.08] px-3.5 text-xs font-semibold text-white transition hover:bg-white/[0.14]">
                {viaApi ? "Répondre" : "Préparer une réponse"}
              </button>
            )}
            {!viaApi && link && (
              <a href={link} target="_blank" rel="noreferrer" className="h-8 rounded-full px-3 text-xs leading-8 text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                Répondre sur {networkLabel} ↗
              </a>
            )}
            {item.ownerRepliedAt && (
              <span className="inline-flex items-center rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300" title="Réponse de votre compte, envoyée depuis Nebula ou repérée à la dernière actualisation">
                Vous avez répondu
              </span>
            )}
            <button
              type="button"
              onClick={() => actions?.like && onLike(item)}
              disabled={!actions?.like}
              aria-pressed={liked}
              aria-label={liked ? "Retirer le j'aime" : "J'aime"}
              title={actions?.like ? (liked ? "Retirer le j'aime de votre compte" : "Mettre un j'aime au nom de votre compte") : (actions?.likeHow ?? undefined)}
              data-testid="comment-like"
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-full transition",
                actions?.like ? "hover:bg-white/[0.08]" : "cursor-not-allowed opacity-35",
                liked ? "text-aurora-300" : "text-slate-300"
              )}
            >
              <IconThumbUp className={clsx("h-[18px] w-[18px]", liked && "fill-current")} />
            </button>
            {replying === null && aiEnabled && item.text && (
              <button
                type="button"
                onClick={() => openReply("suggest")}
                className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                title="L'IA prépare une réponse dans le champ ; vous la relisez avant de l'envoyer"
              >
                <AiIcon className="h-3.5 w-3.5" /> Proposer une réponse
              </button>
            )}
            <RowMenu item={item} connection={connection} onDelete={() => onDelete(item)} onRead={() => onRead(item.id)} />
          </div>

          {sentText && (
            <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2">
              <p className="text-[11px] font-medium text-emerald-300">Votre réponse, publiée sur {networkLabel}</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-slate-200">{sentText}</p>
            </div>
          )}
          {replying && (
            <div onClick={(e) => e.stopPropagation()}>
              <CommentReplyBox
                item={item}
                support={support}
                aiEnabled={aiEnabled}
                suggestOnOpen={replying === "suggest"}
                onClose={() => setReplying(null)}
                onSent={({ repliedAt, text }) => {
                  setReplying(null);
                  setSentText(text);
                  onReplied(item.id, repliedAt);
                  toast.success(`Réponse publiée sur ${networkLabel}.`);
                }}
              />
            </div>
          )}
          {/* Téléphone : le contenu sous le commentaire. */}
          <div className="mt-3 lg:hidden" onClick={(e) => e.stopPropagation()}>
            {content}
          </div>
        </div>
      </div>
      <div role="cell" className="hidden lg:block" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </li>
  );
}
