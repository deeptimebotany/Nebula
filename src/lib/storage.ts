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
 * Même mécanisme de stockage que saveUploadedFile() ci-dessus, mais pour une
 * image générée côté serveur (base64 en mémoire, pas de File issu d'un
 * formulaire) — utilisé pour le pack d'emojis Premium généré par IA (voir
 * src/lib/ai/gemini.ts::generateStickerPack et
 * /api/premium/reactions/generate).
 */
export async function saveGeneratedImage(input: {
  base64: string;
  mimeType: string;
  baseName: string;
}): Promise<{ url: string }> {
  const ext = input.mimeType.includes("png") ? "png" : input.mimeType.includes("webp") ? "webp" : "jpg";
  const safeName = `${input.baseName}-${randomUUID()}.${ext}`;
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
