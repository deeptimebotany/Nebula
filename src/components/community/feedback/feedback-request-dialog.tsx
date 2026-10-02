"use client";

// « Demander l'avis de la communauté » (02/10/2026) : 2 ou 3 miniatures ou
// titres à comparer, une question facultative, le réseau visé. Ouvert depuis
// l'onglet Avis de la Communauté, ou depuis Publier (titre et miniatures
// déjà remplis). Les images choisies sur l'ordinateur sont réduites dans le
// navigateur (1600 px au plus) avant l'envoi.
import { useEffect, useId, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { IconClose, IconUpload } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";
import { NETWORK_META, NETWORKS, type Network } from "@/lib/types";
import {
  FEEDBACK_CONTEXT_MAX,
  FEEDBACK_MAX_OPTIONS,
  FEEDBACK_MIN_OPTIONS,
  FEEDBACK_TITLE_MAX,
  optionLetter,
  type FeedbackKind,
  type FeedbackQuotaDTO
} from "@/lib/community/feedback-rules";

/** Une image : déjà dans Nebula (miniature de Publier) ou choisie sur l'ordinateur. */
type ImageSlot = { kind: "source"; url: string } | { kind: "file"; file: File; preview: string };

export interface FeedbackPrefill {
  kind?: FeedbackKind;
  titles?: string[];
  /** Miniatures déjà proposées dans Publier (adresses Nebula). */
  imageUrls?: string[];
  network?: Network | null;
}

/** Réduit une image à 1600 px de côté au plus, en JPEG. */
async function shrinkImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 2 * 1024 * 1024 && /jpe?g|png|webp/.test(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob ? new File([blob], "image.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function FeedbackRequestDialog({
  open,
  onClose,
  onCreated,
  prefill,
  quota
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  prefill?: FeedbackPrefill;
  /** Limite de la personne (affichée sous le bouton) ; chargée si absente. */
  quota?: FeedbackQuotaDTO | null;
}) {
  const formId = useId();
  const [kind, setKind] = useState<FeedbackKind>("THUMBNAIL");
  const [titles, setTitles] = useState<string[]>(["", "", ""]);
  const [images, setImages] = useState<(ImageSlot | null)[]>([null, null, null]);
  const [context, setContext] = useState("");
  const [network, setNetwork] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedQuota, setLoadedQuota] = useState<FeedbackQuotaDTO | null>(null);

  // Remise à zéro à chaque ouverture, avec ce que Publier a déjà.
  useEffect(() => {
    if (!open) return;
    const k = prefill?.kind ?? (prefill?.imageUrls?.length ? "THUMBNAIL" : prefill?.titles?.length ? "TITLE" : "THUMBNAIL");
    setKind(k);
    const t = (prefill?.titles ?? []).filter((x) => x.trim()).slice(0, FEEDBACK_MAX_OPTIONS);
    setTitles([...t, "", "", ""].slice(0, FEEDBACK_MAX_OPTIONS));
    const imgs: (ImageSlot | null)[] = (prefill?.imageUrls ?? []).slice(0, FEEDBACK_MAX_OPTIONS).map((url) => ({ kind: "source" as const, url }));
    setImages([...imgs, null, null, null].slice(0, FEEDBACK_MAX_OPTIONS));
    setContext("");
    setNetwork(prefill?.network ?? "");
    setError(null);
    if (!quota) {
      fetch("/api/community/feedback?scope=mine", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.quota && setLoadedQuota(d.quota))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Aperçus des fichiers choisis : libérés à la fermeture.
  useEffect(() => {
    return () => images.forEach((s) => s?.kind === "file" && URL.revokeObjectURL(s.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = quota ?? loadedQuota;
  const left = q ? Math.max(0, q.limit - q.used) : null;
  const filledTitles = titles.map((t) => t.trim()).filter(Boolean);
  const filledImages = images.filter((s): s is ImageSlot => Boolean(s));
  const ready = kind === "TITLE" ? filledTitles.length >= FEEDBACK_MIN_OPTIONS : filledImages.length >= FEEDBACK_MIN_OPTIONS;
  const duplicateTitles = kind === "TITLE" && new Set(filledTitles.map((t) => t.toLowerCase())).size !== filledTitles.length;

  async function pickFile(index: number, file: File | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const small = await shrinkImage(file);
    setImages((prev) => {
      const next = [...prev];
      const old = next[index];
      if (old?.kind === "file") URL.revokeObjectURL(old.preview);
      next[index] = { kind: "file", file: small, preview: URL.createObjectURL(small) };
      return next;
    });
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const next = [...prev];
      const old = next[index];
      if (old?.kind === "file") URL.revokeObjectURL(old.preview);
      next[index] = null;
      return next;
    });
  }

  async function submit() {
    if (!ready || duplicateTitles || sending) return;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set("kind", kind);
    form.set("context", context.trim());
    if (network) form.set("network", network);
    if (kind === "TITLE") {
      filledTitles.forEach((t, i) => form.set(`label${i}`, t));
    } else {
      filledImages.forEach((s, i) => {
        form.set(`label${i}`, "");
        if (s.kind === "source") form.set(`source${i}`, s.url);
        else form.set(`file${i}`, s.file, s.file.name);
      });
    }
    const res = await fetch("/api/community/feedback", { method: "POST", body: form }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    setSending(false);
    if (!res || !res.ok || !data?.id) {
      setError(data?.error ?? "Envoi impossible pour le moment. Réessayez dans un instant.");
      return;
    }
    onCreated(data.id);
  }

  const kinds = useMemo(
    () =>
      [
        { id: "THUMBNAIL" as const, label: "Miniatures", hint: "Laquelle donne envie de cliquer ?" },
        { id: "TITLE" as const, label: "Titres", hint: "Lequel accroche le mieux ?" }
      ] satisfies { id: FeedbackKind; label: string; hint: string }[],
    []
  );

  return (
    <Modal open={open} onClose={onClose} title="Demander l'avis de la communauté" maxWidthClassName="max-w-xl">
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="-mt-2 text-xs text-slate-400">Proposez 2 ou 3 versions : les autres créateurs votent pour leur préférée et vous laissent un avis pendant 72&nbsp;h.</p>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Que voulez-vous comparer ?">
          {kinds.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={clsx(
                "rounded-xl border px-3 py-2.5 text-left transition",
                kind === k.id ? "border-aurora-400/60 bg-aurora-400/10" : "border-white/10 hover:border-white/20"
              )}
            >
              <span className="block text-sm font-medium text-white">{k.label}</span>
              <span className="block text-xs text-slate-400">{k.hint}</span>
            </button>
          ))}
        </div>

        {kind === "TITLE" ? (
          <div className="space-y-2">
            {titles.map((t, i) => (
              <Input
                key={i}
                label={`Titre ${optionLetter(i)}${i >= FEEDBACK_MIN_OPTIONS ? " (facultatif)" : ""}`}
                value={t}
                maxLength={FEEDBACK_TITLE_MAX}
                placeholder={i === 0 ? "Ex. : 5 erreurs qui ruinent vos Reels" : "Une autre version"}
                onChange={(e) => setTitles((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                labelAside={<span className="text-[11px] tabular-nums text-slate-500">{t.length}/{FEEDBACK_TITLE_MAX}</span>}
              />
            ))}
            {duplicateTitles && <p className="text-xs text-amber-300">Deux titres sont identiques : changez-en un.</p>}
          </div>
        ) : (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Miniatures (2 au moins)</p>
            <div className="grid grid-cols-3 gap-2">
              {images.map((slot, i) => (
                <div key={i} className="relative">
                  {slot ? (
                    <div className="relative overflow-hidden rounded-xl border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={slot.kind === "source" ? slot.url : slot.preview} alt={`Miniature ${optionLetter(i)}`} className="aspect-video w-full object-cover" />
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 text-xs font-semibold text-white">{optionLetter(i)}</span>
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        aria-label={`Retirer la miniature ${optionLetter(i)}`}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black/90"
                      >
                        <IconClose className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        void pickFile(i, Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/")));
                      }}
                      className="flex aspect-video min-h-[76px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-1 text-center border-white/15 text-xs text-slate-400 transition hover:border-aurora-400/50 hover:text-white focus-within:border-aurora-400/60"
                    >
                      <IconUpload className="h-4 w-4" />
                      Miniature {optionLetter(i)}
                      {i >= FEEDBACK_MIN_OPTIONS && <span className="text-[10px] text-slate-500">facultatif</span>}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pickFile(i, e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">JPEG, PNG ou WebP. Glissez une image dans une case ou cliquez dessus.</p>
          </div>
        )}

        <Textarea
          label="Votre question (facultatif)"
          value={context}
          maxLength={FEEDBACK_CONTEXT_MAX}
          rows={2}
          placeholder={kind === "TITLE" ? "Ex. : pour une vidéo YouTube de 10 min sur le budget en couple" : "Ex. : laquelle donne le plus envie de cliquer pour une recette rapide ?"}
          onChange={(e) => setContext(e.target.value)}
          labelAside={<span className="text-[11px] tabular-nums text-slate-500">{context.length}/{FEEDBACK_CONTEXT_MAX}</span>}
        />

        <Select label="Pour quel réseau ? (facultatif)" value={network} onChange={(e) => setNetwork(e.target.value)}>
          <option value="">Peu importe</option>
          {NETWORKS.map((n) => (
            <option key={n} value={n}>
              {NETWORK_META[n].label}
            </option>
          ))}
        </Select>

        <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
          Visible par tous les membres de la Communauté Nebula pendant 72&nbsp;h, puis gardé 30 jours avec ses résultats. N&apos;y mettez rien de confidentiel.
        </p>

        {error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {q && left !== null
              ? q.period === "week"
                ? `${left} demande${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""} cette semaine (Gratuit)`
                : `${left} demande${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""} aujourd'hui`
              : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
              Annuler
            </Button>
            <Button type="submit" disabled={!ready || duplicateTitles || sending || left === 0}>
              {sending ? "Envoi…" : "Publier la demande"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
