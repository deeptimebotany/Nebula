"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/ui/network-badge";
import { IconSparkle, IconClose } from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { useAiStatus } from "@/components/use-ai-status";
import { uploadMediaFile } from "@/lib/upload-client";
import type { Network } from "@/lib/types";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiStatus = useAiStatus(post?.brandId);

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
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, caption })
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

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="glass-panel relative z-10 w-full max-w-lg rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-white">Modifier la publication</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {!post ? (
          <p className="text-sm text-slate-500">Chargement...</p>
        ) : post.status !== "DRAFT" && post.status !== "SCHEDULED" ? (
          <p className="text-sm text-amber-300">
            Cette publication a déjà été envoyée, elle ne peut plus être modifiée depuis ici.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              {media && (
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  {media.type === "VIDEO" ? (
                    <video src={media.url} poster={media.thumbnailUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={media.url} alt="" className="h-full w-full object-cover" />
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

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">Titre</label>
                {aiStatus?.enabled && (
                  <button
                    onClick={() => generate("title")}
                    disabled={aiBusy !== null}
                    className="flex items-center gap-1 text-xs text-aurora-300 hover:underline disabled:opacity-50"
                  >
                    <IconSparkle className="h-3 w-3" /> {aiBusy === "title" ? "..." : "IA"}
                  </button>
                )}
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-aurora-400/60"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">Légende</label>
                {aiStatus?.enabled && (
                  <button
                    onClick={() => generate("caption")}
                    disabled={aiBusy !== null}
                    className="flex items-center gap-1 text-xs text-aurora-300 hover:underline disabled:opacity-50"
                  >
                    <IconSparkle className="h-3 w-3" /> {aiBusy === "caption" ? "..." : "IA"}
                  </button>
                )}
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-aurora-400/60"
              />
            </div>

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
