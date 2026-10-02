"use client";

// Carte « mes chiffres » du media kit (02/10/2026) : une image à partager en
// story (1080 × 1920) ou en post (1080 × 1350), générée à partir des
// chiffres du kit (voir /api/media-kit/card). Téléchargement, ou partage
// direct depuis le téléphone quand le navigateur le permet.
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { clsx } from "@/lib/clsx";

type CardFormat = "story" | "post";
const FORMATS: { id: CardFormat; label: string; hint: string }[] = [
  { id: "story", label: "Story", hint: "1080 × 1920" },
  { id: "post", label: "Post", hint: "1080 × 1350" }
];

export function KitShareCardDialog({
  open,
  onClose,
  brandId,
  slug,
  published
}: {
  open: boolean;
  onClose: () => void;
  brandId: string;
  slug: string;
  published: boolean;
}) {
  const [format, setFormat] = useState<CardFormat>("story");
  const [src, setSrc] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let url: string | null = null;
    setError(null);
    setSrc(null);
    setBlob(null);
    fetch(`/api/media-kit/card?brandId=${encodeURIComponent(brandId)}&format=${format}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Carte indisponible pour le moment.");
        return res.blob();
      })
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setBlob(b);
        setSrc(url);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, brandId, format]);

  const filename = `carte-${slug}-${format}.png`;
  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;
  const canShare = Boolean(file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] }));

  return (
    <Modal open={open} onClose={onClose} title="Carte à partager" maxWidthClassName="max-w-md">
      <div className="space-y-3">
        <p className="-mt-2 text-xs text-slate-400">
          Vos chiffres du media kit en une image, à poster en story ou sur votre profil. Ils viennent des relevés de Nebula, avec leur date.
          {published ? " Le lien de votre kit figure sur la carte : n'importe qui peut vérifier." : " Publiez votre kit pour que son lien apparaisse sur la carte."}
        </p>
        <div className="flex gap-1.5" role="group" aria-label="Format de la carte">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={format === f.id}
              onClick={() => setFormat(f.id)}
              className={clsx(
                "flex-1 rounded-xl border px-3 py-2 text-sm transition",
                format === f.id ? "border-aurora-400/60 bg-aurora-400/10 text-white" : "border-white/10 text-slate-300 hover:text-white"
              )}
            >
              {f.label} <span className="text-xs text-slate-500">{f.hint}</span>
            </button>
          ))}
        </div>
        {error ? (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`Carte ${format === "story" ? "story" : "post"} : abonnés, vues sur 90 jours, engagement et publications par mois`}
            className={clsx("mx-auto rounded-2xl border border-white/10", format === "story" ? "max-h-[60vh] w-auto" : "w-full")}
          />
        ) : (
          <div className={clsx("mx-auto w-full animate-pulse rounded-2xl bg-white/[0.05]", format === "story" ? "aspect-[9/16] max-h-[60vh] max-w-[34vh]" : "aspect-[4/5]")} aria-busy="true">
            <span className="sr-only">Création de la carte</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href={src ?? "#"}
            download={filename}
            aria-disabled={!src}
            className={clsx(
              "flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-nebula-500 px-4 text-sm font-semibold text-white transition hover:bg-nebula-400",
              !src && "pointer-events-none opacity-60"
            )}
          >
            Télécharger l&apos;image
          </a>
          {canShare && file && (
            <button
              type="button"
              onClick={() => navigator.share({ files: [file], title: "Mes chiffres" }).catch(() => undefined)}
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
