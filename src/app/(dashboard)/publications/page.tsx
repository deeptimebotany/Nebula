"use client";

// Liste de toutes les publications de la marque active (Lot 3). Avant cette
// page, une publication envoyée « maintenant » ou en échec n'était plus
// visible nulle part une fois sa page quittée : le calendrier ne montre que
// ce qui a une date. Ici : filtres par statut, réseau et texte, tri du plus
// récent au plus ancien, accès direct à la fiche de chaque publication.
//
// Lot 5 : liste paginée par le serveur (50 par page, « Afficher plus »),
// filtres et compteurs calculés par la base — plus aucun plafond ni tout
// l'historique chargé dans le navigateur.
//
// 09/10/2026 (demande de Lucas) : tableau façon « Contenu » de YouTube
// Studio — publication (miniature, titre, texte, réseaux, format),
// visibilité, date (tri dans les deux sens), vues, commentaires, j'aime
// (additionnés sur les réseaux affichés, d'après les relevés de la page
// Engagements) — et filtre de format : Shorts et Reels, vidéos, posts,
// stories (src/lib/posts/post-kind.ts). Une ligne par publication.
//
// Puis (09/10/2026, demande de Lucas) : comme YouTube Studio, seul le titre
// (et la miniature) ouvre la fiche — souligné au survol — au lieu de toute la
// ligne ; au survol d'une ligne, la description laisse la place aux boutons
// Modifier / Détails, Statistiques, Commentaires, Voir sur le réseau,
// Supprimer et « ⋮ » (Dupliquer, fiche complète, autres réseaux). Sur
// téléphone, ces boutons restent visibles sous chaque carte.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { ImportSourceBadge } from "@/components/media-import/import-source-badge";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Input, Select } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { CsvImportDialog } from "@/components/posts/csv-import-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";
import { NetworkTile } from "@/components/ui/network-badge";
import { NETWORK_META, NETWORKS, commentNetworks, type Network } from "@/lib/types";
import { POST_KINDS, POST_KIND_FILTER_LABEL, POST_KIND_LABEL, type PostKind } from "@/lib/posts/post-kind";
import { IconAlert, IconCalendar, IconChart, IconClock, IconDots, IconLink, IconList, IconLock, IconMessage, IconPencilLine, IconPlus, IconSearch, IconUpload } from "@/components/dashboard/icons";
import { PostEditModal } from "@/components/dashboard/post-edit-modal";
import { DeletePostDialog, type DeletableTarget } from "@/components/posts/delete-post-dialog";
import { useToast } from "@/components/dashboard/toast";
import { clsx } from "@/lib/clsx";
import { refreshUsage } from "@/lib/data/hooks";

interface ApiPost {
  id: string;
  title: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: { mediaAsset: { url: string; type: "VIDEO" | "IMAGE"; thumbnailUrl?: string | null; importSource?: string | null; durationSeconds?: number | null } }[];
  targets: {
    network: Network;
    status: string;
    errorMessage?: string | null;
    publishedAt?: string | null;
    externalUrl?: string | null;
    kind: PostKind;
    privacy: "public" | "private" | "unlisted" | null;
    lockedPrivate: boolean;
    removed: boolean;
  }[];
  kinds: PostKind[];
  metrics: { views: number | null; likes: number | null; comments: number | null } | null;
}

type KindFilter = PostKind | "ALL";
type SortOrder = "desc" | "asc";

type StatusFilter = "ALL" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "DRAFT";


function postDate(post: ApiPost): Date {
  const published = post.targets.map((t) => t.publishedAt).filter(Boolean).sort().pop();
  return new Date(post.scheduledAt ?? published ?? post.createdAt);
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** « 0:50 », « 6:31 », « 1:02:05 ». */
function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

const formatCount = (n: number | null | undefined) => (typeof n === "number" ? n.toLocaleString("fr-FR") : "—");

// useSearchParams() (filtre initial ?status=FAILED depuis la Vue d'ensemble)
// impose un <Suspense> autour du composant qui l'appelle.
export default function PublicationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PublicationsPageInner />
    </Suspense>
  );
}

