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

/**
 * Supprime réellement un fichier précédemment renvoyé par saveUploadedFile
 * (Vercel Blob si BLOB_READ_WRITE_TOKEN est configuré, sinon le disque
 * local) — utilisé quand un MediaAsset n'est plus référencé par aucune
 * publication, pour ne pas accumuler indéfiniment des fichiers orphelins
 * dans le quota de stockage (voir DELETE /api/posts/[id] et
 * /api/dev/cleanup-media). Ne lève jamais : un fichier déjà absent (ex.
 * déjà nettoyé) ne doit pas faire échouer l'appelant.
 */
export async function deleteUploadedFile(url: string): Promise<void> {
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN && /^https?:\/\//.test(url)) {
      const { del } = await import("@vercel/blob");
      await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return;
    }
    if (url.startsWith("/uploads/")) {
      const uploadDir = process.env.UPLOAD_DIR || "./public/uploads";
      const absoluteDir = path.resolve(process.cwd(), uploadDir.replace(/^\.\//, ""));
      const { unlink } = await import("fs/promises");
      await unlink(path.join(absoluteDir, path.basename(url)));
    }
  } catch (err) {
    console.error(`[storage] suppression du fichier ${url} échouée (ignorée) :`, err);
  }
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

/**
 * Enregistre un média téléchargé depuis une autre plateforme (lot 3 : import
 * Google Drive, Dropbox, OneDrive, Unsplash, Canva), en flux : le fichier ne
 * passe jamais entièrement en mémoire, ce qui permet d'importer des vidéos
 * lourdes. Même stockage que saveUploadedFile (Vercel Blob, sinon disque).
 */
export async function saveRemoteMedia(input: {
  body: ReadableStream<Uint8Array>;
  mimeType: string;
  filename: string;
}): Promise<{ url: string }> {
  const fromName = input.filename.includes(".") ? input.filename.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const ext = fromName || (input.mimeType.startsWith("video/") ? "mp4" : extensionForMimeType(input.mimeType));
  const safeName = `${randomUUID()}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(safeName, input.body, {
      access: "public",
      contentType: input.mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      multipart: true
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
  const buffer = Buffer.from(await new Response(input.body).arrayBuffer());
  await writeFile(path.join(absoluteDir, safeName), buffer);
  return { url: `/uploads/${safeName}` };
}
