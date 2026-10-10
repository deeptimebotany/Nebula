// Avis de la communauté (02/10/2026) : un créateur soumet 2 ou 3 miniatures
// ou titres avant de publier, les autres membres votent et commentent
// pendant 72 h (règles partagées : feedback-rules.ts).
//
// Garde-fous :
//  - images : JPEG, PNG ou WebP (type lu dans le contenu), 10 Mo au plus,
//    métadonnées retirées, rangées sous u/<auteur>/avis/ ; une image venue
//    de Publier doit appartenir à la personne ou à une de ses marques ;
//  - limites : 2 demandes par semaine en Gratuit, 10 par jour en Pro,
//    Agence ou essai ; des cœurs (10/10/2026) : un par personne et par
//    proposition, sur autant de propositions qu'on veut, jamais sur sa
//    propre demande ;
//  - résultats cachés tant qu'on n'a pas voté (pas d'effet de suivisme),
//    visibles par l'auteur et par tous une fois la demande terminée ;
//  - signalement et suppression comme le reste de la Communauté
//    (moderation.ts) ; images supprimées avec la demande, et la demande
//    30 jours après sa fin (cron).
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { deleteUploadedFile, localUploadPath, saveUploadedFile } from "@/lib/storage";
import { ownStoragePath, sniffMediaMime, userUploadPrefix } from "@/lib/upload-policy";
import { AUTHOR_SELECT, publicAuthor } from "@/lib/reussites/public-author";
import { displayHandle } from "./handle-rules";
import { recordMentions } from "./mentions";
import { notify, notifyOnce } from "@/lib/notifications";
import { fetchPublic, readBodyCapped } from "@/lib/net-safety";
import { NETWORKS } from "@/lib/types";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_CONTEXT_MAX,
  FEEDBACK_DURATION_MS,
  FEEDBACK_FREE_WEEKLY,
  FEEDBACK_HELPFUL_MAX,
  FEEDBACK_IMAGE_LABEL_MAX,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_KINDS,
  FEEDBACK_MAX_OPTIONS,
  FEEDBACK_MIN_OPTIONS,
  FEEDBACK_PAID_DAILY,
  FEEDBACK_RETENTION_DAYS,
  FEEDBACK_TITLE_MAX,
  canSeeResults,
  optionLetter,
  winningOptions,
  type FeedbackCommentDTO,
  type FeedbackKind,
  type FeedbackQuotaDTO,
  type FeedbackRequestDTO
} from "./feedback-rules";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export type FeedbackResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; reason?: string };

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

