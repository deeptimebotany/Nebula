import { refreshReussites } from "@/lib/reussites/engine";
import { prisma } from "@/lib/prisma";
import { sendPublishFailureEmail } from "@/lib/email";
import { Prisma } from "@prisma/client";
import { getSocialClient } from "@/lib/social";
import {
  isPendingPublish,
  type PinterestOptions,
  type PublishCheckpoint,
  type PublishInput,
  type PublishLocation,
  type PublishOutcome,
  type YoutubeOptions
} from "@/lib/social/base";
import type { Network, PublishResult } from "@/lib/types";
import { markEasterEggFound } from "@/lib/easter-eggs/server";
import { notify, listNetworks, networkLabel, looksLikeAuthError } from "@/lib/notifications";
import { emitWebhookEvent, postPayload } from "@/lib/webhooks";
import { SocialApiError } from "@/lib/social/base";
import { classifyProviderError, MAX_AUTO_RETRIES, retryDelayMs } from "@/lib/social/errors";
import { MAX_PAUSE_WAIT_MS, pauseMessage, publishPause, recordProviderFailure, recordProviderSuccess } from "@/lib/social/network-control";
import { flagConnectionForReconnect } from "@/lib/social/connection-health";
import { matchRecentPost } from "@/lib/social/reconcile";

// Mention ajoutée à la légende Instagram/Facebook quand « Contenu généré par
// l'IA » est coché : Meta n'offre pas de champ d'API pour l'étiquette IA.
export const AI_CAPTION_MENTION = "✨ Contenu créé avec l'aide de l'IA";
// Réseaux sans champ « contenu IA » dans leur API : la mention est ajoutée au texte.
const AI_MENTION_NETWORKS = new Set(["INSTAGRAM", "FACEBOOK", "THREADS", "PINTEREST", "LINKEDIN"]);

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

// ---------------------------------------------------------------------------
// Publication fiable (lot 2, 24/09/2026)
//
//  1. Prise atomique : une publication n'est traitée que par celui qui a
//     réussi à la faire passer à PUBLISHING (updateMany conditionnel). Deux
//     passages du cron qui se chevauchent, ou le cron et « Publier
//     maintenant », ne peuvent plus publier deux fois le même post.
//  2. Traitement chez le réseau : quand une vidéo n'est pas encore prête
//     (Instagram, TikTok, Threads, LinkedIn, Pinterest), la cible passe à
//     PROCESSING avec son point de reprise, et le cron la termine
//     (advanceProcessingTargets) — sans jamais republier une étape faite.
//  3. Reprise après interruption : une cible restée « en cours d'envoi »
//     plus de 10 minutes (fonction coupée par Vercel…) passe en échec avec
//     un message qui invite à vérifier sur le réseau ; rien n'est renvoyé
//     automatiquement, pour ne jamais créer de doublon.
//  4. Temps limité : chaque appel à un réseau a un délai (voir fetchJson)
//     et les attentes de traitement s'arrêtent avant la limite de la
//     fonction.
//
// Résilience des API (lot 5) :
//  5. Chaque erreur est classée (src/lib/social/errors.ts). Une limite de
//     débit ou une panne passagère AVEC réponse du réseau (rien n'a été
//     publié) passe en RETRY_WAIT : nouvel essai automatique par le cron
//     après 2, 10 puis 30 minutes (ou le délai demandé par le réseau), 3
//     fois au plus. Un délai dépassé n'est jamais renvoyé tout seul.
//  6. Connexion expirée : le compte passe « à reconnecter » (voir
//     connection-health.ts) et ses éditeurs sont prévenus.
//  7. Réseau suspendu (interrupteur manuel ou disjoncteur, voir
//     network-control.ts) : la cible attend en RETRY_WAIT (catégorie
//     PAUSED) sans appeler le réseau, et part à la reprise — 24 h au plus.
//
// « Déjà en ligne ? » (lot 6, voir social/reconcile.ts) :
//  8. Délai dépassé pendant un envoi : au lieu d'un échec immédiat, la
//     cible attend 5 min (RETRY_WAIT, catégorie VERIFY) puis Nebula
//     cherche la publication sur le réseau. Trouvée → publiée ; sinon
//     échec, sans jamais renvoyer tout seul.
//  9. Envoi interrompu (cron) et relance manuelle d'un envoi incertain :
//     même vérification AVANT tout nouvel envoi.
// ---------------------------------------------------------------------------