const STATUS_FILTERS: StatusFilter[] = ["ALL", "SCHEDULED", "PUBLISHED", "FAILED", "DRAFT"];

function PublicationsPageInner() {
  const { activeBrand, loading: brandLoading } = useBrand();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status")?.toUpperCase();
  const [posts, setPosts] = useState<ApiPost[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<StatusFilter, number>>({ ALL: 0, SCHEDULED: 0, PUBLISHED: 0, FAILED: 0, DRAFT: 0 });
  const [networksPresent, setNetworksPresent] = useState<Network[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>(STATUS_FILTERS.includes(initialStatus as StatusFilter) ? (initialStatus as StatusFilter) : "ALL");
  const [network, setNetwork] = useState<Network | "ALL">("ALL");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [query, setQuery] = useState("");
  // Recherche envoyée au serveur 300 ms après la dernière frappe.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);
  // Import CSV (brief growth, lot G6.a) : la modale, et un compteur qui
  // force le rechargement de la liste une fois les brouillons créés.
  const [importOpen, setImportOpen] = useState(searchParams.get("import") === "1");
  const [reloadKey, setReloadKey] = useState(0);
  // Seule la dernière requête lancée a le droit d'afficher son résultat.
  const requestSeq = useRef(0);
  // Boutons des lignes (09/10/2026) : fenêtre « Modifier » / « Statistiques »
  // (la même que dans le calendrier) et fenêtre de suppression.
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; tab: "stats" | "content" } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; targets: DeletableTarget[] } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // La fenêtre de suppression a besoin de ce que chaque réseau permet
  // (« Supprimer aussi sur … ») : lu sur la fiche de la publication.
  async function askDelete(id: string) {
    setRowBusy(id);
    const res = await fetch(`/api/posts/${id}`).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setRowBusy(null);
    if (!res || !res.ok || !data.post) {
      toast.error("Impossible d'ouvrir la suppression. Réessayez dans un instant.");
      return;
    }
    setDeleting({ id, targets: data.post.targets as DeletableTarget[] });
  }

  // Dupliquer : nouveau brouillon avec le même contenu, ouvert dans Publier.
  async function duplicate(id: string) {
    setRowBusy(id);
    const res = await fetch(`/api/posts/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate" }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setRowBusy(null);
    if (!res || !res.ok || !data.postId) {
      toast.error(typeof data.error === "string" ? data.error : "Impossible de dupliquer cette publication.");
      return;
    }
    router.push(`/composer?duplicate=${data.postId}`);
  }

  const rowActions: RowHandlers = {
    onEdit: (id, tab) => setEditing({ id, tab }),
    onDelete: askDelete,
    onDuplicate: duplicate,
    busyId: rowBusy
  };

  const pageUrl = useCallback(
    (brandId: string, cursor?: string) => {
      const params = new URLSearchParams({ brandId, paginate: "1", status });
      if (network !== "ALL") params.set("network", network);
      if (kind !== "ALL") params.set("kind", kind);
      if (order === "asc") params.set("order", "asc");
      if (search) params.set("q", search);
      if (cursor) params.set("cursor", cursor);
      return `/api/posts?${params.toString()}`;
    },
    [status, network, kind, order, search]
  );

  // Première page : à l'ouverture et à chaque changement de filtre.
  useEffect(() => {
    if (!activeBrand) return;
    const seq = ++requestSeq.current;
    setRefreshing(true);
    setError(null);
    fetch(pageUrl(activeBrand.id))
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Impossible de charger les publications.");
        return data as { posts: ApiPost[]; nextCursor: string | null; counts: Record<StatusFilter, number>; networks: Network[] };
      })
      .then((data) => {
        if (seq !== requestSeq.current) return;
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        setCounts(data.counts);
        setNetworksPresent(NETWORKS.filter((n) => data.networks.includes(n)));
      })
      .catch((e: Error) => {
        if (seq === requestSeq.current) setError(e.message);
      })
      .finally(() => {
        if (seq === requestSeq.current) setRefreshing(false);
      });
  }, [activeBrand, pageUrl, reloadKey]);

  // Changement de marque : on repart d'un écran de chargement.
  useEffect(() => {
    setPosts(null);
  }, [activeBrand?.id]);

  async function loadMore() {
    if (!activeBrand || !nextCursor || loadingMore) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const r = await fetch(pageUrl(activeBrand.id, nextCursor));
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Impossible de charger la suite.");
      if (seq !== requestSeq.current) return;
      setPosts((prev) => [...(prev ?? []), ...(data.posts as ApiPost[])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const filtersActive = status !== "ALL" || network !== "ALL" || kind !== "ALL" || search !== "";
  const shownTotal = counts[status];

  const count = (n: number) => <span className="rounded-full bg-white/[0.06] px-1.5 text-[11px] text-slate-400">{n}</span>;
  const tabs = [
    { value: "ALL" as const, label: "Toutes", badge: count(counts.ALL) },
    { value: "SCHEDULED" as const, label: "Programmées", badge: count(counts.SCHEDULED) },
    { value: "PUBLISHED" as const, label: "Publiées", badge: count(counts.PUBLISHED) },
    { value: "FAILED" as const, label: "En échec", badge: count(counts.FAILED) },
    { value: "DRAFT" as const, label: "Brouillons", badge: count(counts.DRAFT) }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publications"
        description={activeBrand ? `Tout ce qui a été créé pour ${activeBrand.name} : programmé, publié, en échec ou en brouillon.` : "Toutes vos publications, en un seul endroit."}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Accès direct au calendrier (et l'inverse depuis le calendrier). */}
            <ButtonLink href="/calendar" variant="outline" className="inline-flex items-center gap-2">
              <IconCalendar className="h-4 w-4" /> Calendrier
            </ButtonLink>
            <Button variant="outline" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2" disabled={!activeBrand}>
              <IconUpload className="h-4 w-4" /> Importer
            </Button>
            <ButtonLink href="/composer" className="inline-flex items-center gap-2">
              <IconPlus className="h-4 w-4" /> Nouvelle publication
            </ButtonLink>
          </div>
        }
      />

      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setStatus("DRAFT");
          setReloadKey((k) => k + 1);
          void refreshUsage();
        }}
      />

      {/* Onglets d'état sur une ligne, filtres sur la suivante (09/10/2026 : à
          côté des filtres de réseau, de format et de la recherche, les
          onglets étaient coupés). */}
      <div className="flex flex-col gap-3">
        <Tabs items={tabs} value={status} onChange={setStatus} aria-label="Filtrer par statut" />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Select aria-label="Filtrer par réseau" value={network} onChange={(e) => setNetwork(e.target.value as Network | "ALL")} wrapperClassName="sm:w-44">
            <option value="ALL">Tous les réseaux</option>
            {networksPresent.map((n) => (
              <option key={n} value={n}>
                {NETWORK_META[n].label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filtrer par format" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} wrapperClassName="sm:w-52">
            <option value="ALL">Tous les formats</option>
            {POST_KINDS.map((k) => (
              <option key={k} value={k}>
                {POST_KIND_FILTER_LABEL[k]}
              </option>
            ))}
          </Select>
          <div className="relative sm:ml-auto sm:w-72">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input aria-label="Rechercher dans les publications" placeholder="Rechercher un titre, une légende…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      {error ? (
        <GlassCard hover={false} className="border-red-400/30 bg-red-400/[0.06]">
          <p className="text-sm text-red-200">{error}</p>
        </GlassCard>
      ) : posts === null ? (
        brandLoading || activeBrand ? (
          <PublicationsSkeleton />
        ) : (
          <EmptyState icon={<IconList className="h-5 w-5" />} title="Aucune marque sélectionnée" description="Créez ou choisissez une marque depuis le menu pour voir ses publications." />
        )
      ) : posts.length === 0 && !filtersActive ? (
        <EmptyState
          icon={<IconList className="h-5 w-5" />}
          title="Aucune publication pour l'instant"
          description="Créez votre première publication : choisissez un média, une légende et les comptes cibles, puis publiez tout de suite ou programmez-la."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/composer" className="inline-flex items-center gap-2">
                <IconPlus className="h-4 w-4" /> Créer une publication
              </ButtonLink>
              <Button variant="outline" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2">
                <IconUpload className="h-4 w-4" /> Importer un CSV
              </Button>
            </div>
          }
        />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<IconSearch className="h-5 w-5" />}
          title="Rien ne correspond à ces filtres"
          description="Essayez un autre statut, un autre réseau, un autre format ou effacez la recherche."
        />
      ) : (
        <div className={clsx("space-y-3 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing || undefined}>
          {/* Tableau façon YouTube Studio (09/10/2026) : en-têtes de colonnes
              sur ordinateur, une carte par publication sur téléphone. */}
          <div role="table" aria-label="Liste des publications" className="border-y border-[color:var(--nb-sep)]">
            <div role="rowgroup" className="hidden lg:block">
              <div role="row" className={clsx(TABLE_GRID, "border-b border-[color:var(--nb-sep)] py-3 text-xs font-medium text-slate-400")}>
                <span role="columnheader">Publication</span>
                <span role="columnheader">Visibilité</span>
                <span role="columnheader" aria-sort={order === "desc" ? "descending" : "ascending"}>
                  <button
                    type="button"
                    onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
                    className="inline-flex items-center gap-1 font-semibold text-white transition hover:text-aurora-200"
                    title={order === "desc" ? "Plus récentes d'abord : cliquer pour les plus anciennes d'abord" : "Plus anciennes d'abord : cliquer pour les plus récentes d'abord"}
                  >
                    Date <SortArrow up={order === "asc"} />
                  </button>
                </span>
                <span role="columnheader" className="text-right">Vues</span>
                <span role="columnheader" className="text-right">Commentaires</span>
                <span role="columnheader" className="text-right">J&apos;aime</span>
              </div>
            </div>
            <ul role="rowgroup" className="divide-y divide-[color:var(--nb-sep)]">
              {posts.map((post) => (
                <PublicationRow key={post.id} post={post} actions={rowActions} />
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-xs text-slate-500">
              {posts.length.toLocaleString("fr-FR")} sur {Math.max(shownTotal, posts.length).toLocaleString("fr-FR")}
            </p>
            {nextCursor && (
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Chargement…" : "Afficher plus"}
              </Button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <PostEditModal
          postId={editing.id}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
      {deleting && (
        <DeletePostDialog
          postId={deleting.id}
          targets={deleting.targets}
          onClose={() => setDeleting(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
          onDeleted={(message) => {
            setDeleting(null);
            toast.success(message);
            setReloadKey((k) => k + 1);
            void refreshUsage();
          }}
        />
      )}
    </div>
  );
}

/** Colonnes du tableau (ordinateur). */
const TABLE_GRID = "grid grid-cols-[minmax(0,1fr)_160px_150px_80px_116px_80px] items-start gap-x-4 px-3";

function SortArrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={clsx("h-4 w-4 transition-transform", up && "rotate-180")} aria-hidden="true">
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" strokeLinejoin="round" />
    </svg>
  );
}

function IconDraft({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}

const YT_PRIVACY_LABEL = { public: "Publique", private: "Privée", unlisted: "Non répertoriée" } as const;

/** Colonne « Visibilité » : état de la publication, et confidentialité YouTube une fois en ligne. */
function visibilityOf(post: ApiPost): { icon: JSX.Element; label: string; tone: string; note?: string } {
  const icon = "h-5 w-5 shrink-0";
  switch (post.status) {
    case "DRAFT":
      return { icon: <IconDraft className={icon} />, label: "Brouillon", tone: "text-slate-200" };
    case "SCHEDULED":
      return { icon: <IconClock className={icon} />, label: "Programmée", tone: "text-aurora-200" };
    case "PUBLISHING":
      return { icon: <IconClock className={icon} />, label: "En cours", tone: "text-aurora-200" };
    case "FAILED":
      return { icon: <IconAlert className={icon} />, label: "Échec", tone: "text-red-300" };
  }
  const youtube = post.targets.find((t) => t.network === "YOUTUBE" && t.status === "PUBLISHED");
  const ytPrivacy = youtube ? (youtube.lockedPrivate ? "private" : (youtube.privacy ?? "public")) : null;
  // Tant que YouTube n'a pas validé Nebula (audit), toute vidéo envoyée par l'API arrive en « Privée ».
  const note = youtube && ytPrivacy !== "public" ? `YouTube : ${YT_PRIVACY_LABEL[ytPrivacy ?? "private"].toLowerCase()}${youtube.lockedPrivate ? " (validation en cours)" : ""}` : undefined;
  const onlyYoutube = post.targets.every((t) => t.network === "YOUTUBE");
  if (post.status === "PARTIAL") return { icon: <IconAlert className={icon} />, label: "Partielle", tone: "text-amber-200", note: note ?? "Un réseau a échoué" };
  if (onlyYoutube && ytPrivacy && ytPrivacy !== "public") {
    return {
      icon: ytPrivacy === "unlisted" ? <IconLink className={icon} /> : <IconLock className={icon} />,
      label: YT_PRIVACY_LABEL[ytPrivacy],
      tone: "text-slate-200",
      note: youtube?.lockedPrivate ? "Validation de YouTube en cours" : undefined
    };
  }
  return { icon: <IconGlobe className={icon} />, label: "Publique", tone: "text-slate-200", note };
}

/** Colonne « Date » : la date qui compte selon l'état, et ce qu'elle désigne. */
function dateOf(post: ApiPost): { day: string; detail: string; time?: string } {
  if (post.status === "DRAFT") return { day: formatDay(new Date(post.updatedAt)), detail: "Modifié" };
  const d = postDate(post);
  if (post.status === "SCHEDULED" || post.status === "PUBLISHING") return { day: formatDay(d), detail: `Programmée à ${formatTime(d)}`, time: formatTime(d) };
  if (post.status === "FAILED") return { day: formatDay(d), detail: "Non publiée" };
  return { day: formatDay(d), detail: "Publiée" };
}

interface RowHandlers {
  onEdit: (id: string, tab: "stats" | "content") => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  busyId: string | null;
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

function IconExternal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

/**
 * Boutons d'une publication, comme sous un titre de YouTube Studio :
 * Modifier (pas encore envoyée) ou Détails (déjà envoyée), Statistiques et
 * Commentaires (en ligne), Voir sur le réseau, Supprimer, puis « ⋮ ».
 */
function RowActions({ post, actions, onMenu }: { post: ApiPost; actions: RowHandlers; onMenu?: (open: boolean) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const live = post.status === "PUBLISHED" || post.status === "PARTIAL";
  const sent = post.status !== "DRAFT" && post.status !== "SCHEDULED";
  const busy = actions.busyId === post.id;
  const links = post.targets.filter((t, i, all) => t.externalUrl && !t.removed && all.findIndex((o) => o.network === t.network && o.externalUrl) === i);
  const readsComments = commentNetworks(NETWORKS).some((n) => post.targets.some((t) => t.network === n && t.status === "PUBLISHED"));
  const label = (n: Network) => NETWORK_META[n]?.label ?? n;

  function setMenu(open: boolean) {
    setMenuOpen(open);
    onMenu?.(open);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  const btn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-aurora-400/60 disabled:opacity-50";
  const icon = "h-5 w-5 [stroke-width:1.9]";

  return (
    <div className="flex items-center gap-1" data-testid="publication-actions">
      <button type="button" className={btn} onClick={() => actions.onEdit(post.id, "content")} title={sent ? "Détails" : "Modifier"} aria-label={sent ? "Détails" : "Modifier"}>
        <IconPencilLine className={icon} />
      </button>
      {live && (
        <button type="button" className={btn} onClick={() => actions.onEdit(post.id, "stats")} title="Statistiques" aria-label="Statistiques">
          <IconChart className={icon} />
        </button>
      )}
      {readsComments && (
        <Link href={`/interactions?post=${post.id}`} className={btn} title="Commentaires" aria-label="Commentaires">
          <IconMessage className={icon} />
        </Link>
      )}
      {links[0]?.externalUrl && (
        <a href={links[0].externalUrl} target="_blank" rel="noopener noreferrer" className={btn} title={`Voir sur ${label(links[0].network)}`} aria-label={`Voir sur ${label(links[0].network)}`}>
          <IconExternal className={icon} />
        </a>
      )}
      <button type="button" className={btn} onClick={() => actions.onDelete(post.id)} disabled={busy} title="Supprimer" aria-label="Supprimer">
        <IconTrash className={icon} />
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className={btn}
          onClick={() => setMenu(!menuOpen)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Plus d'options"
          aria-label="Plus d'options"
        >
          <IconDots className="h-5 w-5 rotate-90" />
        </button>
        {menuOpen && (
          <div role="menu" className="nb-popover absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border bg-[color:var(--nb-elevated)] p-1 shadow-2xl">
            <Link role="menuitem" href={`/posts/${post.id}`} className="nb-menu-item flex w-full items-center rounded-lg px-3 py-2 text-sm text-slate-200">
              Fiche complète
            </Link>
            <button
              role="menuitem"
              type="button"
              disabled={busy}
              onClick={() => {
                setMenu(false);
                actions.onDuplicate(post.id);
              }}
              className="nb-menu-item flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-200"
            >
              Dupliquer
            </button>
            {links.map((t) => (
              <a
                key={t.network}
                role="menuitem"
                href={t.externalUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="nb-menu-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200"
              >
                <NetworkTile network={t.network} size={16} />
                Voir sur {label(t.network)}
              </a>
            ))}
            <button
              role="menuitem"
              type="button"
              disabled={busy}
              onClick={() => {
                setMenu(false);
                actions.onDelete(post.id);
              }}
              className="nb-menu-item flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-red-300"
            >
              Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PublicationRow({ post, actions }: { post: ApiPost; actions: RowHandlers }) {
  // Menu « ⋮ » ouvert : les boutons restent affichés même si la souris quitte la ligne.
  const [pinned, setPinned] = useState(false);
  const first = post.media[0]?.mediaAsset;
  const thumb = first && first.type === "IMAGE" ? first.url : first?.thumbnailUrl ?? null;
  const networks = Array.from(new Set(post.targets.map((t) => t.network)));
  const failedTargets = post.targets.filter((t) => t.status === "FAILED");
  const title = post.title.trim() || post.caption.trim().split("\n")[0] || "(sans titre)";
  const description = post.title.trim() ? post.caption.trim() : post.caption.trim().split("\n").slice(1).join(" ");
  const visibility = visibilityOf(post);
  const date = dateOf(post);
  const live = post.status === "PUBLISHED" || post.status === "PARTIAL";
  const metric = (n: number | null | undefined) => (live ? formatCount(n) : "—");

  const thumbnail = (
    <Link href={`/posts/${post.id}`} tabIndex={-1} aria-hidden="true" className="relative block aspect-video w-[120px] shrink-0 overflow-hidden rounded-lg bg-white/[0.04] sm:w-[136px]">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <RemoteImage src={thumb} className="h-full w-full" sizes="136px" />
      ) : first?.type === "VIDEO" ? (
        // Pas de miniature enregistrée : aperçu à 0,5 s par le navigateur (#t=0.5).
        <video src={`${first.url}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] font-medium uppercase tracking-wider text-slate-500">Texte</span>
      )}
      {first?.type === "VIDEO" && typeof first.durationSeconds === "number" && first.durationSeconds > 0 && (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-px text-[11px] font-medium tabular-nums text-white">{formatDuration(first.durationSeconds)}</span>
      )}
    </Link>
  );

  const content = (
    <div className="flex min-w-0 gap-3">
      {thumbnail}
      <div className="min-w-0 flex-1">
        {/* Seul le titre ouvre la fiche, souligné au survol (comme YouTube Studio). */}
        <Link
          href={`/posts/${post.id}`}
          className="block truncate text-sm font-medium text-white underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {title}
        </Link>
        {/* Ordinateur : au survol de la ligne, la description laisse la place aux boutons. */}
        {description && (
          <p className={clsx("mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-400", pinned ? "lg:hidden" : "lg:group-focus-within/row:hidden lg:group-hover/row:hidden")}>{description}</p>
        )}
        <div className={clsx("-ml-2 mt-0.5", pinned ? "hidden lg:block" : "hidden lg:group-focus-within/row:block lg:group-hover/row:block")}>
          <RowActions post={post} actions={actions} onMenu={setPinned} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
          {networks.length > 0 && (
            <span className="flex items-center gap-1" aria-label={`Réseaux : ${networks.map((n) => NETWORK_META[n]?.label ?? n).join(", ")}`}>
              {networks.map((n) => (
                <span key={n} title={NETWORK_META[n]?.label ?? n}>
                  <NetworkTile network={n} size={18} />
                </span>
              ))}
            </span>
          )}
          {post.kinds.length > 0 && <span className="rounded-full bg-white/[0.06] px-2 py-px text-[11px] text-slate-300">{post.kinds.map((k) => POST_KIND_LABEL[k]).join(" · ")}</span>}
          <ImportSourceBadge source={first?.importSource} type={first?.type} variant="inline" />
          {failedTargets.length > 0 && (
            <span className="truncate text-red-300" title={failedTargets[0].errorMessage ?? undefined}>
              {failedTargets.length === 1 ? "1 compte en échec" : `${failedTargets.length} comptes en échec`}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const visibilityCell = (
    <div className={clsx("flex items-start gap-2 text-sm", visibility.tone)}>
      {visibility.icon}
      <span className="min-w-0">
        <span className="block">{visibility.label}</span>
        {visibility.note && <span className="mt-0.5 block text-xs text-slate-500">{visibility.note}</span>}
      </span>
    </div>
  );

  return (
    <li role="row">
      <div className="group/row rounded-xl py-3 transition hover:bg-[color:var(--nb-hover)]">
        {/* Ordinateur : colonnes alignées sur les en-têtes. */}
        <div className={clsx(TABLE_GRID, "hidden lg:grid")}>
          <div role="cell">{content}</div>
          <div role="cell">{visibilityCell}</div>
          <div role="cell" className="text-sm">
            <span className="block text-slate-200">{date.day}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{date.detail}</span>
          </div>
          {post.status === "DRAFT" ? (
            <div role="cell" className="col-span-3 flex justify-end">
              <button
                type="button"
                onClick={() => actions.onEdit(post.id, "content")}
                className="rounded-full bg-white/[0.08] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.16]"
              >
                Modifier le brouillon
              </button>
            </div>
          ) : (
            <>
              <div role="cell" className="text-right text-sm tabular-nums text-slate-200">{metric(post.metrics?.views)}</div>
              <div role="cell" className="text-right text-sm tabular-nums text-slate-200">{metric(post.metrics?.comments)}</div>
              <div role="cell" className="text-right text-sm tabular-nums text-slate-200">{metric(post.metrics?.likes)}</div>
            </>
          )}
        </div>
        {/* Téléphone et tablette : une carte. */}
        <div className="space-y-2 px-1 lg:hidden">
          {content}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-400">
            <span className={clsx("inline-flex items-center gap-1.5", visibility.tone)}>
              {visibility.label}
              <span className="text-slate-500">
                · {date.day}
                {date.time ? ` à ${date.time}` : ""}
              </span>
            </span>
            {post.status !== "DRAFT" && live && (
              <span className="tabular-nums">
                {formatCount(post.metrics?.views)} vues · {formatCount(post.metrics?.comments)} comm. · {formatCount(post.metrics?.likes)} j&apos;aime
              </span>
            )}
          </div>
          {/* Téléphone : les boutons restent visibles (pas de survol au doigt). */}
          <div className="-ml-2">
            <RowActions post={post} actions={actions} />
          </div>
        </div>
      </div>
    </li>
  );
}

function PublicationsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-[color:var(--nb-sep)] py-3">
          <Skeleton className="aspect-video w-[136px] rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
      <span className="sr-only">Chargement des publications</span>
    </div>
  );
}