export async function feedbackQuota(userId: string, now: Date = new Date()): Promise<FeedbackQuotaDTO> {
  const plan = await getUserPlan(userId);
  const free = plan.limits.feedbackPerWeek !== null;
  const windowMs = free ? 7 * 86_400_000 : 86_400_000;
  const limit = free ? (plan.limits.feedbackPerWeek ?? FEEDBACK_FREE_WEEKLY) : FEEDBACK_PAID_DAILY;
  const recent = await prisma.feedbackRequest.findMany({
    where: { authorId: userId, createdAt: { gt: new Date(now.getTime() - windowMs) } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" }
  });
  const nextAt = recent.length >= limit ? new Date(recent[recent.length - limit].createdAt.getTime() + windowMs).toISOString() : null;
  return { limit, used: recent.length, period: free ? "week" : "day", nextAt };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function bytesOfOwnFile(url: string): Promise<Uint8Array | null> {
  try {
    if (url.startsWith("/uploads/")) return new Uint8Array(await readFile(localUploadPath(url)));
    // Fichier du stockage de Nebula (déjà vérifié comme appartenant à la
    // personne) : passe par la porte commune, taille plafonnée.
    const res = await fetchPublic(url, { timeoutMs: 15_000 });
    if (!res.ok) return null;
    return new Uint8Array(await readBodyCapped(res, FEEDBACK_IMAGE_MAX_BYTES));
  } catch {
    return null;
  }
}

/** Une image de Publier (miniature proposée) appartient-elle à la personne ? */
async function ownsSourceImage(userId: string, url: string): Promise<boolean> {
  const path = ownStoragePath(url);
  if (!path) return false;
  if (path.startsWith("uploads/")) return true; // disque local (développement)
  if (path.startsWith(userUploadPrefix(userId))) return true;
  const brandId = /^b\/([^/]+)\//.exec(path)?.[1];
  if (!brandId) return false;
  return Boolean(await prisma.membership.findFirst({ where: { userId, brandId }, select: { id: true } }));
}

async function storeImage(userId: string, source: { file?: File | null; url?: string | null }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let bytes: Uint8Array | null = null;
  if (source.file) {
    if (source.file.size > FEEDBACK_IMAGE_MAX_BYTES) return { ok: false, error: "Image trop lourde : 10 Mo au plus." };
    bytes = new Uint8Array(await source.file.arrayBuffer());
  } else if (source.url) {
    if (!(await ownsSourceImage(userId, source.url))) return { ok: false, error: "Cette image ne vient pas de vos fichiers Nebula." };
    bytes = await bytesOfOwnFile(source.url);
    if (!bytes) return { ok: false, error: "Image introuvable : choisissez-la à nouveau." };
    if (bytes.byteLength > FEEDBACK_IMAGE_MAX_BYTES) return { ok: false, error: "Image trop lourde : 10 Mo au plus." };
  }
  if (!bytes) return { ok: false, error: "Ajoutez une image pour chaque proposition." };
  const mime = sniffMediaMime(bytes.subarray(0, 64));
  if (!mime || !IMAGE_MIMES.has(mime)) return { ok: false, error: "Format non accepté : JPEG, PNG ou WebP." };
  const file = new File([Buffer.from(bytes)], `avis.${mime.split("/")[1]}`, { type: mime });
  const saved = await saveUploadedFile(file, { prefix: `${userUploadPrefix(userId)}avis/`, mimeType: mime });
  return { ok: true, url: saved.url };
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export interface FeedbackOptionInput {
  label?: string | null;
  file?: File | null;
  /** Image déjà dans Nebula (miniature proposée dans Publier). */
  sourceUrl?: string | null;
}

export interface FeedbackCreateInput {
  kind: string;
  context?: string | null;
  network?: string | null;
  options: FeedbackOptionInput[];
}

export async function createFeedbackRequest(userId: string, input: FeedbackCreateInput, now: Date = new Date()): Promise<FeedbackResult<{ id: string }>> {
  if (!FEEDBACK_KINDS.includes(input.kind as FeedbackKind)) return { ok: false, status: 400, error: "Choisissez des miniatures ou des titres." };
  const kind = input.kind as FeedbackKind;
  const options = input.options.slice(0, FEEDBACK_MAX_OPTIONS + 1);
  if (options.length < FEEDBACK_MIN_OPTIONS || options.length > FEEDBACK_MAX_OPTIONS) {
    return { ok: false, status: 400, error: `Proposez ${FEEDBACK_MIN_OPTIONS} ou ${FEEDBACK_MAX_OPTIONS} versions à comparer.` };
  }
  const context = clean(input.context ?? "", FEEDBACK_CONTEXT_MAX);
  const network = input.network && (NETWORKS as readonly string[]).includes(input.network) ? input.network : null;

  let labels: string[];
  if (kind === "TITLE") {
    labels = options.map((o) => clean(o.label ?? "", FEEDBACK_TITLE_MAX));
    if (labels.some((l) => !l)) return { ok: false, status: 400, error: "Écrivez chaque titre à comparer." };
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) return { ok: false, status: 400, error: "Les titres doivent être différents." };
  } else {
    labels = options.map((o) => clean(o.label ?? "", FEEDBACK_IMAGE_LABEL_MAX));
    if (options.some((o) => !o.file && !o.sourceUrl)) return { ok: false, status: 400, error: "Ajoutez une image pour chaque proposition." };
  }

  const quota = await feedbackQuota(userId, now);
  if (quota.used >= quota.limit) {
    return {
      ok: false,
      status: 429,
      reason: quota.period === "week" ? "feedback_quota" : undefined,
      error:
        quota.period === "week"
          ? `En Gratuit, ${FEEDBACK_FREE_WEEKLY} demandes d'avis par semaine : la prochaine sera possible ${quota.nextAt ? `le ${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(quota.nextAt))}` : "bientôt"}. Sans limite en Pro et Agence.`
          : `${FEEDBACK_PAID_DAILY} demandes d'avis aujourd'hui : réessayez demain.`
    };
  }

  // Images en dernier, une fois tout le reste vérifié ; retirées si la
  // création échoue.
  const images: (string | null)[] = [];
  if (kind === "THUMBNAIL") {
    for (const o of options) {
      const stored = await storeImage(userId, { file: o.file, url: o.sourceUrl });
      if (!stored.ok) {
        await Promise.all(images.map((u) => (u ? deleteUploadedFile(u) : undefined)));
        return { ok: false, status: 400, error: stored.error };
      }
      images.push(stored.url);
    }
  }
  try {
    const created = await prisma.feedbackRequest.create({
      data: {
        authorId: userId,
        kind,
        context,
        network,
        closesAt: new Date(now.getTime() + FEEDBACK_DURATION_MS),
        options: { create: labels.map((label, i) => ({ position: i, label, imageUrl: images[i] ?? null })) }
      },
      select: { id: true }
    });
    // Mentions @pseudo dans la question (10/10/2026).
    if (context) await recordMentions({ authorId: userId, text: context, place: { requestId: created.id }, href: `/community?onglet=avis#avis-${created.id}`, where: "Dans une demande d'avis" });
    return { ok: true, id: created.id };
  } catch (err) {
    await Promise.all(images.map((u) => (u ? deleteUploadedFile(u) : undefined)));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

const REQUEST_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  options: { orderBy: { position: "asc" as const }, select: { id: true, position: true, label: true, imageUrl: true, _count: { select: { votes: true } } } },
  _count: { select: { comments: true, votes: true } }
};

type RequestRow = {
  id: string;
  authorId: string;
  kind: string;
  context: string;
  network: string | null;
  createdAt: Date;
  closesAt: Date;
  closedAt: Date | null;
  author: unknown;
  options: { id: string; position: number; label: string; imageUrl: string | null; _count: { votes: number } }[];
  _count: { comments: number; votes: number };
};

export function isClosed(row: { closesAt: Date; closedAt: Date | null }, now: Date = new Date()): boolean {
  return Boolean(row.closedAt) || row.closesAt.getTime() <= now.getTime();
}

function toDTO(row: RequestRow, viewerId: string, myHearts: string[], voters: number, now: Date): FeedbackRequestDTO {
  const mine = row.authorId === viewerId;
  const closed = isClosed(row, now);
  const visible = canSeeResults({ mine, voted: myHearts.length > 0, closed });
  return {
    id: row.id,
    kind: row.kind as FeedbackKind,
    context: row.context,
    network: row.network,
    createdAt: row.createdAt.toISOString(),
    closesAt: (row.closedAt && row.closedAt < row.closesAt ? row.closedAt : row.closesAt).toISOString(),
    closed,
    author: publicAuthor(row.author),
    mine,
    options: row.options.map((o) => ({ id: o.id, position: o.position, label: o.label, imageUrl: o.imageUrl, votes: visible ? o._count.votes : null })),
    totalVotes: visible ? voters : null,
    myHearts,
    commentCount: row._count.comments
  };
}

export type FeedbackScope = "open" | "mine" | "closed";

/** Liste de l'onglet Avis : à voter (ouvertes, pas les siennes), mes demandes, terminées. */
export async function listFeedback(viewerId: string, scope: FeedbackScope, now: Date = new Date()): Promise<FeedbackRequestDTO[]> {
  const since = new Date(now.getTime() - FEEDBACK_RETENTION_DAYS * 86_400_000);
  const where =
    scope === "mine"
      ? { authorId: viewerId, createdAt: { gt: since } }
      : scope === "open"
        ? { closedAt: null, closesAt: { gt: now }, authorId: { not: viewerId } }
        : { OR: [{ closedAt: { not: null } }, { closesAt: { lte: now } }], createdAt: { gt: since } };
  const rows = (await prisma.feedbackRequest.findMany({
    where,
    include: REQUEST_INCLUDE,
    orderBy: scope === "open" ? { closesAt: "asc" } : { createdAt: "desc" },
    take: 60
  })) as unknown as RequestRow[];
  const ids = rows.map((r) => r.id);
  const [mineRows, voters] = await Promise.all([
    ids.length ? prisma.feedbackVote.findMany({ where: { userId: viewerId, requestId: { in: ids } }, select: { requestId: true, optionId: true } }) : [],
    votersByRequest(ids)
  ]);
  const byRequest = new Map<string, string[]>();
  for (const v of mineRows) byRequest.set(v.requestId, [...(byRequest.get(v.requestId) ?? []), v.optionId]);
  const list = rows.map((r) => toDTO(r, viewerId, byRequest.get(r.id) ?? [], voters.get(r.id) ?? 0, now));
  // À voter : celles où je n'ai encore mis aucun cœur d'abord.
  return scope === "open" ? [...list.filter((r) => r.myHearts.length === 0), ...list.filter((r) => r.myHearts.length > 0)] : list;
}

/** Nombre de personnes (pas de cœurs) qui ont mis au moins un cœur, par demande. */
async function votersByRequest(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = (await prisma.feedbackVote.groupBy({ by: ["requestId", "userId"], where: { requestId: { in: ids } } })) as { requestId: string }[];
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.requestId, (out.get(r.requestId) ?? 0) + 1);
  return out;
}

export async function getFeedback(viewerId: string, id: string, now: Date = new Date()): Promise<FeedbackRequestDTO | null> {
  const row = (await prisma.feedbackRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE })) as unknown as RequestRow | null;
  if (!row) return null;
  const [hearts, voters, comments] = await Promise.all([
    prisma.feedbackVote.findMany({ where: { requestId: id, userId: viewerId }, select: { optionId: true } }),
    votersByRequest([id]),
    prisma.feedbackComment.findMany({ where: { requestId: id }, orderBy: { createdAt: "asc" }, take: 200, include: { author: { select: AUTHOR_SELECT } } })
  ]);
  return {
    ...toDTO(row, viewerId, hearts.map((h) => h.optionId), voters.get(id) ?? 0, now),
    comments: (comments as unknown as { id: string; body: string; createdAt: Date; authorId: string; helpfulAt: Date | null; author: unknown }[]).map(
      (c): FeedbackCommentDTO => ({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: publicAuthor(c.author), mine: c.authorId === viewerId, helpful: Boolean(c.helpfulAt) })
    )
  };
}

