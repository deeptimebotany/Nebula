"use client";

// Barre « Importer depuis » de Publier (lot 3, 25/09/2026), sous la zone
// d'envoi : Google Drive, Dropbox, OneDrive, Unsplash et Canva. Seules les
// sources configurées sur le serveur apparaissent (voir /api/media/sources) ;
// si aucune ne l'est, la barre ne s'affiche pas du tout.

import { useCallback, useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";
import { MEDIA_SOURCE_LABELS, type MediaSourceId } from "@/lib/media-sources";
import { SourceIcon } from "@/components/media-import/source-icon";
import type { UploadedAssetResult } from "@/lib/upload-client";
import { preloadDropbox, preloadGoogleDrive, pickFromDropbox, pickFromGoogleDrive } from "./browser-pickers";
import dynamic from "next/dynamic";
import type { UnsplashCredit } from "./import-dialogs";

// Fenêtres d'import (Unsplash, Canva, OneDrive : ~600 lignes) téléchargées à
// la première ouverture seulement (lot 5).
const UnsplashDialog = dynamic(() => import("./import-dialogs").then((m) => m.UnsplashDialog), { ssr: false });
const CanvaDialog = dynamic(() => import("./import-dialogs").then((m) => m.CanvaDialog), { ssr: false });
const OneDriveDialog = dynamic(() => import("./import-dialogs").then((m) => m.OneDriveDialog), { ssr: false });

interface Sources {
  gdrive: { apiKey: string; clientId: string; appId: string } | null;
  dropbox: { appKey: string } | null;
  onedrive: { connected: boolean } | null;
  unsplash: boolean;
  canva: { connected: boolean; accountName?: string | null } | null;
}

type SourceId = MediaSourceId;

const LABELS = MEDIA_SOURCE_LABELS;


export function MediaImportBar({
  brandId,
  disabled,
  onImported,
  onError,
  onBusyChange
}: {
  brandId: string | undefined;
  disabled?: boolean;
  onImported: (asset: UploadedAssetResult, extra?: { credit?: UnsplashCredit | null; creditInCaption?: boolean; source: SourceId }) => void;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [sources, setSources] = useState<Sources | null>(null);
  const [busy, setBusy] = useState<SourceId | null>(null);
  const [dialog, setDialog] = useState<"unsplash" | "canva" | "onedrive" | null>(null);
  // Fenêtres déjà ouvertes une fois : gardées montées (recherche, sélection).
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (dialog) setOpened((prev) => (prev.has(dialog) ? prev : new Set(prev).add(dialog)));
  }, [dialog]);

  const refreshSources = useCallback(async () => {
    try {
      const res = await fetch("/api/media/sources", { cache: "no-store" });
      if (res.ok) setSources((await res.json()) as Sources);
    } catch {
      // Sans réponse, la barre reste masquée.
    }
  }, []);

  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  // Préchargement des sélecteurs Google et Dropbox (voir browser-pickers.ts).
  useEffect(() => {
    if (sources?.gdrive) preloadGoogleDrive(sources.gdrive).catch(() => undefined);
    if (sources?.dropbox) preloadDropbox(sources.dropbox.appKey).catch(() => undefined);
  }, [sources]);

  // Retour d'une connexion Canva / OneDrive : on rouvre la bonne fenêtre.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("integrationConnected") || url.searchParams.get("import");
    const failed = url.searchParams.get("integrationError");
    if (!connected && !failed) return;
    if (failed) onError(`Connexion impossible : ${failed}`);
    if (connected === "canva" || connected === "onedrive") setDialog(connected);
    for (const k of ["integrationConnected", "integrationError", "import"]) url.searchParams.delete(k);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    // Une seule fois, au chargement de Publier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onBusyChange?.(busy !== null);
  }, [busy, onBusyChange]);

  if (!sources) return null;
  const available: SourceId[] = (["gdrive", "dropbox", "onedrive", "unsplash", "canva"] as const).filter((id) => (id === "unsplash" ? sources.unsplash : Boolean(sources[id])));
  if (available.length === 0) return null;

  async function importFrom(body: Record<string, unknown>, source: SourceId) {
    if (!brandId) return;
    setBusy(source);
    try {
      const res = await fetch("/api/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, source, brandId })
      });
      const data = (await res.json().catch(() => ({}))) as { asset?: UploadedAssetResult; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error || "Import impossible.");
      onImported(data.asset, { source });
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onClick(id: SourceId) {
    if (!brandId || disabled || busy) return;
    if (id === "gdrive" && sources?.gdrive) {
      // Appel synchrone dans le clic : la fenêtre Google n'est pas bloquée.
      pickFromGoogleDrive(sources.gdrive).then(
        (file) => file && importFrom({ fileId: file.fileId, accessToken: file.accessToken, filename: file.name, mimeType: file.mimeType }, "gdrive"),
        (err: Error) => onError(err.message)
      );
      return;
    }
    if (id === "dropbox") {
      pickFromDropbox().then(
        (file) => file && importFrom({ url: file.url, filename: file.name }, "dropbox"),
        (err: Error) => onError(err.message)
      );
      return;
    }
    setDialog(id === "unsplash" ? "unsplash" : id === "canva" ? "canva" : "onedrive");
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-slate-500">Importer depuis</span>
        {available.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onClick(id)}
            disabled={!brandId || disabled || busy !== null}
            aria-busy={busy === id}
            className={clsx(
              // 8 px autour du logo (consigne Canva pour son icône dans un bouton, 06/10/2026).
              "flex items-center gap-2 rounded-full border py-2 pl-2 pr-3 text-xs transition",
              busy === id ? "border-aurora-400/50 bg-aurora-400/10 text-white" : "border-white/10 text-slate-300 hover:border-aurora-400/40 hover:text-white",
              (!brandId || disabled) && "opacity-50"
            )}
          >
            {busy === id ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-aurora-300" aria-hidden="true" /> : <SourceIcon id={id} />}
            {LABELS[id]}
          </button>
        ))}
      </div>

      {brandId && sources.unsplash && (dialog === "unsplash" || opened.has("unsplash")) && (
        <UnsplashDialog
          open={dialog === "unsplash"}
          onClose={() => setDialog(null)}
          brandId={brandId}
          onImported={(asset, credit, creditInCaption) => onImported(asset, { credit, creditInCaption, source: "unsplash" })}
        />
      )}
      {brandId && sources.canva && (dialog === "canva" || opened.has("canva")) && (
        <CanvaDialog
          open={dialog === "canva"}
          onClose={() => setDialog(null)}
          brandId={brandId}
          connected={sources.canva.connected}
          accountName={sources.canva.accountName ?? null}
          onDisconnected={() => {
            setDialog(null);
            refreshSources();
          }}
          onImported={(asset) => onImported(asset, { source: "canva" })}
        />
      )}
      {brandId && sources.onedrive && (dialog === "onedrive" || opened.has("onedrive")) && (
        <OneDriveDialog
          open={dialog === "onedrive"}
          onClose={() => setDialog(null)}
          brandId={brandId}
          connected={sources.onedrive.connected}
          onDisconnected={() => {
            setDialog(null);
            refreshSources();
          }}
          onImported={(asset) => onImported(asset, { source: "onedrive" })}
        />
      )}
    </>
  );
}
