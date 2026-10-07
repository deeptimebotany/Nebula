// Premier commentaire sous une publication (07/10/2026).
//
// Avant : publish.ts appelait postComment « au mieux » et ignorait tout en
// silence (réseau sans commentaire, autorisation manquante, réseau pas prêt).
// Lucas a vu une vidéo YouTube sans son premier commentaire, sans aucune
// explication. Maintenant :
//  - le sort du commentaire est noté réseau par réseau
//    (PostTarget.firstCommentStatus / firstCommentError) et affiché sur la
//    fiche de la publication, avec « Réessayer » et « Copier » ;
//  - un réseau qui ne le permet pas (TikTok, Pinterest, YouTube sans
//    l'autorisation de commenter, vidéo privée…) est noté UNSUPPORTED avec
//    la raison, sans appel inutile ;
//  - un refus passager (limite de débit, panne avec réponse, vidéo pas
//    encore traitée) est relancé par le cron : 2 min, 10 min, 1 h, 6 h ;
//  - un envoi sans réponse n'est JAMAIS renvoyé (le commentaire est peut-être
//    en ligne : on ne le double pas) ;
//  - un échec définitif prévient l'auteur (cloche).
// Un seul envoi à la fois : la cible est réservée (SENDING) avant l'appel.
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import { SocialApiError, type ConnectionLike } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { firstCommentLength, firstCommentSupport } from "@/lib/social/first-comment-support";
import { youtubeCommentReplyEnabled } from "@/lib/social/youtube";
import { networkLabel, notify } from "@/lib/notifications";
import type { Network } from "@/lib/types";

export type FirstCommentStatus = "POSTED" | "WAITING" | "SENDING" | "FAILED" | "UNSUPPORTED";

/** Délais avant chaque nouvel essai automatique (le 1er essai est à la publication). */
const RETRY_DELAYS_MS = [2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
/** Essais au total, le premier compris. */
export const FIRST_COMMENT_MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Réglages YouTube de la cible (confidentialité, « pour les enfants »). */
function youtubeOptions(metadata: unknown): { privacyStatus?: string | null; madeForKids?: boolean | null } | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as { privacyStatus?: unknown; madeForKids?: unknown };
  return {
    privacyStatus: typeof m.privacyStatus === "string" ? m.privacyStatus : null,
    madeForKids: typeof m.madeForKids === "boolean" ? m.madeForKids : null
  };
}

/** Raison YouTube (« commentsDisabled »…) d'une erreur, si elle en a une. */
function googleReason(err: unknown): string | null {
  if (!(err instanceof SocialApiError)) return null;
  const raw = err.raw as { error?: { errors?: { reason?: string }[] } } | undefined;
  return raw?.error?.errors?.[0]?.reason ?? null;
}

/** Message du réseau, sans le préfixe « [RÉSEAU] », raccourci. */
function providerDetail(err: unknown): string {
  const message = ((err as Error)?.message ?? "").replace(/^\[[A-Z_]+\]\s*/, "").trim();
  return message.length > 180 ? `${message.slice(0, 179)}…` : message;
}

interface Outcome {
  status: "POSTED" | "WAITING" | "FAILED";
  error: string | null;
}

/**
 * Que faire d'un échec : relancer plus tard (rien n'a été publié, réessayer
 * peut marcher) ou arrêter, avec une raison en français.
 */
