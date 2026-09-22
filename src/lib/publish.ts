import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";
import { markEasterEggFound } from "@/lib/easter-eggs/server";

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

// Easter egg "Centenaire" : 100ᵉ post PERSONNEL publié (par auteur, pas
// global comme GLOBAL_PUBLISH_MILESTONES ci-dessus) — même logique
// d'égalité stricte, exacte pour la même raison.
const PERSONAL_PUBLISH_MILESTONE = 100;

async function checkPersonalPublishMilestone(userId: string): Promise<boolean> {
  const total = await prisma.post.count({ where: { status: "PUBLISHED", createdById: userId } });
  return total === PERSONAL_PUBLISH_MILESTONE;
}

// Easter egg "Son Décollage" (#45, dernier easter egg réel de ce lot — voir
// easter-eggs-registry.ts) : débloque l'option de son de publication dans
// Paramètres au 10ᵉ post personnel PUBLIÉ, immédiat OU programmé confondus
// (donc vérifié ici, dans publishPost(), qui est le point de passage commun
// aux deux — pas seulement à la publication immédiate).
const PUBLISH_SOUND_UNLOCK_THRESHOLD = 10;

async function checkPublishSoundUnlock(userId: string): Promise<boolean> {
  const total = await prisma.post.count({ where: { status: "PUBLISHED", createdById: userId } });
  return total === PUBLISH_SOUND_UNLOCK_THRESHOLD;
}

// Easter egg "Pluie d'étincelles" (#46, quatrième vague — voir
// easter-eggs-registry.ts) : débloque le fond animé "Pluie de météores" au
// 3ᵉ post personnel PUBLIÉ le même jour. Approximation documentée comme les
// autres triggers datés de ce fichier : "le même jour" = la date du SERVEUR
// au moment où CE post passe à PUBLISHED (post.updatedAt, pas de fuseau
// horaire par compte stocké en base), et on se base sur ce même instant
// plutôt que sur createdAt pour compter un post programmé qui vient
// seulement MAINTENANT de basculer en PUBLISHED.
const METEOR_SHOWER_UNLOCK_THRESHOLD = 3;

async function checkMeteorShowerUnlock(userId: string): Promise<boolean> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const total = await prisma.post.count({
    where: { status: "PUBLISHED", createdById: userId, updatedAt: { gte: startOfToday } }
  });
  return total === METEOR_SHOWER_UNLOCK_THRESHOLD;
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
  // Crédite l'easter egg "Jalon de publications" à l'auteur du post qui fait
  // franchir le palier — pas à toute l'équipe, seulement à qui a déclenché
  // publishPost() pour CE post précis.
  if (milestone !== null) {
    await markEasterEggFound(post.createdById, "publish-milestone");
  }

  if (finalStatus === "PUBLISHED") {
    // Easter egg "Centenaire" (100ᵉ post personnel).
    if (await checkPersonalPublishMilestone(post.createdById)) {
      await markEasterEggFound(post.createdById, "posts-100");
    }
    // Easter egg "Son Décollage" (10ᵉ post personnel, voir plus haut).
    if (await checkPublishSoundUnlock(post.createdById)) {
      await markEasterEggFound(post.createdById, "publish-sound-unlock");
    }
    // Easter egg "Pluie d'étincelles" (3ᵉ post personnel du jour, voir plus haut).
    if (await checkMeteorShowerUnlock(post.createdById)) {
      await markEasterEggFound(post.createdById, "meteor-shower-unlock");
    }
    // Easter egg "Auto-référence" (#nebula dans la légende) — vérifié à la
    // publication effective plutôt qu'à la création du post, pour ne pas
    // récompenser un brouillon jamais publié.
    if (post.caption.toLowerCase().includes("#nebula")) {
      await markEasterEggFound(post.createdById, "hashtag-nebula");
    }
    // Easter egg "Lève-tôt malgré lui" : heure du SERVEUR au moment de la
    // publication effective (pas de fuseau horaire par compte stocké en
    // base) — approximation documentée, comme pour "Supernova analytique".
    const hour = new Date().getHours();
    if (hour >= 3 && hour < 5) {
      await markEasterEggFound(post.createdById, "early-bird-post");
    }
  }

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
