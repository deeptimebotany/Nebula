"use client";

import { useEffect, useRef, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { SkeletonText } from "@/components/ui/skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { NetworkBadge } from "@/components/ui/network-badge";
import { useBrand } from "@/components/brand-context";
import { DEFAULT_TIMEZONE, localInputToUtc, timeZoneLabel, utcToLocalInput } from "@/lib/timezone";
import { IconSparkle, IconClose } from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { useAiStatus } from "@/components/use-ai-status";
import { uploadMediaFile } from "@/lib/upload-client";
import type { Network } from "@/lib/types";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { PostStats } from "@/components/posts/post-stats";

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "En ligne",
  PARTIAL: "En ligne sur une partie des réseaux",
  FAILED: "Échec de la publication",
  PUBLISHING: "Publication en cours"
};

/** Champ en lecture seule avec bouton « Copier » (onglet Contenu). */
function CopyField({ label, value, multiline, onCopied }: { label: string; value: string; multiline?: boolean; onCopied: () => void }) {
  if (!value.trim()) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value).then(onCopied, () => undefined)}
          className="text-xs text-aurora-300 hover:underline"
        >
          Copier
        </button>
      </div>
      <p className={clsx("select-text rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-slate-200", multiline ? "max-h-40 overflow-y-auto whitespace-pre-wrap" : "truncate")}>{value}</p>
    </div>
  );
}

interface PostDetail {
  id: string;
  brandId: string;
  title: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  media: { mediaAsset: { id: string; url: string; type: "VIDEO" | "IMAGE"; thumbnailUrl?: string } }[];
  targets: { network: Network; connection: { displayName: string } }[];
}

