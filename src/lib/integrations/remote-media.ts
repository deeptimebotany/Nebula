// Téléchargement sécurisé d'un média depuis une plateforme externe, puis
// enregistrement comme média de la marque (lot 3, 25/09/2026). Utilisé par
// /api/media/import (Google Drive, Dropbox, OneDrive, Unsplash) et par
// l'import Canva.
//
// Sécurité : seules des adresses https sur des domaines connus de chaque
// plateforme sont acceptées, redirections comprises (vérifiées une par une),
// pour que la route ne puisse pas servir à interroger n'importe quel
// serveur. Taille plafonnée pendant le transfert, types image/vidéo
// uniquement.
import { prisma } from "@/lib/prisma";
import { saveRemoteMedia } from "@/lib/storage";
import { brandUploadPrefix, isAllowedMediaMime, MAX_UPLOAD_BYTES } from "@/lib/upload-policy";
import type { MediaType } from "@/lib/types";
import { sendRequest } from "@/lib/social/base";
import { ImportError } from "./errors";
import { IMPORT_LABEL, toImportError, type ImportProvider } from "./http";

export type HostCheck = (hostname: string) => boolean;

const endsWithAny = (host: string, suffixes: string[]) => suffixes.some((s) => host === s || host.endsWith(`.${s}`));

export const ALLOWED_HOSTS: Record<"gdrive" | "dropbox" | "onedrive" | "unsplash" | "canva", HostCheck> = {
  gdrive: (h) => endsWithAny(h, ["googleapis.com", "googleusercontent.com"]),
  dropbox: (h) => endsWithAny(h, ["dropboxusercontent.com", "dropbox.com"]),
  onedrive: (h) => endsWithAny(h, ["1drv.com", "1drv.ms", "sharepoint.com", "onedrive.com", "livefilestore.com", "graph.microsoft.com", "storage.live.com"]),
  unsplash: (h) => endsWithAny(h, ["unsplash.com"]),
  canva: (h) => endsWithAny(h, ["canva.com", "canva-export.com"]) || /^export-download\.canva/.test(h)
};

export { ImportError };

const SOURCE_OF_CHECK = new Map<HostCheck, ImportProvider>([
  [ALLOWED_HOSTS.gdrive, "GOOGLE_DRIVE"],
  [ALLOWED_HOSTS.dropbox, "DROPBOX"],
  [ALLOWED_HOSTS.onedrive, "ONEDRIVE"],
  [ALLOWED_HOSTS.unsplash, "UNSPLASH"],
  [ALLOWED_HOSTS.canva, "CANVA"]
]);

/**
 * Délai d'un téléchargement (réponse ET transfert du fichier) : sous la
 * limite de 60 s des routes d'import, pour répondre un message clair au lieu
 * d'être coupé par Vercel (lot 8).
 */
export const DOWNLOAD_TIMEOUT_MS = 50_000;

/**
 * fetch qui suit les redirections à la main, en vérifiant chaque domaine.
 * Passe par la porte commune (lot 8) : délai garanti, panne classée.
 */
/** Origine d'un média importé (MediaAsset.importSource). */
export type ImportSource = "gdrive" | "dropbox" | "onedrive" | "unsplash" | "canva" | "api";

export async function fetchFromAllowedHost(url: string, allowed: HostCheck, init: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Response> {
  const source = SOURCE_OF_CHECK.get(allowed) ?? "DROPBOX";
  // Un seul délai pour toute la chaîne de redirections et le transfert.
  const signal = AbortSignal.timeout(init.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new ImportError("Adresse du fichier invalide.");
    }
    if (parsed.protocol !== "https:" || !allowed(parsed.hostname)) {
      throw new ImportError("Adresse du fichier non autorisée pour cette source.");
    }
    // L'en-tête d'autorisation n'est envoyé qu'au premier serveur.
    let res: Response;
    try {
      res = await sendRequest(source, current, { headers: hop === 0 ? init.headers : undefined, redirect: "manual", cache: "no-store", signal, readOnly: true });
    } catch (err) {
      throw toImportError(source, err);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new ImportError("Redirection sans destination.");
      current = new URL(location, current).toString();
      continue;
    }
    if (res.status === 401) throw new ImportError(`Connexion ${IMPORT_LABEL[source]} expirée : reliez à nouveau votre compte ou choisissez à nouveau le fichier.`, 401);
    if (res.status === 404) throw new ImportError(`Fichier introuvable sur ${IMPORT_LABEL[source]} (supprimé ou lien expiré).`, 404);
    if (!res.ok) throw new ImportError(`${IMPORT_LABEL[source]} a refusé le téléchargement (${res.status}).`, 502);
    return res;
  }
  throw new ImportError("Trop de redirections.");
}

function capStream(body: ReadableStream<Uint8Array>, max: number): ReadableStream<Uint8Array> {
  let total = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > max) {
          controller.error(new ImportError("Fichier trop lourd (2 Go maximum).", 413));
          return;
        }
        controller.enqueue(chunk);
      }
    })
  );
}

function mimeFromName(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm"
  };
  return map[ext] ?? null;
}

export interface ImportedAsset {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  type: MediaType;
  sizeBytes: number;
}

/**
 * Enregistre la réponse téléchargée comme média de la marque. `source`
 * (Réussites v2) : origine de l'import, gardée sur le média
 * (MediaAsset.importSource) pour les missions « publier un média importé ».
 */
export async function storeDownloadedMedia(brandId: string, res: Response, filename: string, mimeHint?: string | null, source?: ImportSource): Promise<ImportedAsset> {
  if (!res.body) throw new ImportError("Fichier vide.");
  const headerMime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  // Certains services renvoient application/octet-stream : on se fie alors
  // à l'indication de la plateforme ou à l'extension du nom.
  const mime = isAllowedMediaMime(headerMime) ? headerMime : mimeHint && isAllowedMediaMime(mimeHint) ? mimeHint : mimeFromName(filename) ?? headerMime;
  if (!isAllowedMediaMime(mime)) throw new ImportError("Type de fichier non accepté (images et vidéos uniquement).", 415);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD_BYTES) throw new ImportError("Fichier trop lourd (2 Go maximum).", 413);

  let saved: Awaited<ReturnType<typeof saveRemoteMedia>>;
  try {
    saved = await saveRemoteMedia({ body: capStream(res.body, MAX_UPLOAD_BYTES), mimeType: mime, filename, prefix: brandUploadPrefix(brandId) });
  } catch (err) {
    if (err instanceof ImportError) throw err;
    const name = (err as Error).name;
    // Délai du téléchargement dépassé pendant le transfert (lot 8).
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ImportError("Téléchargement trop long : le fichier est sans doute trop lourd pour un import direct. Envoyez-le depuis votre appareil.", 504);
    }
    throw err;
  }
  const type: MediaType = mime.startsWith("video") ? "VIDEO" : "IMAGE";
  const safeName = filename.replace(/[\\/\u0000-\u001f]/g, "").slice(0, 200) || (type === "VIDEO" ? "video.mp4" : "image.jpg");
  const asset = await prisma.mediaAsset.create({
    data: { brandId, type, url: saved.url, filename: safeName, mimeType: mime, sizeBytes: declared || 0, importSource: source ?? null }
  });
  return { id: asset.id, url: asset.url, filename: asset.filename, mimeType: asset.mimeType, type, sizeBytes: asset.sizeBytes };
}
