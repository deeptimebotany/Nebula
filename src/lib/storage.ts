import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

/**
 * Stockage des médias uploadés (vidéos/images du composer).
 *
 * En local (ou tout hébergeur avec disque persistant) : écrit sur disque
 * dans UPLOAD_DIR (./public/uploads par défaut).
 *
 * Sur Vercel (ou tout hébergeur serverless sans disque persistant, ce qui
 * casserait silencieusement les uploads) : dès que la variable d'environnement
 * BLOB_READ_WRITE_TOKEN est présente, les fichiers partent automatiquement
 * vers Vercel Blob et la fonction renvoie son URL publique — aucun autre
 * changement de code n'est nécessaire, le composer et le reste de l'app ne
 * dépendent que de l'URL retournée.
 *
 * Pour utiliser un autre stockage objet (S3, Cloudflare R2...), remplacez le
 * bloc "sinon" ci-dessous par l'appel au SDK correspondant.
 */
export async function saveUploadedFile(file: File): Promise<{
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeName = `${randomUUID()}.${ext}`;
  const mimeType = file.type || "application/octet-stream";

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(safeName, buffer, {
      access: "public",
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return {
      url: blob.url,
      filename: file.name,
      mimeType,
      sizeBytes: buffer.byteLength
    };
  }

  // Pas de jeton Blob : on écrirait sur le disque local, ce qui ne fonctionne
  // pas sur Vercel (système de fichiers en lecture seule en production hors
  // /tmp) et échouait donc silencieusement pour chaque upload. On le signale
  // clairement plutôt que de laisser remonter une erreur système obscure.
  if (process.env.VERCEL) {
    throw new Error(
      "Le stockage des fichiers n'est pas configuré : ajoutez la variable d'environnement BLOB_READ_WRITE_TOKEN dans les paramètres du projet Vercel (Settings → Environment Variables), puis redéployez."
    );
  }

  const uploadDir = process.env.UPLOAD_DIR || "./public/uploads";
  const absoluteDir = path.resolve(process.cwd(), uploadDir.replace(/^\.\//, ""));
  await mkdir(absoluteDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(absoluteDir, safeName), buffer);

  return {
    url: `/uploads/${safeName}`,
    filename: file.name,
    mimeType,
    sizeBytes: buffer.byteLength
  };
}

function extensionForMimeType(mimeType: string): string {
  const known: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg"
  };
  return known[mimeType] || "png";
}

/**
 * Variante de saveUploadedFile pour une image déjà générée en mémoire (ex :
 * miniature ou sticker IA, voir lib/ai/gemini.ts::generateThumbnail /
 * generateStickerPack), reçue en base64 plutôt que comme un File uploadé par
 * un navigateur. Même logique de stockage (Vercel Blob si configuré, sinon
 * disque local) pour que l'app entière ne dépende que de l'URL retournée.
 */
export async function saveGeneratedImage(input: {
  base64: string;
  mimeType: string;
  baseName?: string;
}): Promise<{ url: string }> {
  const ext = extensionForMimeType(input.mimeType);
  const prefix = input.baseName ? `${input.baseName}-` : "";
  const safeName = `${prefix}${randomUUID()}.${ext}`;
  const buffer = Buffer.from(input.base64, "base64");

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(safeName, buffer, {
      access: "public",
      contentType: input.mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return { url: blob.url };
  }

  if (process.env.VERCEL) {
    throw new Error(
      "Le stockage des fichiers n'est pas configuré : ajoutez la variable d'environnement BLOB_READ_WRITE_TOKEN dans les paramètres du projet Vercel (Settings → Environment Variables), puis redéployez."
    );
  }

  const uploadDir = process.env.UPLOAD_DIR || "./public/uploads";
  const absoluteDir = path.resolve(process.cwd(), uploadDir.replace(/^\.\//, ""));
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, safeName), buffer);

  return { url: `/uploads/${safeName}` };
}