// ---------------------------------------------------------------------------
// Vote, commentaire, clôture
// ---------------------------------------------------------------------------

/**
 * Cœur sur une proposition (10/10/2026, demande de Lucas) : un clic le met,
 * un autre clic le retire ; on peut en mettre sur plusieurs propositions,
 * ou sur toutes. Jamais sur sa propre demande ni une demande terminée.
 */
export async function voteFeedback(userId: string, requestId: string, optionId: string, now: Date = new Date()): Promise<FeedbackResult<{ request: FeedbackRequestDTO }>> {
  const row = await prisma.feedbackRequest.findUnique({ where: { id: requestId }, select: { authorId: true, closesAt: true, closedAt: true, options: { select: { id: true } } } });
  if (!row) return { ok: false, status: 404, error: "Demande d'avis introuvable." };
  if (row.authorId === userId) return { ok: false, status: 400, error: "Vous ne pouvez pas voter pour votre propre demande." };
  if (isClosed(row, now)) return { ok: false, status: 409, error: "Cette demande d'avis est terminée." };
  if (!row.options.some((o) => o.id === optionId)) return { ok: false, status: 400, error: "Proposition introuvable." };
  const existing = await prisma.feedbackVote.findUnique({ where: { optionId_userId: { optionId, userId } }, select: { id: true } });
  if (existing) await prisma.feedbackVote.delete({ where: { id: existing.id } });
  else {
    await prisma.feedbackVote.create({ data: { requestId, optionId, userId, createdAt: now } }).catch(() => undefined); // double clic : déjà là
  }
  const request = await getFeedback(userId, requestId, now);
  return { ok: true, request: request as FeedbackRequestDTO };
}

