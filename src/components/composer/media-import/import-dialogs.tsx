"use client";

// Fenêtres de choix intégrées à Nebula pour Unsplash, Canva et OneDrive
// (lot 3, 25/09/2026). Google Drive et Dropbox ouvrent leur propre
// sélecteur (voir browser-pickers.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { UploadedAssetResult } from "@/lib/upload-client";

export interface UnsplashCredit {
  name: string;
  profileUrl: string;
  photoUrl: string;
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-aurora-300", className)} aria-hidden="true" />;
}

function ImportingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-void-950/80 backdrop-blur-sm" aria-live="polite">
      <Spinner className="h-7 w-7" />
      <p className="text-sm text-aurora-200">{label}</p>
    </div>
  );
}

function SearchField({ value, onChange, placeholder, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; onSubmit?: () => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-aurora-400/60"
        autoFocus
      />
    </form>
  );
}

// --- Unsplash -----------------------------------------------------------------

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string | null;
  alt: string;
  thumbUrl: string;
  smallUrl: string;
  photoUrl: string;
  author: { name: string; profileUrl: string };
}

const ORIENTATIONS: { id: "" | "portrait" | "landscape" | "squarish"; label: string }[] = [
  { id: "", label: "Toutes" },
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Paysage" },
  { id: "squarish", label: "Carré" }
];

const SUGGESTIONS = ["bureau", "nature", "café", "ville la nuit", "sport", "cuisine"];

