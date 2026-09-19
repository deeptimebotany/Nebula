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
