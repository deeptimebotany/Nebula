// Politique commune à tous les chemins d'envoi de médias (formulaire
// multipart /api/upload, envoi direct Vercel Blob via /api/upload/blob-token
// puis /api/upload/register) : mêmes types acceptés, même plafond de taille,
// et seules les URL de notre propre stockage peuvent être enregistrées
// comme média d'une marque.

// 2 Go — largement suffisant pour une vidéo courte, aligné sur
// maximumSizeInBytes de /api/upload/blob-token.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function isAllowedMediaMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const lower = mime.toLowerCase();
  return lower.startsWith("image/") || lower.startsWith("video/");
}

// Vercel Blob sert les fichiers depuis *.public.blob.vercel-storage.com ;
// en développement local, /api/upload écrit sous /uploads/... (chemin
// relatif, voir storage.ts). Toute autre origine est refusée.
export function isTrustedUploadUrl(url: string): boolean {
  if (url.startsWith("/uploads/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}
