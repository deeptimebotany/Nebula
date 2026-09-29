// Nettoyage des métadonnées côté navigateur (29/09/2026, voir
// media-metadata.ts), AVANT l'envoi d'un fichier vers le stockage : les
// fichiers partent directement du navigateur vers Vercel Blob, le serveur ne
// les voit jamais passer. Photos : lues en mémoire (quelques Mo). Vidéos :
// seul l'index « moov » est lu et corrigé (quelques Ko à quelques Mo), le
// reste du fichier est recopié sans être chargé — une vidéo de 2 Go ne pèse
// pas plus lourd en mémoire.
import { isMp4Like, scrubMoovLocation, stripImageMetadata } from "@/lib/media-metadata";

const MAX_MOOV_BYTES = 64 * 1024 * 1024;

function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "mov" ? "video/quicktime" : ext === "mp4" || ext === "m4v" ? "video/mp4" : "";
}

async function readHeader(file: File, offset: number): Promise<{ size: number; type: string; header: number } | null> {
  if (offset + 8 > file.size) return null;
  const b = new Uint8Array(await file.slice(offset, Math.min(offset + 16, file.size)).arrayBuffer());
  let size = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
  const type = String.fromCharCode(b[4], b[5], b[6], b[7]);
  let header = 8;
  if (size === 1) {
    if (b.length < 16) return null;
    size = (((b[8] << 24) >>> 0) + (b[9] << 16) + (b[10] << 8) + b[11]) * 2 ** 32 + ((b[12] << 24) >>> 0) + (b[13] << 16) + (b[14] << 8) + b[15];
    header = 16;
  } else if (size === 0) size = file.size - offset;
  if (size < header) return null;
  return { size, type, header };
}

async function cleanVideo(file: File, type: string): Promise<File> {
  let offset = 0;
  for (let guard = 0; guard < 64; guard++) {
    const box = await readHeader(file, offset);
    if (!box) return file;
    if (box.type === "moov") {
      if (box.size > MAX_MOOV_BYTES || offset + box.size > file.size) return file;
      const moov = new Uint8Array(await file.slice(offset, offset + box.size).arrayBuffer());
      if (scrubMoovLocation(moov) === 0) return file;
      return new File([file.slice(0, offset), moov, file.slice(offset + box.size)], file.name, { type, lastModified: file.lastModified });
    }
    offset += box.size;
  }
  return file;
}

/** Même fichier, sans métadonnées cachées (ou tel quel si rien à retirer / format inconnu). */
export async function cleanMediaFile(file: File): Promise<File> {
  const type = mimeOf(file);
  try {
    if (type === "image/jpeg" || type === "image/png" || type === "image/webp") {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const clean = stripImageMetadata(bytes, type);
      return clean === bytes ? file : new File([clean as Uint8Array<ArrayBuffer>], file.name, { type, lastModified: file.lastModified });
    }
    if (isMp4Like(type)) return await cleanVideo(file, type);
  } catch {
    // En cas de souci inattendu, on envoie le fichier d'origine plutôt que rien.
  }
  return file;
}
