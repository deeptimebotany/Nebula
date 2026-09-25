"use client";

import type { MediaType } from "@/lib/types";

// Le module d'envoi direct vers Vercel Blob (~33 Ko) n'est téléchargé qu'au
// premier envoi de fichier, plus au chargement du calendrier ou de la page
// Publier (audit performance, lot 4).
function loadBlobClient() {
  return import("@vercel/blob/client");
}

/** Avancement d'un envoi, de 0 à 100. */
export type UploadProgressHandler = (percent: number) => void;

export interface UploadedAssetResult {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  type: MediaType;
  sizeBytes?: number;
}

let blobConfiguredCache: boolean | null = null;

async function isBlobConfigured(): Promise<boolean> {
  if (blobConfiguredCache !== null) return blobConfiguredCache;
  try {
    const res = await fetch("/api/upload/blob-token");
    const data = await res.json();
    blobConfiguredCache = Boolean(data.configured);
  } catch {
    blobConfiguredCache = false;
  }
  return blobConfiguredCache;
}

// Nom de fichier sûr pour le chemin de stockage (lettres, chiffres, - _ .).
function storageName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  return cleaned || "fichier";
}

async function uploadDirectToBlob(file: File, brandId: string, onProgress?: UploadProgressHandler): Promise<UploadedAssetResult> {
  const { upload } = await loadBlobClient();
  // Rangé dans le dossier de la marque (b/<marque>/…) : exigé par
  // /api/upload/blob-token et /api/upload/register (audit sécurité, lot 1).
  const blob = await upload(`b/${brandId}/${storageName(file.name)}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload/blob-token",
    clientPayload: JSON.stringify({ brandId }),
    onUploadProgress: onProgress ? ({ percentage }) => onProgress(Math.min(99, Math.round(percentage))) : undefined
  });

  const res = await fetch("/api/upload/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId,
      url: blob.url,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size
    })
  });
  const data = await res.json();
  if (!res.ok || !data.asset) {
    throw new Error(data.error ?? "Échec de l'enregistrement du fichier après son envoi.");
  }
  return data.asset;
}

async function uploadLegacy(file: File, brandId: string): Promise<UploadedAssetResult> {
  const form = new FormData();
  form.append("brandId", brandId);
  form.append("files", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });

  let data: { assets?: UploadedAssetResult[]; error?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    // La plateforme a parfois renvoyé une réponse non-JSON (ex : la requête
    // a été coupée avant d'atteindre notre code) — message générique ci-dessous.
  }

  if (!res.ok || !data?.assets?.[0]) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      data?.error ??
        `Échec de l'envoi de "${file.name}" (${sizeMb} Mo, code ${res.status}). Le fichier est peut-être trop volumineux pour l'envoi classique.`
    );
  }
  return data.assets[0];
}

/**
 * Envoie un fichier vidéo ou image et renvoie le MediaAsset créé.
 *
 * Sur Vercel avec Vercel Blob configuré, le fichier part directement du
 * navigateur vers le stockage : cela contourne la limite de ~4,5 Mo que
 * Vercel impose aux requêtes envoyées à une fonction serverless classique,
 * qui faisait échouer l'envoi des vidéos (et parfois des photos un peu
 * lourdes) sans message clair. Si Vercel Blob n'est pas configuré (ex : en
 * développement local), on repasse automatiquement sur l'envoi classique.
 */
export async function uploadMediaFile(file: File, brandId: string, onProgress?: UploadProgressHandler): Promise<UploadedAssetResult> {
  const direct = await isBlobConfigured();
  if (!direct) return uploadLegacy(file, brandId);

  try {
    const asset = await uploadDirectToBlob(file, brandId, onProgress);
    onProgress?.(100);
    return asset;
  } catch (err) {
    // Si l'upload direct échoue pour une raison inattendue, on ne retente
    // l'envoi classique que si le fichier a une chance raisonnable de passer
    // la limite de la plateforme — sinon on remonte l'erreur réelle.
    if (file.size <= 4 * 1024 * 1024) {
      try {
        return await uploadLegacy(file, brandId);
      } catch {
        throw err;
      }
    }
    throw err;
  }
}
