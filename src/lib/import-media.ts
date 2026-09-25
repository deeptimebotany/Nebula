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
import { fetchPublic, readBodyCapped } from "@/lib/net-safety";
import { sniffMediaMime } from "@/lib/upload-policy";
import { brandUploadPrefix } from "@/lib/upload-policy";

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const MAX_ATTEMPTS = 3;

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
      // Audit sécurité (lot 1) : avant, seul « https:// » était vérifié puis
      // les redirections suivies — une adresse piégée pouvait faire lire au
      // serveur un service interne, dont la réponse devenait un média
      // téléchargeable. fetchPublic refuse toute adresse non publique (à
      // chaque redirection et au moment de la connexion), la lecture
      // s'arrête à 100 Mo, et le type vient du CONTENU du fichier (signature
      // d'image/vidéo), jamais de l'extension de l'adresse.
      const res = await fetchPublic(url, { timeoutMs: 20000, headers: { "user-agent": "NebulaImport/1.0 (+https://nebulahub.space)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await readBodyCapped(res, MAX_IMPORT_BYTES);
      const mime = sniffMediaMime(buffer);
      if (!mime) throw new Error("type de fichier non accepté (image ou vidéo attendue)");
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ?? "bin";
      const file = new File([new Uint8Array(buffer)], `import-${post.id}.${ext}`, { type: mime });
      const saved = await saveUploadedFile(file, { prefix: brandUploadPrefix(post.brandId), mimeType: mime });
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