export function UnsplashDialog({
  open,
  onClose,
  brandId,
  onImported
}: {
  open: boolean;
  onClose: () => void;
  brandId: string;
  onImported: (asset: UploadedAssetResult, credit: UnsplashCredit | null, creditInCaption: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [orientation, setOrientation] = useState<(typeof ORIENTATIONS)[number]["id"]>("");
  const [photos, setPhotos] = useState<UnsplashPhoto[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [creditInCaption, setCreditInCaption] = useState(true);
  const [unsplashUrl, setUnsplashUrl] = useState("https://unsplash.com/?utm_source=nebula&utm_medium=referral");
  const lastSearch = useRef("");

  const search = useCallback(
    async (q: string, p: number, o: string) => {
      if (q.trim().length < 2) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: q.trim(), page: String(p) });
        if (o) params.set("orientation", o);
        const res = await fetch(`/api/media/unsplash/search?${params.toString()}`, { cache: "no-store" });
        const data = await readJson<{ photos: UnsplashPhoto[]; totalPages: number; unsplashUrl?: string }>(res);
        if (!res.ok) throw new Error(data.error || "Recherche impossible.");
        setPhotos((prev) => (p > 1 && prev ? [...prev, ...data.photos] : data.photos));
        setTotalPages(data.totalPages);
        setPage(p);
        if (data.unsplashUrl) setUnsplashUrl(data.unsplashUrl);
        lastSearch.current = q.trim();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Recherche automatique après une courte pause de frappe.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (query.trim().length >= 2 && query.trim() !== lastSearch.current) search(query, 1, orientation);
    }, 450);
    return () => window.clearTimeout(t);
  }, [query, orientation, open, search]);

  async function pick(photo: UnsplashPhoto) {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "unsplash", brandId, photoId: photo.id })
      });
      const data = await readJson<{ asset: UploadedAssetResult; credit: UnsplashCredit }>(res);
      if (!res.ok || !data.asset) throw new Error(data.error || "Import impossible.");
      onImported(data.asset, data.credit ?? null, creditInCaption);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Photos libres Unsplash" maxWidthClassName="max-w-3xl">
      <div className="relative space-y-3">
        {importing && <ImportingOverlay label="Import de la photo…" />}
        <SearchField value={query} onChange={setQuery} placeholder="Rechercher une photo (en français ou en anglais)…" onSubmit={() => search(query, 1, orientation)} />
        <div className="flex flex-wrap items-center gap-1.5">
          {ORIENTATIONS.map((o) => (
            <button
              key={o.id || "all"}
              type="button"
              onClick={() => {
                setOrientation(o.id);
                lastSearch.current = "";
              }}
              className={clsx(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition",
                orientation === o.id ? "border-aurora-400/50 bg-aurora-400/15 text-white" : "border-white/10 text-slate-400 hover:text-white"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="max-h-[55vh] min-h-[220px] overflow-y-auto pr-1">
          {photos === null ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-slate-400">Des millions de photos gratuites, utilisables sans frais sur vos réseaux.</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => setQuery(s)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-aurora-400/40 hover:text-white">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : photos.length === 0 && !loading ? (
            <p className="py-10 text-center text-sm text-slate-400">Aucune photo pour cette recherche. Essayez un autre mot.</p>
          ) : (
            <div className="columns-2 gap-2 sm:columns-3">
              {photos.map((p) => (
                <figure key={p.id} className="mb-2 break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="group relative block w-full overflow-hidden rounded-lg"
                    style={{ background: p.color ?? "#222", aspectRatio: `${p.width} / ${p.height}` }}
                    title="Utiliser cette photo"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.smallUrl} alt={p.alt} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                      Utiliser cette photo
                    </span>
                  </button>
                  <figcaption className="mt-1 truncate text-[11px] text-slate-500">
                    par{" "}
                    <a href={p.author.profileUrl} target="_blank" rel="noreferrer" className="text-slate-300 hover:underline">
                      {p.author.name}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {loading && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          )}
          {photos && photos.length > 0 && page < totalPages && !loading && (
            <div className="flex justify-center py-3">
              <Button variant="outline" onClick={() => search(lastSearch.current, page + 1, orientation)}>
                Plus de photos
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-xs text-slate-400">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={creditInCaption} onChange={(e) => setCreditInCaption(e.target.checked)} className="accent-aurora-400" />
            Créditer le photographe à la fin de la légende
          </label>
          <span>
            Photos fournies par{" "}
            <a href={unsplashUrl} target="_blank" rel="noreferrer" className="text-slate-200 hover:underline">
              Unsplash
            </a>
          </span>
        </div>
      </div>
    </Modal>
  );
}

// --- Connexion d'un outil (Canva, OneDrive) -------------------------------------

function ConnectPanel({ provider, label, text }: { provider: "canva" | "onedrive"; label: string; text: string }) {
  const returnTo = `/composer?import=${provider}`;
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="max-w-md text-sm text-slate-300">{text}</p>
      <a href={`/api/integrations/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`} className="rounded-lg bg-aurora-500 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
        Relier {label}
      </a>
      <p className="text-xs text-slate-500">Vous pourrez le délier à tout moment. Nebula ne lit que ce dont il a besoin pour importer vos fichiers.</p>
    </div>
  );
}

async function disconnect(provider: "canva" | "onedrive") {
  await fetch(`/api/integrations/${provider}`, { method: "DELETE" }).catch(() => undefined);
}

// --- Canva ----------------------------------------------------------------------

interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}

export function CanvaDialog({
  open,
  onClose,
  brandId,
  connected,
  onDisconnected,
  onImported
}: {
  open: boolean;
  onClose: () => void;
  brandId: string;
  connected: boolean;
  onDisconnected: () => void;
  onImported: (asset: UploadedAssetResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [designs, setDesigns] = useState<CanvaDesign[] | null>(null);
  const [continuation, setContinuation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [progress, setProgress] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const load = useCallback(async (q: string, cont?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (cont) params.set("continuation", cont);
      const res = await fetch(`/api/integrations/canva/designs?${params.toString()}`, { cache: "no-store" });
      const data = await readJson<{ designs: CanvaDesign[]; continuation: string | null }>(res);
      if (res.status === 401) {
        setNeedsReconnect(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Canva ne répond pas.");
      setDesigns((prev) => (cont && prev ? [...prev, ...data.designs] : data.designs));
      setContinuation(data.continuation);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !connected) return;
    const t = window.setTimeout(() => load(query), query ? 450 : 0);
    return () => window.clearTimeout(t);
  }, [open, connected, query, load]);

  async function pick(d: CanvaDesign) {
    setError(null);
    setProgress("Export en cours dans Canva…");
    try {
      const start = await fetch("/api/integrations/canva/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: d.id, kind, portrait: Boolean(d.width && d.height && d.height > d.width) })
      });
      const started = await readJson<{ jobId: string }>(start);
      if (!start.ok || !started.jobId) throw new Error(started.error || "Export impossible.");
      // L'export d'une vidéo peut prendre une à deux minutes.
      for (let i = 0; i < 90; i++) {
        const res = await fetch("/api/integrations/canva/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId, jobId: started.jobId, title: d.title, kind })
        });
        const data = await readJson<{ status: "pending" | "done"; asset?: UploadedAssetResult }>(res);
        if (!res.ok) throw new Error(data.error || "Import impossible.");
        if (data.status === "done" && data.asset) {
          onImported(data.asset);
          onClose();
          return;
        }
        setProgress(kind === "video" ? "Canva prépare la vidéo… (jusqu'à deux minutes)" : "Canva prépare l'image…");
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error("Canva met trop de temps : réessayez dans un instant.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importer depuis Canva" maxWidthClassName="max-w-3xl">
      <div className="relative space-y-3">
        {progress && <ImportingOverlay label={progress} />}
        {!connected || needsReconnect ? (
          <ConnectPanel
            provider="canva"
            label="Canva"
            text={needsReconnect ? "La connexion à Canva a expiré. Reliez de nouveau votre compte pour retrouver vos designs." : "Reliez votre compte Canva pour retrouver vos designs ici et les ajouter à votre publication en un clic."}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchField value={query} onChange={setQuery} placeholder="Rechercher un design…" />
              </div>
              <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-xs" role="group" aria-label="Format d'export">
                {(
                  [
                    ["image", "Image PNG"],
                    ["video", "Vidéo MP4"]
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className={clsx("rounded-md px-3 py-1.5 transition", kind === k ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}
            <div className="max-h-[55vh] min-h-[220px] overflow-y-auto pr-1">
              {designs && designs.length === 0 && !loading ? (
                <p className="py-10 text-center text-sm text-slate-400">{query ? "Aucun design ne correspond." : "Aucun design dans ce compte Canva pour l'instant."}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(designs ?? []).map((d) => (
                    <button key={d.id} type="button" onClick={() => pick(d)} className="group text-left" title={`Importer « ${d.title} »`}>
                      <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                        {d.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.thumbnailUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain transition group-hover:scale-[1.03]" />
                        ) : (
                          <span className="text-xs text-slate-500">Aperçu indisponible</span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-300">{d.title}</span>
                    </button>
                  ))}
                </div>
              )}
              {loading && (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              )}
              {continuation && !loading && (
                <div className="flex justify-center py-3">
                  <Button variant="outline" onClick={() => load(query, continuation)}>
                    Plus de designs
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-slate-500">
              <span>La première page du design est importée.</span>
              <button
                type="button"
                onClick={async () => {
                  await disconnect("canva");
                  onDisconnected();
                }}
                className="text-slate-400 hover:text-white"
              >
                Délier Canva
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// --- OneDrive ---------------------------------------------------------------------

interface OneDriveItem {
  id: string;
  name: string;
  kind: "folder" | "image" | "video";
  childCount?: number;
  thumbnailUrl: string | null;
}

export function OneDriveDialog({
  open,
  onClose,
  brandId,
  connected,
  onDisconnected,
  onImported
}: {
  open: boolean;
  onClose: () => void;
  brandId: string;
  connected: boolean;
  onDisconnected: () => void;
  onImported: (asset: UploadedAssetResult) => void;
}) {
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<OneDriveItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const folderId = path[path.length - 1]?.id;

  useEffect(() => {
    if (!open || !connected) return;
    let cancelled = false;
    const t = window.setTimeout(
      async () => {
        setLoading(true);
        setError(null);
        try {
          const params = new URLSearchParams();
          if (query.trim()) params.set("q", query.trim());
          else if (folderId) params.set("folderId", folderId);
          const res = await fetch(`/api/integrations/onedrive/items?${params.toString()}`, { cache: "no-store" });
          const data = await readJson<{ items: OneDriveItem[] }>(res);
          if (cancelled) return;
          if (res.status === 401) {
            setNeedsReconnect(true);
            return;
          }
          if (!res.ok) throw new Error(data.error || "OneDrive ne répond pas.");
          setItems(data.items);
        } catch (err) {
          if (!cancelled) setError((err as Error).message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      query ? 450 : 0
    );
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, connected, folderId, query]);

  async function pick(item: OneDriveItem) {
    if (item.kind === "folder") {
      setQuery("");
      setPath((p) => [...p, { id: item.id, name: item.name }]);
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "onedrive", brandId, itemId: item.id })
      });
      const data = await readJson<{ asset: UploadedAssetResult }>(res);
      if (!res.ok || !data.asset) throw new Error(data.error || "Import impossible.");
      onImported(data.asset);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importer depuis OneDrive" maxWidthClassName="max-w-3xl">
      <div className="relative space-y-3">
        {importing && <ImportingOverlay label="Import du fichier…" />}
        {!connected || needsReconnect ? (
          <ConnectPanel
            provider="onedrive"
            label="OneDrive"
            text={needsReconnect ? "La connexion à OneDrive a expiré. Reliez de nouveau votre compte." : "Reliez votre OneDrive pour parcourir vos dossiers et ajouter une image ou une vidéo à votre publication."}
          />
        ) : (
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Rechercher dans votre OneDrive…" />
            {!query && (
              <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-400" aria-label="Dossier">
                <button type="button" onClick={() => setPath([])} className={clsx("hover:text-white", path.length === 0 && "text-white")}>
                  Mon OneDrive
                </button>
                {path.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    <span aria-hidden="true">›</span>
                    <button type="button" onClick={() => setPath((prev) => prev.slice(0, i + 1))} className={clsx("hover:text-white", i === path.length - 1 && "text-white")}>
                      {p.name}
                    </button>
                  </span>
                ))}
              </nav>
            )}
            {error && <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}
            <div className="max-h-[55vh] min-h-[220px] overflow-y-auto pr-1">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : items && items.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">Aucune image ni vidéo ici.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {(items ?? []).map((it) => (
                    <button key={it.id} type="button" onClick={() => pick(it)} className="group text-left" title={it.kind === "folder" ? `Ouvrir « ${it.name} »` : `Importer « ${it.name} »`}>
                      <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                        {it.kind === "folder" ? (
                          <svg viewBox="0 0 24 24" className="h-10 w-10 text-aurora-300" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                            <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9.5Z" strokeLinejoin="round" />
                          </svg>
                        ) : it.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                        ) : (
                          <span className="text-xs text-slate-500">{it.kind === "video" ? "Vidéo" : "Image"}</span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-300">
                        {it.kind === "video" && "▶ "}
                        {it.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-white/[0.06] pt-3 text-xs">
              <button
                type="button"
                onClick={async () => {
                  await disconnect("onedrive");
                  onDisconnected();
                }}
                className="text-slate-400 hover:text-white"
              >
                Délier OneDrive
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
