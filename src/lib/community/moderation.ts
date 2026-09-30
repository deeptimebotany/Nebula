// Modération de la Communauté (30/09/2026, demande de Lucas).
//
// - Signaler : chaque sujet, réponse et lien partagé porte un bouton
//   « Signaler » (motif au choix + texte libre facultatif). Un seul
//   signalement par personne et par contenu (contrainte d'unicité), jamais
//   sur son propre contenu. Le propriétaire du site est prévenu dans sa
//   cloche, comme pour les autres alertes (owner-alerts.ts) : une seule
//   notification par contenu, remise en haut à chaque nouveau signalement.
// - Supprimer : l'auteur supprime son contenu ; le propriétaire du site
//   supprime n'importe quel sujet, réponse ou lien partagé, directement
//   depuis la Communauté (avec confirmation dans l'interface).
// Les signalements d'un contenu supprimé partent avec lui (pas de clé
// étrangère : trois tables possibles).
import { prisma } from "@/lib/prisma";
import { alertOwner } from "@/lib/owner-alerts";
import { isOwnerEmail } from "@/lib/owner";

import { REPORT_DETAILS_MAX, reportKey, reportReasonLabel, REPORT_TARGET_TYPES, type ReportReason, type ReportTargetType } from "@/lib/community/report-reasons";

export { REPORT_DETAILS_MAX, REPORT_REASONS, REPORT_REASON_IDS, REPORT_TARGET_TYPES, reportKey, reportReasonLabel } from "@/lib/community/report-reasons";
export type { ReportReason, ReportTargetType } from "@/lib/community/report-reasons";

const TYPE_LABEL: Record<ReportTargetType, string> = { THREAD: "sujet", REPLY: "réponse", VIDEO: "lien partagé" };

/** Le propriétaire du site modère toute la Communauté. */
export function canModerate(email: string | null | undefined): boolean {
  return isOwnerEmail(email);
}

function excerpt(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  authorId: string;
  authorName: string;
  excerpt: string;
  /** Adresse du contenu dans l'application. */
  href: string;
}

/** Contenu signalable, ou null s'il n'existe pas (ou plus). */
export async function findReportTarget(type: ReportTargetType, id: string): Promise<ReportTarget | null> {
  if (type === "THREAD") {
    const t = await prisma.forumThread.findUnique({ where: { id }, select: { id: true, title: true, body: true, authorId: true, author: { select: { name: true } } } });
    if (!t) return null;
    return { type, id, authorId: t.authorId, authorName: t.author?.name || "un membre", excerpt: excerpt(`${t.title} — ${t.body}`), href: `/community/${t.id}` };
  }
  if (type === "REPLY") {
    const r = await prisma.forumReply.findUnique({ where: { id }, select: { id: true, body: true, threadId: true, authorId: true, author: { select: { name: true } } } });
    if (!r) return null;
    return { type, id, authorId: r.authorId, authorName: r.author?.name || "un membre", excerpt: excerpt(r.body), href: `/community/${r.threadId}#reponse-${r.id}` };
  }
  const v = await prisma.sharedVideo.findUnique({ where: { id }, select: { id: true, title: true, note: true, externalUrl: true, authorId: true, author: { select: { name: true } } } });
  if (!v) return null;
  return {
    type,
    id,
    authorId: v.authorId,
    authorName: v.author?.name || "un membre",
    excerpt: excerpt(`${v.title}${v.note ? ` — ${v.note}` : ""} (${v.externalUrl})`),
    href: `/community?onglet=videos#video-${v.id}`
  };
}

export type ReportResult = { ok: true; count: number } | { ok: false; status: number; error: string; already?: boolean };

