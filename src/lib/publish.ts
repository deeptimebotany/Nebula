import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";

// Paliers de publications GLOBAUX (tous comptes/marques confondus, pas par
// marque : une seule marque n'atteindra jamais 100 000 ou 1 000 000 posts) —
// voir milestone-celebration.tsx pour l'animation associée à chaque palier.
// On compte les Post passés au statut "PUBLISHED" (succès complet sur tous
// leurs réseaux cibles), une seule fois chacun.
const GLOBAL_PUBLISH_MILESTONES = [100, 1000, 100_000, 1_000_000] as const;

async function checkGlobalPublishMilestone(): Promise<number | null> {
  const totalPublished = await prisma.post.count({ where: { status: "PUBLISHED" } });
  // Chaque appel à publishPost() fait franchir le total d'exactement 1 (un
  // post donné ne passe qu'une fois de "pas encore publié" à "PUBLISHED") :
  // une égalité stricte suffit donc à détecter le franchissement, sans
  // risquer de re-déclencher à toutes les publications suivantes.
  return GLOBAL_PUBLISH_MILESTONES.find((m) => totalPublished === m) ?? null;
}

/**
 * Publie effectivement un Post sur chacun de ses réseaux cibles, en appelant
 * le vrai client d'intégration (src/lib/social/*). Utilisé à la fois pour la
 * publication immédiate (composer) et par le worker planifié (scripts/worker.ts
 * ou /api/cron) pour les posts programmés arrivés à échéance.
 */
export async function publishPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      media: { include: { mediaAsset: true }, orderBy: { order: "asc" } },
      targets: { include: { connection: true } }
    }
  });
  if (!post) throw new Error(`Post ${postId} introuvable.`);

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const mediaUrls = post.media.map((m: { mediaAsset: { url: string; type: string } }) =>
    m.mediaAsset.url.startsWith("http") ? m.mediaAsset.url : `${baseUrl}${m.mediaAsset.url}`
  );
  const mediaType = post.media[0]?.mediaAsset.type === "VIDEO" ? "VIDEO" : "IMAGE";

  await prisma.post.update({ where: { id: post.id }, data: { status: "PUBLISHING" } });

  let successCount = 0;
  let failureCount = 0;

  for (const target of post.targets) {
    if (target.status === "PUBLISHED") {
      successCount++;
      continue;
    }
    try {
      await prisma.postTarget.update({ where: { id: target.id }, data: { status: "PUBLISHING" } });

      const client = getSocialClient(target.network as Network);
      const result = await client.publishPost(target.connection, {
        title: target.titleOverride || post.title,
        caption: target.captionOverride || post.caption,
        mediaUrls,
        mediaType
      });

      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          externalPostId: result.externalPostId,
          externalUrl: result.externalUrl,
          publishedAt: new Date(),
          errorMessage: null,
          attempts: { increment: 1 }
        }
      });
      successCount++;

      // "Premier commentaire" (bulle du Composer/Importation) : best-effort,
      // ne fait jamais échouer la publication elle-même. Certains réseaux ne
      // le supportent pas encore (postComment absent du client) — on ignore
      // simplement dans ce cas.
      if (post.firstComment && client.postComment) {
        await client.postComment(target.connection, result.externalPostId, post.firstComment).catch((err) => {
          console.error(`[premier commentaire] échec sur ${target.network} pour le post ${post.id} :`, err);
        });
      }
    } catch (err) {
      failureCount++;
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          errorMessage: (err as Error).message,
          attempts: { increment: 1 }
        }
      });
    }
  }

  const finalStatus =
    failureCount === 0 ? "PUBLISHED" : successCount === 0 ? "FAILED" : "PARTIAL";
  await prisma.post.update({ where: { id: post.id }, data: { status: finalStatus } });

  // Uniquement pertinent quand CE post vient de passer à "PUBLISHED" — pas
  // pour un post déjà publié (aucune requête inutile) ni pour un échec
  // partiel/total (rien à célébrer).
  const milestone = finalStatus === "PUBLISHED" ? await checkGlobalPublishMilestone() : null;

  return { successCount, failureCount, status: finalStatus, milestone };
}

/** Cherche tous les posts programmés arrivés à échéance et les publie. */
export async function runDuePosts() {
  const due = await prisma.post.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true }
  });

  const results = [];
  for (const post of due) {
    try {
      results.push({ postId: post.id, ...(await publishPost(post.id)) });
    } catch (err) {
      results.push({ postId: post.id, error: (err as Error).message });
    }
  }
  return results;
}
