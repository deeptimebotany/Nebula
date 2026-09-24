"use client";

import { useEffect, useRef, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useMilestoneCelebration } from "@/components/milestone-celebration";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { NetworkLogo } from "@/components/ui/network-badge";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { localInputToUtc } from "@/lib/timezone";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { uploadMediaFile } from "@/lib/upload-client";
import { clsx } from "@/lib/clsx";
import { IconUpload } from "@/components/dashboard/icons";

// Même clé que DRAFT_KEY_PREFIX dans composer/page.tsx (dupliquée ici
// volontairement — pas d'export partagé pour ce détail interne). Un test
// (tsc) ne peut pas vérifier que les deux valeurs restent synchronisées :
// si vous renommez l'une, renommez l'autre.
const DRAFT_KEY_PREFIX = "nebula:composer-draft:";

interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
}

interface QuickAsset {
  id: string;
  url: string;
  filename: string;
  type: "VIDEO" | "IMAGE";
}

interface QuickComposerModalProps {
  open: boolean;
  initialDate?: string;
  initialTime?: string;
  onClose: () => void;
}

/**
 * Popup "Nouvelle publication" qui s'ouvre automatiquement depuis les
 * raccourcis "Nouveau post" (tableau de bord, calendrier, palette de
 * commandes) — voir quick-composer-context.tsx. Reprend la structure vue
 * dans les captures de référence (rangée de réseaux, zone d'import glisser-
 * déposer, champs titre/description) pour les cas simples : un média, une
 * légende, publier ou planifier tout de suite.
 *
 * Volontairement PAS une réécriture du Composer complet (1600+ lignes :
 * IA, miniatures, personnalisation par réseau, premier commentaire...) —
 * "Options avancées" y renvoie avec le brouillon déjà rempli plutôt que de
 * dupliquer toute cette logique de publication ici, ce qui doublerait les
 * risques de bug entre deux flux de publication distincts.
 */