export function firstCommentFailure(network: string, err: unknown, attempts: number): Outcome {
  const label = networkLabel(network);
  const classified = classifyProviderError(err);
  const reason = googleReason(err);
  const detail = providerDetail(err);
  const canRetry = attempts < FIRST_COMMENT_MAX_ATTEMPTS;

  // Pas de réponse : le commentaire est peut-être en ligne. Jamais renvoyé.
  if (classified.uncertain) {
    return { status: "FAILED", error: `${label} n'a pas répondu : le commentaire a peut-être été publié. Vérifiez sous la publication avant de réessayer.` };
  }
  // YouTube : vidéo pas encore traitée (ou introuvable pour l'instant).
  if (reason === "videoNotFound" || reason === "processingFailure") {
    return canRetry
      ? { status: "WAITING", error: "YouTube ne trouve pas encore la vidéo (traitement en cours)." }
      : { status: "FAILED", error: "YouTube ne trouve pas la vidéo : elle est peut-être privée, ou encore en traitement. Ajoutez le commentaire depuis YouTube." };
  }
  if (reason === "commentsDisabled") {
    return { status: "FAILED", error: "Les commentaires sont désactivés sur cette vidéo (vidéo « conçue pour les enfants », vidéo privée, ou commentaires coupés dans YouTube Studio)." };
  }
  if (classified.category === "RATE_LIMITED" || classified.category === "TRANSIENT" || classified.category === "QUOTA_EXHAUSTED") {
    return canRetry
      ? { status: "WAITING", error: `${label} est momentanément indisponible ou limite les envois.` }
      : { status: "FAILED", error: `${label} a refusé le commentaire plusieurs fois de suite${detail ? ` (${detail})` : ""}. Réessayez plus tard, ou ajoutez-le depuis ${label}.` };
  }
  if (classified.category === "AUTH_EXPIRED") {
    return { status: "FAILED", error: `La connexion à ${label} a expiré : reconnectez le compte dans Comptes connectés, puis réessayez.` };
  }
  if (classified.category === "PERMISSION_MISSING") {
    return {
      status: "FAILED",
      error:
        network === "YOUTUBE"
          ? "YouTube refuse le commentaire : la vidéo est peut-être privée (c'est le cas de toute vidéo envoyée par une application que Google n'a pas encore validée), ou l'autorisation de commenter manque (reconnectez la chaîne)."
          : `${label} refuse le commentaire : Nebula n'a pas l'autorisation de commenter avec ce compte. Reconnectez-le en acceptant toutes les autorisations${detail ? ` (${detail})` : ""}.`
    };
  }
  return { status: "FAILED", error: `${label} a refusé le commentaire${detail ? ` : ${detail}` : "."}` };
}

/** Cible publiée, avec ce qu'il faut pour commenter. */
export interface FirstCommentTarget {
  id: string;
  network: string;
  metadata: unknown;
  externalPostId: string | null;
  firstCommentStatus: string | null;
  firstCommentAttempts: number;
  connection: ConnectionLike & { scopes?: string | null };
}

export interface FirstCommentPost {
  id: string;
  title: string;
  caption: string;
  createdById: string;
  firstComment: string | null;
}

/**
 * Publie le premier commentaire sous la publication `target` (en ligne,
 * externalPostId connu). `expected` : statut actuel attendu (réservation :
 * deux envois simultanés ne publient jamais deux commentaires).
 * Renvoie le statut final, ou null si rien à faire (pas de commentaire,
 * cible déjà prise par un autre envoi).
 */
export async function publishFirstComment(post: FirstCommentPost, target: FirstCommentTarget, options: { manual?: boolean } = {}): Promise<FirstCommentStatus | null> {
  const comment = post.firstComment?.trim();
  if (!comment || !target.externalPostId) return null;
  const network = target.network as Network;

  const format = (target.metadata as { format?: unknown } | null)?.format;
  const support = firstCommentSupport(network, target.connection, {
    youtubeCommentsEnabled: youtubeCommentReplyEnabled(),
    youtube: network === "YOUTUBE" ? youtubeOptions(target.metadata) : null,
    format: typeof format === "string" ? format : null
  });
  const client = getSocialClient(network);
  if (support.mode === "unsupported" || !client.postComment) {
    await prisma.postTarget.update({
      where: { id: target.id },
      data: { firstCommentStatus: "UNSUPPORTED", firstCommentError: support.mode === "unsupported" ? support.reason : "Ce réseau ne permet pas de publier un commentaire depuis Nebula.", firstCommentNextAt: null }
    });
    return "UNSUPPORTED";
  }
  if (firstCommentLength(comment) > support.maxLength) {
    await prisma.postTarget.update({
      where: { id: target.id },
      data: { firstCommentStatus: "FAILED", firstCommentError: `Commentaire trop long pour ${networkLabel(network)} (${support.maxLength} caractères au plus).`, firstCommentNextAt: null }
    });
    return "FAILED";
  }

  // Réservation : seul l'envoi qui passe le statut attendu à SENDING continue.
  const from = target.firstCommentStatus;
  const claimed = await prisma.postTarget.updateMany({
    where: { id: target.id, firstCommentStatus: from },
    // firstCommentNextAt sert ici de « envoi commencé à » (envoi interrompu, voir le cron).
    data: { firstCommentStatus: "SENDING", firstCommentAttempts: options.manual ? 1 : { increment: 1 }, firstCommentNextAt: new Date() }
  });
  if (claimed.count === 0) return null;
  const attempts = options.manual ? 1 : target.firstCommentAttempts + 1;

  let outcome: Outcome;
  try {
    await client.postComment(target.connection, target.externalPostId, comment);
    outcome = { status: "POSTED", error: null };
  } catch (err) {
    outcome = firstCommentFailure(network, err, attempts);
    console.error(`[premier commentaire] ${network}, publication ${post.id} (essai ${attempts}) :`, (err as Error).message);
  }
  const delay = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1];
  await prisma.postTarget.update({
    where: { id: target.id },
    data: {
      firstCommentStatus: outcome.status,
      firstCommentError: outcome.error,
      firstCommentNextAt: outcome.status === "WAITING" ? new Date(Date.now() + delay) : null
    }
  });

  if (outcome.status === "FAILED") {
    const name = (post.title || post.caption.split("\n")[0] || "Votre publication").trim();
    await notify(post.createdById, {
      kind: "publish_failed",
      title: "Premier commentaire non publié",
      body: `« ${name.length > 50 ? `${name.slice(0, 49)}…` : name} » est en ligne sur ${networkLabel(network)}, mais pas son premier commentaire : ${outcome.error}`,
      href: `/posts/${post.id}`,
      actionLabel: "Voir la publication",
      dedupeKey: `first-comment:${target.id}`
    });
  }
  return outcome.status;
}