/** Temps de travail d'une publication dans une requête (limite Vercel : 60 s). */
const PUBLISH_BUDGET_MS = 40_000;
/** Une cible « en cours d'envoi » depuis plus longtemps a été interrompue. */
const INTERRUPTED_AFTER_MS = 10 * 60_000;
/** Au-delà, un réseau qui « traite encore » la vidéo est considéré en échec. */
const PROCESSING_TIMEOUT_MS = 60 * 60_000;
/** Statuts depuis lesquels « Publier maintenant » peut (re)lancer une publication. */
const PUBLISHABLE_STATUSES = ["DRAFT", "SCHEDULED", "FAILED", "PARTIAL"];

export class PublishInProgressError extends Error {
  constructor() {
    super("Cette publication est déjà en cours d'envoi : patientez quelques instants.");
  }
}

/** Prend la publication pour l'envoyer (atomique) : vrai si c'est nous qui l'avons prise. */
export async function claimPostForPublishing(postId: string, from: string[] = PUBLISHABLE_STATUSES): Promise<boolean> {
  const { count } = await prisma.post.updateMany({
    where: { id: postId, status: { in: from } },
    data: { status: "PUBLISHING", publishingStartedAt: new Date() }
  });
  return count === 1;
}

async function loadPostForPublishing(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      media: { include: { mediaAsset: true }, orderBy: { order: "asc" } },
      targets: { include: { connection: true } }
    }
  });
}

type PostForPublishing = NonNullable<Awaited<ReturnType<typeof loadPostForPublishing>>>;
type TargetForPublishing = PostForPublishing["targets"][number];

/** Contenu à envoyer à UN réseau (légende propre au réseau, options, lieu…). */
function buildPublishInput(post: PostForPublishing, target: TargetForPublishing, waitUntil: number): PublishInput {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const mediaUrls = post.media.map((m: { mediaAsset: { url: string } }) =>
    m.mediaAsset.url.startsWith("http") ? m.mediaAsset.url : `${baseUrl}${m.mediaAsset.url}`
  );
  const mediaType = post.media[0]?.mediaAsset.type === "VIDEO" ? "VIDEO" : "IMAGE";
  // Miniature choisie dans Publier (vidéo) : adresse publique, comme les médias.
  const rawThumb = mediaType === "VIDEO" ? (post.media[0]?.mediaAsset as { thumbnailUrl?: string | null } | undefined)?.thumbnailUrl : null;
  const thumbnailUrl = rawThumb ? (rawThumb.startsWith("http") ? rawThumb : `${baseUrl}${rawThumb}`) : undefined;
  // Option « Contenu généré par l'IA » (voir PublishInput.aiGenerated).
  const aiGenerated = Boolean((target.metadata as { aiGenerated?: boolean } | null)?.aiGenerated);
  // Lieu choisi dans le Composer (voir PublishInput.location).
  const rawLocation = (target.metadata as { location?: PublishLocation } | null)?.location;
  const location = rawLocation && typeof rawLocation.id === "string" && rawLocation.id ? rawLocation : undefined;
  const baseCaption = target.captionOverride || post.caption;
  const caption =
    aiGenerated && AI_MENTION_NETWORKS.has(target.network) && !baseCaption.includes(AI_CAPTION_MENTION)
      ? `${baseCaption}${baseCaption.trim() ? "\n\n" : ""}${AI_CAPTION_MENTION}`
      : baseCaption;
  return {
    title: target.titleOverride || post.title,
    caption,
    aiGenerated,
    ...(location ? { location } : {}),
    mediaUrls,
    mediaType,
    waitUntil,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    // Préréglages propres à ce réseau (ex. YouTube : confidentialité,
    // "fait pour les enfants", catégorie, tags, playlist, notifier les
    // abonnés — voir composer-types.ts → YoutubeOptions). target.metadata
    // est un JSON libre en base (voir schema.prisma) ; chaque client
    // (youtube.ts, etc.) ignore ce qu'il ne connaît pas.
    ...(target.network === "YOUTUBE" && target.metadata ? { youtube: target.metadata as YoutubeOptions } : {}),
    // Pinterest : tableau de destination et lien de l'épingle (voir
    // composer-types.ts → PinterestOptions et social/pinterest.ts).
    ...(target.network === "PINTEREST" && target.metadata
      ? { pinterest: (target.metadata as { pinterest?: PinterestOptions }).pinterest }
      : {})
  };
}