export async function commentFeedback(userId: string, requestId: string, rawBody: string, now: Date = new Date()): Promise<FeedbackResult<{ comment: FeedbackCommentDTO }>> {
  const body = rawBody.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, FEEDBACK_COMMENT_MAX);
  if (body.length < 2) return { ok: false, status: 400, error: "Écrivez votre avis." };
  const row = await prisma.feedbackRequest.findUnique({ where: { id: requestId }, select: { authorId: true, closesAt: true, closedAt: true, kind: true } });
  if (!row) return { ok: false, status: 404, error: "Demande d'avis introuvable." };
  if (isClosed(row, now)) return { ok: false, status: 409, error: "Cette demande d'avis est terminée : les commentaires sont fermés." };
  const created = (await prisma.feedbackComment.create({
    data: { requestId, authorId: userId, body },
    include: { author: { select: AUTHOR_SELECT } }
  })) as unknown as { id: string; body: string; createdAt: Date; author: unknown };
  if (row.authorId !== userId) {
    const count = await prisma.feedbackComment.count({ where: { requestId, authorId: { not: row.authorId } } });
    // Une seule notification par demande, remise en haut à chaque avis.
    await notify(row.authorId, {
      kind: "feedback",
      title: count > 1 ? `${count} avis sur votre demande` : "Nouvel avis sur votre demande",
      body: `« ${body.slice(0, 120)} »`,
      href: `/community?onglet=avis#avis-${requestId}`,
      actionLabel: "Lire",
      dedupeKey: `feedback-comments:${requestId}`
    });
  }
  // Mentions @pseudo (10/10/2026) : l'auteur de la demande est déjà prévenu.
  await recordMentions({
    authorId: userId,
    text: body,
    place: { commentId: created.id },
    href: `/community?onglet=avis#avis-${requestId}`,
    where: "Sous une demande d'avis",
    alreadyNotified: row.authorId !== userId ? [row.authorId] : []
  });
  return { ok: true, comment: { id: created.id, body: created.body, createdAt: created.createdAt.toISOString(), author: publicAuthor(created.author), mine: true, helpful: false } };
}