export function QuickComposerModal({ open, initialDate, initialTime, onClose }: QuickComposerModalProps) {
  const { activeBrand } = useBrand();
  const router = useRouter();
  const toast = useToast();
  const { celebrateMilestone } = useMilestoneCelebration();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [selectedNetworks, setSelectedNetworks] = useState<Network[]>([]);
  const [asset, setAsset] = useState<QuickAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<"now" | "date">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Récupère les comptes connectés à chaque ouverture (une popup qui reste
  // montée en permanence — voir QuickComposerProvider — doit repartir avec
  // des données fraîches plutôt que celles de la dernière ouverture).
  useEffect(() => {
    if (!open || !activeBrand) return;
    fetch(`/api/connections?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => setConnections(d.connections ?? []))
      .catch(() => setConnections([]));
  }, [open, activeBrand]);

  // Applique la date/heure pré-remplie (clic sur une case du calendrier) à
  // chaque ouverture.
  useEffect(() => {
    if (!open) return;
    setMode(initialDate ? "date" : "now");
    setScheduleDate(initialDate ? `${initialDate}T${initialTime ?? "12:00"}` : "");
  }, [open, initialDate, initialTime]);

  function resetAndClose() {
    setAsset(null);
    setUploadError(null);
    setTitle("");
    setCaption("");
    setSelectedNetworks([]);
    onClose();
  }

  function toggleNetwork(network: Network) {
    setSelectedNetworks((prev) => (prev.includes(network) ? prev.filter((n) => n !== network) : [...prev, network]));
  }

  async function handleFile(file: File) {
    if (!activeBrand) return;
    setUploadError(null);
    setUploading(true);
    try {
      const uploaded = await uploadMediaFile(file, activeBrand.id);
      setAsset({
        id: uploaded.id,
        url: uploaded.url,
        filename: uploaded.filename,
        type: uploaded.type === "VIDEO" ? "VIDEO" : "IMAGE"
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Échec de l'envoi du fichier.");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const canSubmit = !!activeBrand && !!asset && selectedNetworks.length > 0 && (mode === "now" || !!scheduleDate);

  async function onSubmit() {
    if (!activeBrand || !asset) return;
    // Heure saisie = heure du fuseau de la marque (comme la page Publier).
    const scheduledUtc = mode === "date" && scheduleDate ? localInputToUtc(scheduleDate, activeBrand.timezone) : null;
    if (scheduledUtc && scheduledUtc.getTime() <= Date.now()) {
      toast.error("Cet horaire est déjà passé : choisissez une date et une heure à venir.");
      return;
    }
    setSubmitting(true);

    const targets = selectedNetworks
      .map((network) => {
        const connection = connections.find((c) => c.network === network);
        if (!connection) return null;
        return { connectionId: connection.id, network };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    const scheduledAt = scheduledUtc ? scheduledUtc.toISOString() : undefined;

    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: activeBrand.id,
        title,
        caption,
        scheduledAt,
        mediaAssetIds: [asset.id],
        targets,
        publishNow: mode === "now"
      })
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Erreur lors de la création du post.");
      return;
    }

    toast.success(mode === "date" ? "Post programmé." : "Post publié.");
    if (typeof data.milestone === "number") celebrateMilestone(data.milestone);
    const postId = data.postId as string;
    resetAndClose();
    router.push(`/posts/${postId}`);
  }

  // "Options avancées" : passe la main au Composer complet (IA, miniatures,
  // personnalisation par réseau...) sans rien publier soi-même. Le média
  // déjà envoyé (asset.id/url) est transmis par l'URL — le brouillon
  // localStorage ne porte que le texte (voir composer/page.tsx).
  function onAdvanced() {
    if (activeBrand) {
      try {
        localStorage.setItem(
          DRAFT_KEY_PREFIX + activeBrand.id,
          JSON.stringify({ title, caption, selectedNetworks })
        );
      } catch {
        // stockage indisponible — on continue quand même, juste sans brouillon
      }
    }
    const params = new URLSearchParams();
    if (initialDate) params.set("date", initialDate);
    if (initialTime) params.set("time", initialTime);
    if (asset) {
      params.set("quickAssetId", asset.id);
      params.set("quickAssetUrl", asset.url);
      params.set("quickAssetType", asset.type);
      params.set("quickAssetFilename", asset.filename);
    }
    const query = params.toString();
    resetAndClose();
    router.push(`/composer${query ? `?${query}` : ""}`);
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Nouvelle publication" maxWidthClassName="max-w-xl">
      {!activeBrand ? (
        <p className="text-sm text-slate-400">Sélectionnez d&apos;abord une marque en haut de l&apos;écran.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Réseaux</p>
            <div className="flex flex-wrap items-center gap-2.5">
              {NETWORKS.map((network) => {
                const meta = NETWORK_META[network];
                const isConnected = connections.some((c) => c.network === network);
                const isSelected = selectedNetworks.includes(network);
                return (
                  <button
                    key={network}
                    type="button"
                    disabled={!isConnected}
                    onClick={() => toggleNetwork(network)}
                    title={isConnected ? meta.label : `${meta.label} — non connecté`}
                    className={clsx(
                      "flex h-11 w-11 items-center justify-center rounded-full border-2 transition",
                      !isConnected && "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-30",
                      isConnected && isSelected && "border-aurora-400 bg-aurora-400/10",
                      isConnected && !isSelected && "border-white/10 bg-white/[0.03] hover:border-white/20"
                    )}
                  >
                    <span style={{ color: isConnected ? meta.color : undefined }}>
                      <NetworkLogo network={network} className="h-5 w-5" />
                    </span>
                  </button>
                );
              })}
              {connections.length === 0 && (
                <Link href="/accounts" className="text-xs text-aurora-300 hover:underline">
                  Connecter un compte →
                </Link>
              )}
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition",
              dragOver ? "border-aurora-400 bg-aurora-400/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
            )}
          >
            {asset ? (
              <div className="flex flex-col items-center gap-2">
                {asset.type === "VIDEO" ? (
                  <video src={asset.url} className="h-28 rounded-lg object-cover" muted />
                ) : (
                  <RemoteImage src={asset.url} className="h-28 w-full rounded-lg" sizes="(max-width: 640px) 100vw, 400px" />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAsset(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Retirer et choisir un autre fichier
                </button>
              </div>
            ) : uploading ? (
              <>
                <IconUpload className="h-6 w-6 animate-pulse text-aurora-300" />
                <p className="text-sm text-slate-400">Envoi en cours...</p>
              </>
            ) : (
              <>
                <IconUpload className="h-6 w-6 text-slate-500" />
                <p className="text-sm text-slate-300">
                  Glissez une image ou une vidéo ici, ou cliquez pour en choisir une.
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
          {uploadError && <p className="text-xs text-red-300">{uploadError}</p>}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (optionnel)"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
          />
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Écrivez votre description..."
            rows={4}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("now")}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                mode === "now" ? "bg-aurora-400/15 text-aurora-200" : "text-slate-400 hover:text-white"
              )}
            >
              Maintenant
            </button>
            <button
              type="button"
              onClick={() => setMode("date")}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                mode === "date" ? "bg-aurora-400/15 text-aurora-200" : "text-slate-400 hover:text-white"
              )}
            >
              Planifier
            </button>
          </div>
          {mode === "date" && <DateTimePicker value={scheduleDate} onChange={setScheduleDate} timeZone={activeBrand?.timezone} />}

          <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <button type="button" onClick={onAdvanced} className="text-sm text-slate-400 hover:text-white">
              Options avancées →
            </button>
            <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
              {submitting ? "Envoi..." : mode === "date" ? "Planifier" : "Publier maintenant"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