type TargetOutcome = "PUBLISHED" | "PROCESSING" | "FAILED" | "RETRY_WAIT";

/**
 * Envoie (ou reprend) la publication sur UN réseau et enregistre le
 * résultat sur la cible. Ne lève jamais : un échec est enregistré.
 * `manual` : lancement par l'utilisateur ou à l'heure prévue (remet à zéro
 * le compteur de relances automatiques).
 */
async function runTarget(
  post: PostForPublishing,
  target: TargetForPublishing,
  waitUntil: number,
  checkpoint: PublishCheckpoint | null,
  options: { manual?: boolean } = {}
): Promise<TargetOutcome> {
  const network = target.network as Network;
  const fail = async (message: string, category: string | null = null) => {
    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        errorCategory: category,
        checkpoint: Prisma.DbNull,
        nextCheckAt: null,
        startedAt: null,
        attempts: { increment: 1 }
      }
    });
    return "FAILED" as const;
  };

  if (target.connection.status === "DISCONNECTED") {
    return fail(`[${target.network}] Ce compte a été déconnecté de Nebula : reconnectez-le dans Comptes, puis relancez la publication.`, "AUTH_EXPIRED");
  }

  // Réseau suspendu (manuellement ou par le disjoncteur) : on attend sans
  // appeler le réseau, 24 h au plus depuis le début de la publication.
  const pause = await publishPause(network);
  if (pause.paused) {
    const since = post.publishingStartedAt ? new Date(post.publishingStartedAt).getTime() : Date.now();
    if (Date.now() - since > MAX_PAUSE_WAIT_MS) {
      return fail(`[${target.network}] Publication sur ${networkLabel(target.network)} toujours suspendue après 24 h : relancez-la quand le réseau sera rétabli.`, "PAUSED");
    }
    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        status: "RETRY_WAIT",
        errorCategory: "PAUSED",
        errorMessage: `[${target.network}] ${pauseMessage(network, pause)}`,
        nextCheckAt: pause.until ?? new Date(Date.now() + 10 * 60_000),
        startedAt: null,
        ...(options.manual ? { autoRetries: 0 } : {}),
        ...(checkpoint ? {} : { checkpoint: Prisma.DbNull })
      }
    });
    return "RETRY_WAIT";
  }

  // Relance manuelle d'un envoi incertain : on vérifie d'abord qu'il n'est
  // pas déjà en ligne (lot 6).
  if (options.manual && target.status === "FAILED" && UNCERTAIN_CATEGORIES.has(target.errorCategory ?? "")) {
    if ((await reconcileTarget(post, target)) === "FOUND") return "PUBLISHED";
  }

  try {
    const attemptAt = new Date();
    await prisma.postTarget.update({
      where: { id: target.id },
      data: { status: "PUBLISHING", startedAt: attemptAt, lastAttemptAt: attemptAt, ...(options.manual ? { autoRetries: 0 } : {}) }
    });
    if (options.manual) target.autoRetries = 0;
    const client = getSocialClient(target.network as Network);
    const input = buildPublishInput(post, target, waitUntil);
    let outcome: PublishOutcome;
    if (checkpoint) {
      if (!client.resumePublish) return await fail(`[${target.network}] Reprise de publication impossible pour ce réseau.`);
      outcome = await client.resumePublish(target.connection, input, checkpoint);
    } else {
      outcome = await client.publishPost(target.connection, input);
    }

    await markNetworkHealthy(target);

    if (isPendingPublish(outcome)) {
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "PROCESSING",
          checkpoint: outcome.checkpoint as Prisma.InputJsonValue,
          nextCheckAt: new Date(Date.now() + (outcome.retryInMs ?? 30_000)),
          processingSince: target.processingSince ?? new Date(),
          startedAt: null,
          errorMessage: null,
          errorCategory: null,
          ...(checkpoint ? {} : { attempts: { increment: 1 } })
        }
      });
      return "PROCESSING";
    }

    const result: PublishResult = outcome;
    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        status: "PUBLISHED",
        externalPostId: result.externalPostId,
        externalUrl: result.externalUrl,
        ...(result.thumbnail ? { thumbnailStatus: result.thumbnail } : {}),
        publishedAt: new Date(),
        errorMessage: null,
        errorCategory: null,
        checkpoint: Prisma.DbNull,
        nextCheckAt: null,
        startedAt: null,
        ...(checkpoint ? {} : { attempts: { increment: 1 } })
      }
    });

    // "Premier commentaire" (bulle du Composer/Importation) : best-effort,
    // ne fait jamais échouer la publication elle-même. Certains réseaux ne
    // le supportent pas encore (postComment absent du client) — on ignore
    // simplement dans ce cas.
    if (post.firstComment && client.postComment) {
      await client.postComment(target.connection, result.externalPostId, post.firstComment).catch((err) => {
        console.error(`[premier commentaire] échec sur ${target.network} pour le post ${post.id} :`, err);
      });
    }
    return "PUBLISHED";
  } catch (err) {
    const message = (err as Error).message;
    const classified = classifyProviderError(err);
    if (err instanceof SocialApiError) await recordProviderFailure(network, classified, message);
    if (classified.needsReconnect) await flagConnectionForReconnect(target.connection, message);

    // Pas de réponse (délai dépassé, connexion coupée) ou réponse illisible
    // (lot 7) : peut-être publié. Vérification sur le réseau dans 5 min,
    // jamais de nouvel envoi (lot 6).
    if (classified.uncertain && getSocialClient(network).listRecentPosts) {
      const label = networkLabel(target.network);
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "RETRY_WAIT",
          errorCategory: "VERIFY",
          errorMessage:
            classified.category === "UNEXPECTED_RESPONSE"
              ? `[${target.network}] ${label} a répondu dans un format inattendu : Nebula vérifie dans quelques minutes si la publication est en ligne (aucun nouvel envoi).`
              : `[${target.network}] ${label} n'a pas répondu à temps : Nebula vérifie dans quelques minutes si la publication est en ligne (aucun nouvel envoi).`,
          nextCheckAt: new Date(Date.now() + VERIFY_DELAY_MS),
          startedAt: null,
          checkpoint: checkpoint ? (checkpoint as Prisma.InputJsonValue) : Prisma.DbNull
        }
      });
      return "RETRY_WAIT";
    }

    // Rien n'a été publié (refus explicite ou panne avec réponse) : nouvel
    // essai automatique plus tard, depuis le même point de reprise.
    const done = target.autoRetries ?? 0;
    if (classified.autoRetry && done < MAX_AUTO_RETRIES) {
      const retry = done + 1;
      const at = new Date(Date.now() + retryDelayMs(retry, classified.retryAfterMs));
      const hour = at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "RETRY_WAIT",
          errorCategory: classified.category,
          errorMessage: `${message} — nouvel essai automatique vers ${hour} (${retry}/${MAX_AUTO_RETRIES}).`,
          nextCheckAt: at,
          autoRetries: retry,
          startedAt: null,
          checkpoint: checkpoint ? (checkpoint as Prisma.InputJsonValue) : Prisma.DbNull
        }
      });
      return "RETRY_WAIT";
    }
    return fail(message, classified.category);
  }
}