/**
 * « Cet avis m'a aidé » (Réussites v3, 02/10/2026) : seul l'auteur de la
 * demande marque (ou démarque) l'avis d'un autre créateur, même après la
 * fin de la demande ; 3 avis au plus par demande. Compte pour « Avis utiles »
 * de celui qui l'a écrit (une fois par demande, voir reussites/quality.ts).
 * Renvoie l'auteur de l'avis pour actualiser ses Réussites.
 */
export async function markFeedbackHelpful(
  userId: string,
  requestId: string,
  commentId: string,
  helpful: boolean,
  now: Date = new Date()
): Promise<FeedbackResult<{ helpful: boolean; commentAuthorId: string }>> {
  const comment = (await prisma.feedbackComment.findUnique({
    where: { id: commentId },
    select: { id: true, requestId: true, authorId: true, helpfulAt: true, request: { select: { authorId: true, context: true, author: { select: { handle: true } } } } }
  })) as { id: string; requestId: string; authorId: string; helpfulAt: Date | null; request: { authorId: string; context: string; author: { handle: string | null } | null } } | null;
  if (!comment || comment.requestId !== requestId) return { ok: false, status: 404, error: "Avis introuvable." };
  if (comment.request.authorId !== userId) return { ok: false, status: 403, error: "Seul l'auteur de la demande peut marquer un avis utile." };
  if (comment.authorId === userId) return { ok: false, status: 400, error: "Vos propres messages ne comptent pas comme avis utiles." };
  if (Boolean(comment.helpfulAt) === helpful) return { ok: true, helpful, commentAuthorId: comment.authorId };
  if (helpful) {
    const already = await prisma.feedbackComment.count({ where: { requestId, helpfulAt: { not: null } } });
    if (already >= FEEDBACK_HELPFUL_MAX) return { ok: false, status: 409, error: `${FEEDBACK_HELPFUL_MAX} avis utiles au plus par demande : retirez-en un d'abord.` };
  }
  await prisma.feedbackComment.update({ where: { id: commentId }, data: { helpfulAt: helpful ? now : null } });
  if (helpful) {
    const who = comment.request.author?.handle ? displayHandle(comment.request.author.handle) : "Un créateur";
    // Une seule notification par avis, même s'il est démarqué puis remarqué.
    await notifyOnce(comment.authorId, {
      kind: "feedback",
      title: "Votre avis a aidé",
      body: `${who} a trouvé votre avis utile${comment.request.context ? ` (« ${comment.request.context.slice(0, 80)} »)` : ""}.`,
      href: `/community?onglet=avis#avis-${requestId}`,
      actionLabel: "Voir",
      dedupeKey: `feedback-helpful:${commentId}`
    });
  }
  return { ok: true, helpful, commentAuthorId: comment.authorId };
}

export async function closeFeedback(userId: string, requestId: string, now: Date = new Date()): Promise<FeedbackResult<{ closed: true }>> {
  const row = await prisma.feedbackRequest.findUnique({ where: { id: requestId }, select: { authorId: true, closesAt: true, closedAt: true } });
  if (!row) return { ok: false, status: 404, error: "Demande d'avis introuvable." };
  if (row.authorId !== userId) return { ok: false, status: 403, error: "Seul l'auteur peut terminer sa demande." };
  if (!isClosed(row, now)) await prisma.feedbackRequest.update({ where: { id: requestId }, data: { closedAt: now } });
  return { ok: true, closed: true };
}