const targetInclude = {
  connection: true,
  post: { select: { id: true, title: true, caption: true, createdById: true, firstComment: true } }
} as const;

/**
 * Cron : nouveaux essais des premiers commentaires en attente (réseau pas
 * prêt, limite de débit). Les cibles restées « SENDING » plus de 15 min
 * (fonction coupée pendant l'envoi) passent en échec prudent : le
 * commentaire est peut-être en ligne.
 */
export async function retryWaitingFirstComments(options: { limit?: number; now?: Date } = {}): Promise<{ retried: number; stale: number }> {
  const now = options.now ?? new Date();
  const stale = await prisma.postTarget.updateMany({
    where: { firstCommentStatus: "SENDING", firstCommentNextAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
    data: { firstCommentStatus: "FAILED", firstCommentNextAt: null, firstCommentError: "L'envoi du commentaire a été interrompu : il a peut-être été publié. Vérifiez sous la publication avant de réessayer." }
  }).catch(() => ({ count: 0 }));
  const due = await prisma.postTarget.findMany({
    where: { firstCommentStatus: "WAITING", firstCommentNextAt: { lte: now }, status: "PUBLISHED", externalPostId: { not: null } },
    include: targetInclude,
    orderBy: { firstCommentNextAt: "asc" },
    take: options.limit ?? 10
  });
  let retried = 0;
  for (const t of due) {
    await publishFirstComment(t.post, t).catch((err) => console.error("[premier commentaire] relance :", (err as Error).message));
    retried++;
  }
  return { retried, stale: stale.count };
}

/**
 * « Réessayer » (fiche de la publication) : après une reconnexion, une
 * vidéo repassée en public… Seulement pour une cible en ligne dont le
 * commentaire a échoué ou n'était pas possible.
 */
export async function retryFirstCommentNow(targetId: string): Promise<{ status: FirstCommentStatus | null; error: string | null }> {
  const t = await prisma.postTarget.findUnique({ where: { id: targetId }, include: targetInclude });
  if (!t || t.status !== "PUBLISHED" || !t.externalPostId || !t.post.firstComment?.trim()) return { status: null, error: "Rien à réessayer pour cette publication." };
  if (t.firstCommentStatus !== "FAILED" && t.firstCommentStatus !== "UNSUPPORTED") return { status: (t.firstCommentStatus as FirstCommentStatus | null) ?? null, error: null };
  const status = await publishFirstComment(t.post, t, { manual: true });
  const after = await prisma.postTarget.findUnique({ where: { id: targetId }, select: { firstCommentStatus: true, firstCommentError: true } });
  return { status: (after?.firstCommentStatus as FirstCommentStatus | null) ?? status, error: after?.firstCommentError ?? null };
}