/** Délai avant de chercher sur le réseau une publication envoyée sans réponse. */
const VERIFY_DELAY_MS = 5 * 60_000;

/**
 * Échecs après lesquels l'envoi a PEUT-ÊTRE abouti : une relance manuelle
 * cherche d'abord la publication sur le réseau (lots 6 et 7).
 */
const UNCERTAIN_CATEGORIES = new Set(["TIMEOUT", "INTERRUPTED", "UNEXPECTED_RESPONSE"]);

/**
 * « Déjà en ligne ? » : cherche la publication parmi les dernières du compte
 * (voir social/reconcile.ts). FOUND : la cible est marquée publiée.
 * UNSUPPORTED : le réseau ne permet pas de vérifier (ou la liste a échoué).
 */
export async function reconcileTarget(post: PostForPublishing, target: TargetForPublishing): Promise<"FOUND" | "NOT_FOUND" | "UNSUPPORTED"> {
  const network = target.network as Network;
  const client = getSocialClient(network);
  if (!client.listRecentPosts || !target.lastAttemptAt) return "UNSUPPORTED";
  let recent;
  try {
    recent = await client.listRecentPosts(target.connection);
  } catch (err) {
    console.error(`[publication] vérification « déjà en ligne » impossible sur ${network} :`, (err as Error).message);
    return "UNSUPPORTED";
  }
  // Publications déjà rattachées à d'autres publications Nebula : exclues.
  const known = await prisma.postTarget.findMany({
    where: { connectionId: target.connectionId, externalPostId: { in: recent.map((r) => r.externalPostId) }, NOT: { id: target.id } },
    select: { externalPostId: true }
  });
  const input = buildPublishInput(post, target, Date.now());
  const match = matchRecentPost(recent, {
    text: network === "YOUTUBE" ? input.title : input.caption,
    since: new Date(target.lastAttemptAt),
    until: new Date(),
    excludeIds: (known as { externalPostId: string | null }[]).map((k) => k.externalPostId ?? "")
  });
  if (!match) return "NOT_FOUND";
  await prisma.postTarget.update({
    where: { id: target.id },
    data: {
      status: "PUBLISHED",
      externalPostId: match.externalPostId,
      externalUrl: match.permalink ?? null,
      publishedAt: match.publishedAt ?? new Date(),
      errorMessage: null,
      errorCategory: null,
      checkpoint: Prisma.DbNull,
      nextCheckAt: null,
      startedAt: null
    }
  });
  return "FOUND";
}