/** Enregistre un signalement et prévient le propriétaire du site. */
export async function reportContent(input: { reporterId: string; type: ReportTargetType; id: string; reason: ReportReason; details?: string | null }): Promise<ReportResult> {
  const target = await findReportTarget(input.type, input.id);
  if (!target) return { ok: false, status: 404, error: "Ce contenu n'existe plus." };
  if (target.authorId === input.reporterId) return { ok: false, status: 400, error: "Vous ne pouvez pas signaler votre propre contenu." };
  const details = input.details?.replace(/\s+/g, " ").trim().slice(0, REPORT_DETAILS_MAX) || null;
  try {
    await prisma.communityReport.create({ data: { reporterId: input.reporterId, targetType: input.type, targetId: input.id, reason: input.reason, details } });
  } catch (err) {
    // Contrainte d'unicité : déjà signalé par cette personne.
    if ((err as { code?: string } | null)?.code === "P2002") return { ok: false, status: 409, error: "Vous avez déjà signalé ce contenu.", already: true };
    throw err;
  }
  const count = await prisma.communityReport.count({ where: { targetType: input.type, targetId: input.id } });
  await alertOwner({
    title: `Communauté : ${TYPE_LABEL[input.type]} signalé${input.type === "REPLY" ? "e" : ""}`,
    body: `${reportReasonLabel(input.reason)}${details ? ` — « ${excerpt(details, 80)} »` : ""}. ${TYPE_LABEL[input.type].charAt(0).toUpperCase()}${TYPE_LABEL[input.type].slice(1)} de ${target.authorName} : « ${target.excerpt} ». ${count} signalement${count > 1 ? "s" : ""} au total.`,
    dedupeKey: `community-report:${reportKey(input.type, input.id)}`,
    href: target.href,
    actionLabel: "Voir le contenu"
  });
  return { ok: true, count };
}

/** Contenus déjà signalés par cette personne, parmi ceux affichés. */
export async function reportedKeys(reporterId: string, targets: { type: ReportTargetType; id: string }[]): Promise<string[]> {
  if (targets.length === 0) return [];
  const rows = await prisma.communityReport.findMany({
    where: { reporterId, OR: REPORT_TARGET_TYPES.map((type) => ({ targetType: type, targetId: { in: targets.filter((t) => t.type === type).map((t) => t.id) } })) },
    select: { targetType: true, targetId: true }
  });
  return rows.map((r) => reportKey(r.targetType as ReportTargetType, r.targetId));
}

export type DeleteResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Supprime un contenu de la Communauté : son auteur, ou le propriétaire du
 * site. Un sujet emporte ses réponses (cascade) et tous leurs signalements.
 */
export async function deleteCommunityContent(actor: { userId: string; email: string | null | undefined }, type: ReportTargetType, id: string): Promise<DeleteResult> {
  const target = await findReportTarget(type, id);
  if (!target) return { ok: false, status: 404, error: type === "THREAD" ? "Discussion introuvable." : type === "REPLY" ? "Réponse introuvable." : "Partage introuvable." };
  if (target.authorId !== actor.userId && !canModerate(actor.email)) {
    const what = type === "THREAD" ? "vos propres discussions" : type === "REPLY" ? "vos propres réponses" : "vos propres partages";
    return { ok: false, status: 403, error: `Vous ne pouvez supprimer que ${what}.` };
  }
  if (type === "THREAD") {
    const replyIds = (await prisma.forumReply.findMany({ where: { threadId: id }, select: { id: true } })).map((r) => r.id);
    await prisma.$transaction([
      prisma.communityReport.deleteMany({ where: { OR: [{ targetType: "THREAD", targetId: id }, { targetType: "REPLY", targetId: { in: replyIds } }] } }),
      prisma.forumThread.delete({ where: { id } })
    ]);
  } else if (type === "REPLY") {
    await prisma.$transaction([prisma.communityReport.deleteMany({ where: { targetType: "REPLY", targetId: id } }), prisma.forumReply.delete({ where: { id } })]);
  } else {
    await prisma.$transaction([prisma.communityReport.deleteMany({ where: { targetType: "VIDEO", targetId: id } }), prisma.sharedVideo.delete({ where: { id } })]);
  }
  return { ok: true };
}
