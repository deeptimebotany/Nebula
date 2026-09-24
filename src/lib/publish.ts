import { prisma } from "@/lib/prisma";
import { sendPublishFailureEmail } from "@/lib/email";
import { getSocialClient } from "@/lib/social";
import type { PublishLocation, YoutubeOptions } from "@/lib/social/base";
import type { Network } from "@/lib/types";
import { markEasterEggFound } from "@/lib/easter-eggs/server";

// Mention ajoutée à la légende Instagram/Facebook quand « Contenu généré par
// l'IA » est coché : Meta n'offre pas de champ d'API pour l'étiquette IA.
export const AI_CAPTION_MENTION = "✨ Contenu créé avec l'aide de l'IA";

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

// Easter egg "Son Décollage" (#44, dernier easter egg réel de ce lot — voir
// easter-eggs-registry.ts) : débloque l'option de son de publication dans
// Paramètres au 10ᵉ post personnel PUBLIÉ, immédiat OU programmé confondus
// (donc vérifié ici, dans publishPost(), qui est le point de passage commun
// aux deux — pas seulement à la publication immédiate).
const PUBLISH_SOUND_UNLOCK_THRESHOLD = 10;

async function checkPublishSoundUnlock(userId: string): Promise<boolean> {
  const total = await prisma.post.count({ where: { status: "PUBLISHED", createdById: userId } });
  return total === PUBLISH_SOUND_UNLOCK_THRESHOLD;
}

// Easter egg "Pluie d'étincelles" (#45, quatrième vague — voir
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
      // Option « Contenu généré par l'IA » (voir PublishInput.aiGenerated).
      const aiGenerated = Boolean((target.metadata as { aiGenerated?: boolean } | null)?.aiGenerated);
      // Lieu choisi dans le Composer (voir PublishInput.location).
      const rawLocation = (target.metadata as { location?: PublishLocation } | null)?.location;
      const location = rawLocation && typeof rawLocation.id === "string" && rawLocation.id ? rawLocation : undefined;
      const baseCaption = target.captionOverride || post.caption;
      const caption =
        aiGenerated && (target.network === "INSTAGRAM" || target.network === "FACEBOOK") && !baseCaption.includes(AI_CAPTION_MENTION)
          ? `${baseCaption}${baseCaption.trim() ? "\n\n" : ""}${AI_CAPTION_MENTION}`
          : baseCaption;
      const result = await client.publishPost(target.connection, {
        title: target.titleOverride || post.title,
        caption,
        aiGenerated,
        ...(location ? { location } : {}),
        mediaUrls,
        mediaType,
        // Préréglages propres à ce réseau (ex. YouTube : confidentialité,
        // "fait pour les enfants", catégorie, tags, playlist, notifier les
        // abonnés — voir composer-types.ts → YoutubeOptions). target.metadata
        // est un JSON libre en base (voir schema.prisma) ; chaque client
        // (youtube.ts, etc.) ignore ce qu'il ne connaît pas.
        ...(target.network === "YOUTUBE" && target.metadata ? { youtube: target.metadata as YoutubeOptions } : {})
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

/**
 * Prévient l'auteur d'une publication programmée dont l'envoi vient
 * d'échouer (voir User.notifyOnFailure et sendPublishFailureEmail). Jamais
 * bloquant : un problème d'email ne doit pas empêcher le worker de
 * continuer avec les publications suivantes.
 */
async function notifyScheduledFailure(postId: string, status: string) {
  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        brand: { select: { name: true } },
        createdBy: { select: { email: true, notifyOnFailure: true } },
        targets: { where: { status: "FAILED" }, select: { network: true, errorMessage: true } }
      }
    });
    if (!post || !post.createdBy?.email) return;
    if ((post.createdBy.notifyOnFailure as boolean | null | undefined) === false) return;
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const result = await sendPublishFailureEmail({
      to: post.createdBy.email,
      brandName: post.brand.name,
      postTitle: post.title || post.caption.split("\n")[0] || "",
      postUrl: `${baseUrl}/posts/${post.id}`,
      failures: post.targets.map((t: { network: string; errorMessage: string | null }) => ({ network: t.network, message: t.errorMessage ?? "" })),
      partial: status === "PARTIAL"
    });
    if (!result.ok) console.error("[notification d'échec] email non envoyé :", result.error);
  } catch (err) {
    console.error("[notification d'échec]", (err as Error).message);
  }
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
      const outcome = await publishPost(post.id);
      results.push({ postId: post.id, ...outcome });
      if (outcome.status === "FAILED" || outcome.status === "PARTIAL") {
        await notifyScheduledFailure(post.id, outcome.status);
      }
    } catch (err) {
      results.push({ postId: post.id, error: (err as Error).message });
    }
  }
  return results;
}