/** Le réseau a répondu normalement : compteur de pannes à zéro, compte rétabli. */
async function markNetworkHealthy(target: TargetForPublishing) {
  await recordProviderSuccess(target.network as Network);
  if (target.connection.status === "EXPIRED") {
    await prisma.socialConnection
      .updateMany({ where: { id: target.connection.id, status: "EXPIRED" }, data: { status: "CONNECTED", lastError: null } })
      .catch(() => undefined);
  }
}

/**
 * Publie effectivement un Post sur chacun de ses réseaux cibles, en appelant
 * le vrai client d'intégration (src/lib/social/*). Utilisé à la fois pour la
 * publication immédiate (composer) et par le worker planifié (scripts/worker.ts
 * ou /api/cron) pour les posts programmés arrivés à échéance.
 *
 * Prend d'abord la publication (sauf si l'appelant l'a déjà fait) : lève
 * PublishInProgressError si elle est déjà en cours d'envoi.
 */
export async function publishPost(postId: string, options: { alreadyClaimed?: boolean; deadline?: number } = {}) {
  if (!options.alreadyClaimed && !(await claimPostForPublishing(postId))) {
    const exists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!exists) throw new Error(`Post ${postId} introuvable.`);
    throw new PublishInProgressError();
  }
  const post = await loadPostForPublishing(postId);
  if (!post) throw new Error(`Post ${postId} introuvable.`);

  const deadline = options.deadline ?? Date.now() + PUBLISH_BUDGET_MS;
  for (const target of post.targets) {
    // Déjà en ligne (relance après un échec partiel) ou en traitement chez le réseau.
    if (target.status === "PUBLISHED" || target.status === "PROCESSING") continue;
    await runTarget(post, target, deadline, null, { manual: true });
  }
  return finalizePostIfDone(post.id);
}

/**
 * Termine une publication quand plus aucune cible n'est en cours : statut
 * final, notifications, webhooks, easter eggs. Le passage PUBLISHING →
 * statut final est lui aussi atomique : deux traitements simultanés
 * n'envoient pas deux fois les notifications.
 */
