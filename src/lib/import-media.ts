// Rapatriement en tâche de fond des médias référencés par un import CSV
// (brief growth, lot G6.a) : pour chaque brouillon importé qui a encore une
// `sourceMediaUrl`, on télécharge le fichier (HTTPS, image ou vidéo selon la
// politique d'envoi, 100 Mo maximum ici pour rester dans les limites d'une
// fonction serverless), on l'enregistre dans notre stockage (Vercel Blob ou
// disque local, voir storage.ts) et on l'attache à la publication. Trois
// essais maximum ; au-delà, la fiche invite à ajouter le média à la main.
// Appelée par /api/cron et scripts/worker.ts, quelques fichiers par passage.
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/storage";
import { isAllowedMediaMime } from "@/lib/upload-policy";

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const MAX_ATTEMPTS = 3;

function guessMime(url: string, header: string | null): string | null {
  if (header && isAllowedMediaMime(header.split(";")[0])) return header.split(";")[0].trim();
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const table: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm" };
  return table[ext] ?? null;
}

export async function fetchPendingImportMedia(limit = 4): Promise<{ done: number; failed: number }> {
  const pending = await prisma.post.findMany({
    where: { sourceMediaUrl: { not: null }, sourceMediaAttempts: { lt: MAX_ATTEMPTS }, media: { none: {} } },
    select: { id: true, brandId: true, sourceMediaUrl: true, sourceMediaAttempts: true },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  let done = 0;
  let failed = 0;
  for (const post of pending) {
    const url = post.sourceMediaUrl as string;
    // Compteur incrémenté AVANT l'essai : un crash en cours de route ne
    // relance pas la même URL indéfiniment.
    await prisma.post.update({ where: { id: post.id }, data: { sourceMediaAttempts: { increment: 1 } } });
    try {
      if (!/^https:\/\//i.test(url)) throw new Error("URL non HTTPS");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "NebulaImport/1.0 (+https://nebulahub.space)" } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const mime = guessMime(url, res.headers.get("content-type"));
      if (!mime) throw new Error("type de fichier non accepté");
      const length = Number(res.headers.get("content-length") ?? "0");
      if (length > MAX_IMPORT_BYTES) throw new Error("fichier trop volumineux");
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > MAX_IMPORT_BYTES) throw new Error("fichier trop volumineux");
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ?? "bin";
      const file = new File([buffer], `import-${post.id}.${ext}`, { type: mime });
      const saved = await saveUploadedFile(file);
      const asset = await prisma.mediaAsset.create({
        data: { brandId: post.brandId, type: mime.startsWith("video") ? "VIDEO" : "IMAGE", url: saved.url, filename: saved.filename, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes }
      });
      await prisma.post.update({ where: { id: post.id }, data: { media: { create: { mediaAssetId: asset.id, order: 0 } }, sourceMediaUrl: null } });
      done += 1;
    } catch (err) {
      failed += 1;
      console.warn("[import-media] média non rapatrié :", post.id, (err as Error).message);
    }
  }
  return { done, failed };
}
