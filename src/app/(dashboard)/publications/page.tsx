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
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Input, Select } from "@/components/ui/input";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { CsvImportDialog } from "@/components/posts/csv-import-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";
import { NetworkDot } from "@/components/ui/network-badge";
import { NETWORK_META, NETWORKS, type Network } from "@/lib/types";
import { IconCalendar, IconChevron, IconList, IconPlus, IconSearch, IconUpload } from "@/components/dashboard/icons";
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
  media: { mediaAsset: { url: string; type: "VIDEO" | "IMAGE"; thumbnailUrl?: string | null } }[];
  targets: { network: Network; status: string; errorMessage?: string | null; publishedAt?: string | null; externalUrl?: string | null }[];
}

type StatusFilter = "ALL" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "DRAFT";

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  SCHEDULED: { label: "Programmée", tone: "info" },
  PUBLISHING: { label: "Publication en cours", tone: "info" },
  PUBLISHED: { label: "Publiée", tone: "success" },
  FAILED: { label: "Échec", tone: "danger" },
  PARTIAL: { label: "Partiellement publiée", tone: "warning" }
};

function postDate(post: ApiPost): Date {
  const published = post.targets.map((t) => t.publishedAt).filter(Boolean).sort().pop();
  return new Date(post.scheduledAt ?? published ?? post.createdAt);
}

function formatDate(d: Date): string {
  return d.toLocaleString("fr-FR", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined, hour: "2-digit", minute: "2-digit" });
}

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

  const pageUrl = useCallback(
    (brandId: string, cursor?: string) => {
      const params = new URLSearchParams({ brandId, paginate: "1", status });
      if (network !== "ALL") params.set("network", network);
      if (search) params.set("q", search);
      if (cursor) params.set("cursor", cursor);
      return `/api/posts?${params.toString()}`;
    },
    [status, network, search]
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

  const filtersActive = status !== "ALL" || network !== "ALL" || search !== "";
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs items={tabs} value={status} onChange={setStatus} aria-label="Filtrer par statut" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select aria-label="Filtrer par réseau" value={network} onChange={(e) => setNetwork(e.target.value as Network | "ALL")} wrapperClassName="sm:w-44">
            <option value="ALL">Tous les réseaux</option>
            {networksPresent.map((n) => (
              <option key={n} value={n}>
                {NETWORK_META[n].label}
              </option>
            ))}
          </Select>
          <div className="relative sm:w-64">
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
          description="Essayez un autre statut, un autre réseau ou effacez la recherche."
        />
      ) : (
        <div className={clsx("space-y-3 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing || undefined}>
          <ul className="space-y-2" aria-label="Liste des publications">
            {posts.map((post) => (
              <PublicationRow key={post.id} post={post} />
            ))}
          </ul>
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
    </div>
  );
}

function PublicationRow({ post }: { post: ApiPost }) {
  const first = post.media[0]?.mediaAsset;
  const thumb = first && first.type === "IMAGE" ? first.url : first?.thumbnailUrl ?? null;
  const meta = STATUS_META[post.status] ?? { label: post.status, tone: "neutral" as BadgeTone };
  const networks = Array.from(new Set(post.targets.map((t) => t.network)));
  const failedTargets = post.targets.filter((t) => t.status === "FAILED");
  const date = postDate(post);
  const title = post.title.trim() || post.caption.trim().split("\n")[0] || "(sans titre)";

  return (
    <li>
      <Link
        href={`/posts/${post.id}`}
        className="group/row glass-panel glass-panel-hover flex items-center gap-4 rounded-2xl p-3 pr-3 transition focus-visible:border-aurora-400/60"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.04]">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <RemoteImage src={thumb} className="h-full w-full" sizes="56px" />
          ) : first?.type === "VIDEO" ? (
            // Pas de miniature enregistrée (l'IA n'en a pas généré ou l'utilisateur
            // n'en a pas choisi) : on affiche quand même un aperçu en demandant au
            // navigateur de se positionner à 0.5s via #t=0.5 dans l'URL — aucun
            // traitement serveur requis (ffmpeg n'est pas disponible sur Vercel),
            // fonctionne directement depuis le fichier vidéo déjà hébergé.
            <video src={`${first.url}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Texte</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-white">{title}</p>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span>{post.status === "PUBLISHED" ? "Publiée le" : post.status === "SCHEDULED" ? "Prévue le" : "Modifiée le"} {formatDate(post.status === "DRAFT" ? new Date(post.updatedAt) : date)}</span>
            {networks.length > 0 && (
              <span className="flex items-center gap-1" aria-label={`Réseaux : ${networks.map((n) => NETWORK_META[n].label).join(", ")}`}>
                {networks.map((n) => (
                  <NetworkDot key={n} network={n} />
                ))}
              </span>
            )}
            {failedTargets.length > 0 && (
              <span className={clsx("truncate text-red-300")} title={failedTargets[0].errorMessage ?? undefined}>
                {failedTargets.length === 1 ? "1 compte en échec" : `${failedTargets.length} comptes en échec`}
                {failedTargets[0].errorMessage ? ` — ${failedTargets[0].errorMessage}` : ""}
              </span>
            )}
          </p>
        </div>
        {/* Flèche « ouvrir » bien visible (24/09/2026) : pastille ronde qui
            s'allume au survol de la ligne, sur mobile aussi. */}
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition group-hover/row:border-aurora-400/50 group-hover/row:bg-aurora-500/15 group-hover/row:text-white"
        >
          <IconChevron className="h-4 w-4 -rotate-90" />
        </span>
      </Link>
    </li>
  );
}

function PublicationsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="glass-panel flex items-center gap-4 rounded-2xl p-3">
          <Skeleton className="h-14 w-14 rounded-xl" />
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