export async function finalizePostIfDone(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { targets: { select: { network: true, status: true, errorMessage: true, errorCategory: true } } }
  });
  if (!post) throw new Error(`Post ${postId} introuvable.`);
  const targets = post.targets as { network: string; status: string; errorMessage: string | null; errorCategory: string | null }[];
  const okNetworks = targets.filter((t) => t.status === "PUBLISHED").map((t) => t.network);
  const failed = targets
    .filter((t) => t.status === "FAILED")
    .map((t) => ({ network: t.network, message: (t.errorMessage ?? "").replace(/^\[[A-Z_]+\]\s*/, ""), category: t.errorCategory }));
  const successCount = okNetworks.length;
  const failureCount = failed.length;

  // Encore en cours : envoi, traitement chez le réseau ou relance prévue.
  if (targets.some((t) => t.status === "PUBLISHING" || t.status === "PROCESSING" || t.status === "RETRY_WAIT")) {
    return { successCount, failureCount, status: "PROCESSING" as const, milestone: null as number | null };
  }

  const finalStatus = failureCount === 0 ? "PUBLISHED" : successCount === 0 ? "FAILED" : "PARTIAL";
  const { count } = await prisma.post.updateMany({
    where: { id: post.id, status: "PUBLISHING" },
    data: { status: finalStatus, publishingStartedAt: null }
  });
  if (count === 0) {
    // Déjà terminée par un autre traitement.
    return { successCount, failureCount, status: finalStatus, milestone: null as number | null };
  }
  await notifyPublishOutcome(post, finalStatus, okNetworks, failed);
  if (post.scheduledAt && finalStatus !== "PUBLISHED") await notifyScheduledFailure(post.id, finalStatus);

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

  // Réussites : accomplissements de publication et défis de la semaine
  // (seules les publications réellement en ligne comptent).
  if (finalStatus !== "FAILED") await refreshReussites(post.createdById);

  return { successCount, failureCount, status: finalStatus, milestone };
}

/**
 * Cron : termine les publications « en traitement » chez un réseau (vidéos
 * en cours de préparation par Instagram, TikTok…), à partir de leur point
 * de reprise, et relance celles dont le nouvel essai est dû (RETRY_WAIT :
 * panne passagère, limite de débit, réseau suspendu — lot 5).
 */
export async function advanceProcessingTargets(budgetMs = PUBLISH_BUDGET_MS, options: { postId?: string } = {}) {
  const deadline = Date.now() + budgetMs;
  const due = await prisma.postTarget.findMany({
    where: { status: { in: ["PROCESSING", "RETRY_WAIT"] }, nextCheckAt: { lte: new Date() }, ...(options.postId ? { postId: options.postId } : {}) },
    orderBy: { nextCheckAt: "asc" },
    take: 15,
    select: { id: true, postId: true, nextCheckAt: true, status: true }
  });
  const results: { targetId: string; status: string }[] = [];
  for (const row of due) {
    if (Date.now() > deadline - 10_000) break;
    // Prise atomique de la cible : un seul traitement la reprend.
    const { count } = await prisma.postTarget.updateMany({
      where: { id: row.id, status: row.status, nextCheckAt: row.nextCheckAt },
      data: { status: "PUBLISHING", startedAt: new Date() }
    });
    if (count === 0) continue;
    const post = await loadPostForPublishing(row.postId);
    const target = post?.targets.find((t: { id: string }) => t.id === row.id);
    if (!post || !target) continue;
    let status: string;
    const checkpoint = (target.checkpoint as PublishCheckpoint | null) ?? null;
    if (row.status === "PROCESSING" && target.processingSince && Date.now() - new Date(target.processingSince).getTime() > PROCESSING_TIMEOUT_MS) {
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          errorMessage: `[${target.network}] ${networkLabel(target.network)} n'a toujours pas terminé de traiter le média après 1 heure. Vérifiez sur ${networkLabel(target.network)} si la publication est en ligne avant de la relancer.`,
          errorCategory: "TIMEOUT",
          checkpoint: Prisma.DbNull,
          nextCheckAt: null,
          startedAt: null
        }
      });
      status = "FAILED";
    } else if (row.status === "RETRY_WAIT" && target.errorCategory === "VERIFY") {
      // Envoi resté sans réponse : on cherche la publication, jamais de nouvel envoi.
      const found = await reconcileTarget(post, target);
      if (found === "FOUND") {
        status = "PUBLISHED";
      } else {
        const label = networkLabel(target.network);
        await prisma.postTarget.update({
          where: { id: target.id },
          data: {
            status: "FAILED",
            errorCategory: "TIMEOUT",
            errorMessage:
              found === "NOT_FOUND"
                ? `[${target.network}] ${label} n'a pas confirmé l'envoi et la publication n'apparaît pas sur ${label} : vous pouvez la relancer (Nebula vérifiera d'abord qu'elle n'est pas déjà en ligne).`
                : `[${target.network}] ${label} n'a pas confirmé l'envoi. Vérifiez sur ${label} si la publication est en ligne avant de la relancer.`,
            checkpoint: Prisma.DbNull,
            nextCheckAt: null,
            startedAt: null
          }
        });
        status = "FAILED";
      }
    } else if (row.status === "RETRY_WAIT") {
      // Nouvel essai : depuis le point de reprise s'il y en a un, sinon envoi complet.
      status = await runTarget(post, target, deadline, checkpoint);
    } else {
      status = await runTarget(post, target, deadline, checkpoint ?? { step: "unknown" });
    }
    results.push({ targetId: target.id, status });
    await finalizePostIfDone(post.id).catch((err) => console.error("[publication] finalisation :", (err as Error).message));
  }
  return results;
}

