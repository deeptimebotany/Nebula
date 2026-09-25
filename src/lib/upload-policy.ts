// Politique commune à tous les chemins d'envoi de médias (formulaire
// multipart /api/upload, envoi direct Vercel Blob via /api/upload/blob-token
// puis /api/upload/register) : mêmes types acceptés, même plafond de taille,
// et seules les URL de notre propre stockage peuvent être enregistrées
// comme média d'une marque.

// 2 Go — largement suffisant pour une vidéo courte, aligné sur
// maximumSizeInBytes de /api/upload/blob-token.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

// Images et vidéos, SAUF le SVG (audit sécurité, lot 1) : un SVG peut
// contenir du script et servirait à héberger des pages piégées sur notre
// stockage. Aucun réseau social ne publie de SVG de toute façon.
export function isAllowedMediaMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const lower = mime.split(";")[0].trim().toLowerCase();
  if (lower === "image/svg+xml" || lower.includes("svg")) return false;
  return lower.startsWith("image/") || lower.startsWith("video/");
}

/** Types acceptés pour l'envoi direct navigateur → Vercel Blob. */
export const DIRECT_UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "video/*"
];

/**
 * Type réel d'un fichier d'après ses premiers octets (signature), pour ne
 * jamais se fier au nom ni au type annoncé par l'expéditeur. null = ni une
 * image ni une vidéo reconnue.
 */
export function sniffMediaMime(buf: Uint8Array): string | null {
  const b = buf;
  const ascii = (start: number, end: number) => String.fromCharCode(...Array.from(b.subarray(start, end)));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (b.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12).toLowerCase();
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

/** Images matricielles (miniatures, photos de profil, logos). */
export function isRasterImageMime(mime: string | null): boolean {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/gif" || mime === "image/webp" || mime === "image/heic" || mime === "image/avif";
}

// ---------------------------------------------------------------------------
// Appartenance des fichiers (audit sécurité, lot 1)
//
// Avant, n'importe quelle adresse *.blob.vercel-storage.com était acceptée
// comme média ou miniature : un utilisateur pouvait déclarer comme
// miniature le fichier d'un autre client, puis supprimer sa publication…
// et le fichier de l'autre client était effacé. Désormais :
//  - seuls les fichiers de NOTRE stockage Blob sont acceptés ;
//  - les nouveaux fichiers sont rangés par propriétaire : b/<marque>/… pour
//    les médias d'une marque, u/<utilisateur>/… pour les images envoyées par
//    un utilisateur (miniatures, photo de profil) ;
//  - une suppression ne vise que des fichiers de la marque concernée.
// ---------------------------------------------------------------------------

/** Hôte de notre stockage Vercel Blob (déduit du jeton), ou null en local. */
export function ownBlobHost(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const storeId = token.split("_")[3];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

export function brandUploadPrefix(brandId: string): string {
  return `b/${brandId}/`;
}

export function userUploadPrefix(userId: string): string {
  return `u/${userId}/`;
}

/**
 * Chemin d'un fichier de NOTRE stockage (sans « / » initial), ou null si
 * l'adresse vient d'ailleurs. En local : « uploads/… ».
 */
export function ownStoragePath(url: string): string | null {
  if (url.startsWith("/uploads/")) return url.includes("..") ? null : url.slice(1);
  try {
    const u = new URL(url);
    const host = ownBlobHost();
    if (u.protocol !== "https:" || !host || u.hostname !== host) return null;
    const path = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    return path.includes("..") ? null : path;
  } catch {
    return null;
  }
}

/** Fichier de notre stockage rangé sous l'un des préfixes donnés. */
export function isOwnFileUnder(url: string, prefixes: string[]): boolean {
  const path = ownStoragePath(url);
  if (!path) return false;
  if (path.startsWith("uploads/")) return true; // disque local (développement)
  return prefixes.some((p) => path.startsWith(p));
}

/** Compatibilité : une adresse de notre stockage (quel que soit son dossier). */
export function isTrustedUploadUrl(url: string): boolean {
  return ownStoragePath(url) !== null;
}