// Modale d'édition rapide ouverte depuis le calendrier : fond flou, on reste
// sur la page. Permet de changer le titre, la légende (avec assistance IA)
// et de remplacer le fichier vidéo/image, sans repasser par tout le composer.
export function PostEditModal({ postId, onClose, onSaved }: { postId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [aiBusy, setAiBusy] = useState<"title" | "caption" | null>(null);
  const [tab, setTab] = useState<"stats" | "content">("stats");
  const [reusing, setReusing] = useState(false);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiStatus = useAiStatus(post?.brandId);
  // Reprogrammation (Lot 4) : date/heure dans le fuseau de la marque (voir
  // src/lib/timezone.ts), même règle que la page Publier.
  const { brands } = useBrand();
  const timezone = brands.find((b) => b.id === post?.brandId)?.timezone ?? DEFAULT_TIMEZONE;
  const [scheduleInput, setScheduleInput] = useState("");
  const [initialScheduleInput, setInitialScheduleInput] = useState("");

  useEffect(() => {
    fetch(`/api/posts/${postId}`)
      .then((r) => r.json())
      .then((d) => {
        setPost(d.post);
        setTitle(d.post?.title ?? "");
        setCaption(d.post?.caption ?? "");
      });
  }, [postId]);

  useEffect(() => {
    if (!post?.scheduledAt) return;
    const value = utcToLocalInput(new Date(post.scheduledAt), timezone);
    setScheduleInput(value);
    setInitialScheduleInput(value);
  }, [post?.scheduledAt, timezone]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function replaceFile(file: File) {
    if (!post) return;
    setReplacing(true);
    try {
      const asset = await uploadMediaFile(file, post.brandId);
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaAssetIds: [asset.id] })
      });
      setPost((p) => (p ? { ...p, media: [{ mediaAsset: { ...asset, thumbnailUrl: undefined } }] } : p));
      toast.success("Fichier remplacé.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'envoi du fichier.");
    } finally {
      setReplacing(false);
    }
  }

  async function generate(field: "title" | "caption") {
    if (!post) return;
    setAiBusy(field);
    const res = await fetch("/api/ai/generate-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: post.brandId,
        field: field === "title" ? "title" : "description",
        existingTitle: title,
        existingCaption: caption
      })
    });
    const data = await res.json();
    setAiBusy(null);
    if (!res.ok) {
      toast.error(data.error ?? "Échec de la génération IA.");
      return;
    }
    if (field === "title") setTitle(data.text);
    else setCaption(data.text);
  }

  async function save() {
    setSaving(true);
    const rescheduled = post?.status === "SCHEDULED" && scheduleInput && scheduleInput !== initialScheduleInput ? localInputToUtc(scheduleInput, timezone) : null;
    if (rescheduled && rescheduled.getTime() <= Date.now()) {
      setSaving(false);
      toast.error("Cet horaire est déjà passé : choisissez une date et une heure à venir.");
      return;
    }
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, caption, ...(rescheduled ? { scheduledAt: rescheduled.toISOString() } : {}) })
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Échec de l'enregistrement.");
      return;
    }
    toast.success("Publication mise à jour.");
    onSaved();
  }

  const media = post?.media[0]?.mediaAsset;
  // Déjà envoyée (en ligne, partielle, en échec) : statistiques d'abord.
  const sent = Boolean(post && post.status !== "DRAFT" && post.status !== "SCHEDULED");
  const hashtags = Array.from(new Set(post?.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []));
  const captionWithoutTags = (post?.caption ?? "").replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Copie impossible : sélectionnez le texte à la main.");
    }
  }

  async function reuse() {
    setReusing(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.postId) throw new Error(data.error || "Impossible de réutiliser cette publication.");
      router.push(`/composer?duplicate=${data.postId}`);
    } catch (err) {
      toast.error((err as Error).message);
      setReusing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className={clsx("glass-panel relative z-10 w-full overflow-y-auto rounded-2xl p-5", sent ? "max-w-2xl" : "max-w-lg")} style={{ maxHeight: "90vh" }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold text-white">{sent ? post?.title || "Publication" : "Modifier la publication"}</h2>
            {sent && post && (
              <p className="text-xs text-slate-400">
                {STATUS_LABEL[post.status] ?? post.status}
                {post.scheduledAt && ` · ${new Date(post.scheduledAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {!post ? (
          <SkeletonText lines={4} />
        ) : sent ? (
          // Publication déjà envoyée (24/09/2026, demande de Lucas) : le clic
          // dans le calendrier ouvre d'abord ses statistiques, et « Contenu »
          // permet de récupérer titre, légende et hashtags. Ce qui est en
          // ligne ne se modifie pas depuis Nebula : « Réutiliser » crée un
          // nouveau brouillon modifiable avec le même contenu.
          <div className="space-y-4">
            <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.015] p-1" role="tablist" aria-label="Publication">
              {(
                [
                  ["stats", "Statistiques"],
                  ["content", "Contenu"]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={clsx("flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition", tab === id ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white")}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "stats" ? (
              <PostStats postId={postId} compact />
            ) : (
              <div className="space-y-3">
                <div className="flex gap-3">
                  {media && (
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      {media.type === "VIDEO" ? (
                        <video src={media.url} poster={media.thumbnailUrl} className="h-full w-full object-cover" muted />
                      ) : (
                        <RemoteImage src={media.url} className="h-full w-full" sizes="96px" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <CopyField label="Titre" value={post.title} onCopied={() => toast.success("Titre copié.")} />
                  </div>
                </div>
                <CopyField label="Légende" value={captionWithoutTags || post.caption} multiline onCopied={() => toast.success("Légende copiée.")} />
                {hashtags.length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400">Hashtags</span>
                      <button type="button" onClick={() => copy(hashtags.join(" "), "Hashtags copiés.")} className="text-xs text-aurora-300 hover:underline">
                        Copier les {hashtags.length}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {hashtags.map((h) => (
                        <span key={h} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-300">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
              <Link href={`/posts/${postId}`} className="text-xs text-slate-400 hover:text-white hover:underline">
                Fiche complète (rétention, discussion…) →
              </Link>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Fermer
                </Button>
                <Button onClick={reuse} disabled={reusing} title="Crée un nouveau brouillon avec le même média, titre, légende et hashtags, modifiable dans Publier">
                  {reusing ? "Préparation…" : "Réutiliser et modifier"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              {media && (
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  {media.type === "VIDEO" ? (
                    <video src={media.url} poster={media.thumbnailUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    <RemoteImage src={media.url} className="h-full w-full" sizes="96px" />
                  )}
                </div>
              )}
              <div className="flex flex-col justify-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && replaceFile(e.target.files[0])}
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={replacing}>
                  {replacing ? "Envoi..." : "Remplacer le fichier"}
                </Button>
                <div className="flex flex-wrap gap-1">
                  {post.targets.map((t, i) => (
                    <NetworkBadge key={i} network={t.network} size="sm" />
                  ))}
                </div>
              </div>
            </div>

            <Input
              label="Titre"
              id="post-edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              labelAside={
                aiStatus?.enabled ? (
                  <button type="button" onClick={() => generate("title")} disabled={aiBusy !== null} className="flex items-center gap-1 text-xs text-aurora-300 hover:underline disabled:opacity-50">
                    <IconSparkle className="h-3 w-3" /> {aiBusy === "title" ? "…" : "Proposer avec l'IA"}
                  </button>
                ) : undefined
              }
            />

            <Textarea
              label="Légende"
              id="post-edit-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              labelAside={
                aiStatus?.enabled ? (
                  <button type="button" onClick={() => generate("caption")} disabled={aiBusy !== null} className="flex items-center gap-1 text-xs text-aurora-300 hover:underline disabled:opacity-50">
                    <IconSparkle className="h-3 w-3" /> {aiBusy === "caption" ? "…" : "Proposer avec l'IA"}
                  </button>
                ) : undefined
              }
            />

            {post.status === "SCHEDULED" && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-400">Date et heure de publication</p>
                <DateTimePicker value={scheduleInput} onChange={setScheduleInput} timeZone={timezone} />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Heure de {timezone.replace(/_/g, " ")} ({timeZoneLabel(timezone)}) — le fuseau de la marque, modifiable dans Paramètres → Marque.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <Link href={`/posts/${postId}`} className="text-xs text-slate-400 hover:text-white hover:underline">
                Ouvrir la fiche complète →
              </Link>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Annuler</Button>
                <Button onClick={save} disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
