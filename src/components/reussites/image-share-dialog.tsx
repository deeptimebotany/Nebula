"use client";

// Fenêtre « image à partager » (carte de créateur, lot B ; carte de record,
// Réussites v3) : l'image est générée pour le compte connecté, affichée,
// puis téléchargée ou partagée (partage natif du téléphone quand il existe).
// Aucune page publique n'est créée.
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { clsx } from "@/lib/clsx";

export function ImageShareDialog({
  open,
  onClose,
  url,
  title,
  intro,
  alt,
  filename,
  shareTitle
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  intro: string;
  alt: string;
  filename: string;
  shareTitle: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let objectUrl: string | null = null;
    setError(null);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Image indisponible pour le moment.");
        return res.blob();
      })
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setSrc(objectUrl);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setSrc(null);
      setBlob(null);
    };
  }, [open, url]);

  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;
  const canShare = Boolean(file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] }));

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClassName="max-w-md">
      <div className="space-y-3">
        <p className="-mt-2 text-xs text-slate-400">{intro}</p>
        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">{error}</p>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="w-full rounded-2xl border border-white/10" />
        ) : (
          <div className="aspect-[4/5] w-full animate-pulse rounded-2xl bg-white/[0.05]" aria-busy="true" />
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href={src ?? url}
            download={filename}
            className={clsx("flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-nebula-500 px-4 text-sm font-semibold text-white transition hover:bg-nebula-400", !src && "pointer-events-none opacity-60")}
          >
            Télécharger l&apos;image
          </a>
          {canShare && file && (
            <button
              type="button"
              onClick={() => navigator.share({ files: [file], title: shareTitle }).catch(() => undefined)}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
            >
              Partager
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
