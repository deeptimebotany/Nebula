"use client";

import { upload } from "@vercel/blob/client";
import type { MediaType } from "@/lib/types";

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

async function uploadDirectToBlob(file: File, brandId: string): Promise<UploadedAssetResult> {
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload/blob-token",
    clientPayload: JSON.stringify({ brandId })
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
export async function uploadMediaFile(file: File, brandId: string): Promise<UploadedAssetResult> {
  const direct = await isBlobConfigured();
  if (!direct) return uploadLegacy(file, brandId);

  try {
    return await uploadDirectToBlob(file, brandId);
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