/**
 * Cron : publications interrompues (fonction coupée pendant l'envoi,
 * redéploiement…). Une cible restée « en cours d'envoi » passe en échec
 * avec un message qui invite à VÉRIFIER sur le réseau (elle a peut-être été
 * publiée) ; une cible jamais envoyée passe en échec « à relancer ». La
 * publication est ensuite terminée normalement (notification comprise).
 * Rien n'est renvoyé automatiquement : jamais de doublon.
 */
export async function recoverInterruptedPublications() {
  const cutoff = new Date(Date.now() - INTERRUPTED_AFTER_MS);
  const stuckPosts = await prisma.post.findMany({
    where: {
      status: "PUBLISHING",
      OR: [{ publishingStartedAt: { lt: cutoff } }, { publishingStartedAt: null, updatedAt: { lt: cutoff } }],
      // Seulement celles qui ont quelque chose à récupérer : une publication
      // qui attend un traitement ou une relance n'est pas bloquée (lot 5).
      targets: { some: { status: { in: ["PUBLISHING", "PENDING", "SCHEDULED"] } } }
    },
    select: { id: true },
    take: 20
  });
  let recovered = 0;
  for (const { id } of stuckPosts) {
    const targets = await prisma.postTarget.findMany({
      where: { postId: id },
      select: { id: true, network: true, status: true, startedAt: true }
    });
    let full: PostForPublishing | null = null;
    for (const t of targets as { id: string; network: string; status: string; startedAt: Date | null }[]) {
      if (t.status === "PUBLISHING" && (!t.startedAt || t.startedAt < cutoff)) {
        // Interrompu pendant l'envoi : peut-être en ligne. On cherche d'abord
        // la publication sur le réseau (lot 6).
        full ??= await loadPostForPublishing(id);
        const fullTarget = full?.targets.find((x: { id: string }) => x.id === t.id);
        if (full && fullTarget && (await reconcileTarget(full, fullTarget)) === "FOUND") continue;
        await prisma.postTarget.updateMany({
          where: { id: t.id, status: "PUBLISHING" },
          data: {
            status: "FAILED",
            startedAt: null,
            errorCategory: "INTERRUPTED",
            errorMessage: `[${t.network}] L'envoi a été interrompu avant la réponse de ${networkLabel(t.network)}. Vérifiez sur ${networkLabel(t.network)} si la publication est en ligne avant de la relancer.`
          }
        });
      } else if (t.status === "PENDING" || t.status === "SCHEDULED") {
        await prisma.postTarget.updateMany({
          where: { id: t.id, status: t.status },
          data: { status: "FAILED", errorMessage: `[${t.network}] Pas encore envoyée (publication interrompue) : relancez la publication.` }
        });
      }
    }
    const outcome = await finalizePostIfDone(id).catch(() => null);
    if (outcome && outcome.status !== "PROCESSING") recovered++;
  }
  return { recovered };
}

/**
 * Centre de notifications : prévient l'auteur du résultat d'une publication
 * (en ligne, partielle ou en échec). Si l'échec ressemble à une connexion
 * expirée, le bouton de la notification propose directement de reconnecter
 * le compte. Jamais bloquant.
 */