/** Supprime une demande (auteur ou modération) et ses images. */
export async function deleteFeedbackRequest(requestId: string): Promise<void> {
  const options = await prisma.feedbackOption.findMany({ where: { requestId }, select: { imageUrl: true } });
  await prisma.$transaction([
    prisma.communityReport.deleteMany({ where: { OR: [{ targetType: "FEEDBACK", targetId: requestId }] } }),
    prisma.feedbackRequest.delete({ where: { id: requestId } })
  ]);
  await Promise.all(options.map((o) => (o.imageUrl ? deleteUploadedFile(o.imageUrl) : undefined)));
}

// ---------------------------------------------------------------------------
// Cron : fin des demandes (avec résultat), purge
// ---------------------------------------------------------------------------

/** `total` : nombre de votants ; `votes` d'une option : ses cœurs. */
export function resultSentence(kind: string, options: { id: string; position: number; label: string; votes: number }[], total: number): string {
  if (total === 0) return "Aucun cœur cette fois : relancez une demande en précisant ce que vous voulez savoir.";
  const winners = winningOptions(options);
  const what = (o: { position: number; label: string }) => (kind === "TITLE" ? `« ${o.label} »` : `la miniature ${optionLetter(o.position)}${o.label ? ` (${o.label})` : ""}`);
  const best = options.filter((o) => winners.includes(o.id));
  const voters = `${total} votant${total > 1 ? "s" : ""}`;
  if (best.length > 1) return `Égalité entre ${best.map(what).join(" et ")} (${voters}).`;
  const top = best[0];
  return `${what(top).charAt(0).toUpperCase()}${what(top).slice(1)} l'emporte : ${top.votes} cœur${top.votes > 1 ? "s" : ""}, ${voters}.`;
}

/** Demandes arrivées à 72 h : marquées terminées, l'auteur reçoit le résultat. */
export async function closeDueFeedback(now: Date = new Date()): Promise<{ closed: number }> {
  const due = await prisma.feedbackRequest.findMany({
    where: { closedAt: null, closesAt: { lte: now } },
    select: { id: true, authorId: true, kind: true, options: { orderBy: { position: "asc" }, select: { id: true, position: true, label: true, _count: { select: { votes: true } } } } },
    take: 100
  });
  let closed = 0;
  const votersOf = await votersByRequest(due.map((r) => r.id));
  for (const r of due) {
    const { count } = await prisma.feedbackRequest.updateMany({ where: { id: r.id, closedAt: null }, data: { closedAt: now } });
    if (count === 0) continue;
    closed++;
    const options = r.options.map((o) => ({ id: o.id, position: o.position, label: o.label, votes: o._count.votes }));
    const total = votersOf.get(r.id) ?? 0;
    await notify(r.authorId, {
      kind: "feedback",
      title: r.kind === "TITLE" ? "Résultat de votre demande d'avis (titres)" : "Résultat de votre demande d'avis (miniatures)",
      body: resultSentence(r.kind, options, total),
      href: `/community?onglet=avis#avis-${r.id}`,
      actionLabel: "Voir les avis",
      dedupeKey: `feedback-result:${r.id}`
    });
  }
  return { closed };
}

/** Demandes terminées depuis plus de 30 jours : supprimées avec leurs images. */
export async function purgeOldFeedback(now: Date = new Date()): Promise<{ purged: number }> {
  const before = new Date(now.getTime() - FEEDBACK_RETENTION_DAYS * 86_400_000);
  const old = await prisma.feedbackRequest.findMany({
    where: { OR: [{ closedAt: { lt: before } }, { closedAt: null, closesAt: { lt: before } }] },
    select: { id: true },
    take: 200
  });
  for (const r of old) await deleteFeedbackRequest(r.id).catch((err) => console.error("[avis] purge :", (err as Error).message));
  return { purged: old.length };
}

/** Images des demandes d'une personne (suppression du compte). */
export async function feedbackImagesOf(userId: string): Promise<string[]> {
  const rows = await prisma.feedbackOption.findMany({ where: { request: { authorId: userId }, imageUrl: { not: null } }, select: { imageUrl: true } });
  return rows.map((r) => r.imageUrl as string);
}