async function notifyPublishOutcome(
  post: { id: string; brandId: string; title: string; caption: string; createdById: string },
  status: string,
  okNetworks: string[],
  failed: { network: string; message: string; category?: string | null }[]
) {
  const label = (post.title || post.caption.split("\n")[0] || "Votre publication").trim();
  const name = label.length > 60 ? `${label.slice(0, 59)}…` : label;
  const href = `/posts/${post.id}`;
  // Webhooks (lot 4) : même moment que la notification.
  await emitWebhookEvent(post.brandId, status === "PUBLISHED" ? "post.published" : "post.failed", await postPayload(post.id));
  if (status === "PUBLISHED") {
    await notify(post.createdById, {
      kind: "publish_ok",
      title: "Publication en ligne",
      body: `« ${name} » est publiée sur ${listNetworks(okNetworks)}.`,
      href,
      dedupeKey: `publish:${post.id}`
    });
    return;
  }
  const auth = failed.find((f) => f.category === "AUTH_EXPIRED" || looksLikeAuthError(f.message));
  const first = failed[0];
  const reason = auth
    ? `la connexion à ${networkLabel(auth.network)} a expiré.`
    : first
      ? `${networkLabel(first.network)} a répondu : ${first.message}`
      : "une erreur est survenue.";
  await notify(post.createdById, {
    kind: "publish_failed",
    title: status === "PARTIAL" ? "Publication partielle" : "Échec de publication",
    body:
      status === "PARTIAL"
        ? `« ${name} » est en ligne sur ${listNetworks(okNetworks)}, mais pas sur ${listNetworks(failed.map((f) => f.network))} : ${reason}`
        : `« ${name} » n'a pas pu être publiée : ${reason}`,
    href: auth ? "/accounts" : href,
    actionLabel: auth ? `Reconnecter ${networkLabel(auth.network)}` : "Voir la publication",
    dedupeKey: `publish:${post.id}`
  });
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

/**
 * Cherche les posts programmés arrivés à échéance et les publie. Chaque
 * post est pris de façon atomique (voir claimPostForPublishing) ; le travail
 * s'arrête avant la limite de temps de la fonction, le passage suivant du
 * cron prend la suite.
 */
export async function runDuePosts(budgetMs = PUBLISH_BUDGET_MS) {
  const start = Date.now();
  const due = await prisma.post.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true },
    take: 25
  });

  const results = [];
  for (const post of due) {
    if (Date.now() - start > budgetMs - 5_000) break;
    if (!(await claimPostForPublishing(post.id, ["SCHEDULED"]))) continue;
    try {
      const outcome = await publishPost(post.id, { alreadyClaimed: true, deadline: start + budgetMs });
      results.push({ postId: post.id, ...outcome });
    } catch (err) {
      results.push({ postId: post.id, error: (err as Error).message });
    }
  }
  return results;
}

/**
 * « Réessayer maintenant » depuis la fiche d'une publication (lot 5) : les
 * relances prévues de CETTE publication partent tout de suite (pas celles
 * d'un réseau suspendu, qui attendent la reprise).
 */
export async function retryWaitingTargetsNow(postId: string) {
  const { count } = await prisma.postTarget.updateMany({
    where: { postId, status: "RETRY_WAIT", NOT: { errorCategory: "PAUSED" } },
    data: { nextCheckAt: new Date() }
  });
  if (count === 0) return { retried: 0 };
  await advanceProcessingTargets(PUBLISH_BUDGET_MS, { postId });
  return { retried: count };
}

/**
 * « Arrêter les nouveaux essais » (lot 5) : les cibles en attente passent en
 * échec — l'utilisateur relancera quand il le souhaite.
 */
export async function stopWaitingTargets(postId: string) {
  const waiting = await prisma.postTarget.findMany({ where: { postId, status: "RETRY_WAIT" }, select: { id: true, network: true } });
  for (const t of waiting as { id: string; network: string }[]) {
    await prisma.postTarget.updateMany({
      where: { id: t.id, status: "RETRY_WAIT" },
      data: {
        status: "FAILED",
        nextCheckAt: null,
        errorMessage: `[${t.network}] Nouveaux essais arrêtés : relancez la publication quand vous le souhaitez.`
      }
    });
  }
  if (waiting.length > 0) await finalizePostIfDone(postId);
  return { stopped: waiting.length };
}
