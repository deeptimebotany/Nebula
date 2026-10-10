// Mentions @pseudo de la Communauté (10/10/2026, demande de Lucas) — côté
// serveur. Règles de lecture du texte : mention-rules.ts.
//
// Quand un message (sujet, réponse du forum, demande d'avis, avis écrit)
// contient « @pseudo » :
//  - chaque membre mentionné (pas soi-même, au plus 5 par message) a une
//    ligne CommunityMention : elle alimente l'onglet « Mentions » de la
//    Communauté et part avec le message (cascade) ;
//  - il reçoit une notification « @x vous a mentionné », sauf s'il vient
//    déjà d'en recevoir une pour ce même message (« @x vous a répondu ») ;
//  - un pseudo inconnu ne fait rien (pas d'erreur pour la personne qui écrit).
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { AUTHOR_SELECT, publicAuthor, type PublicAuthor } from "@/lib/reussites/public-author";
import { displayHandle, normalizeHandle } from "./handle-rules";
import { extractMentions, MENTION_MAX_PER_MESSAGE } from "./mention-rules";

export type MentionPlace = { threadId: string } | { replyId: string } | { requestId: string } | { commentId: string };

function excerptOf(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Enregistre les mentions d'un message et prévient les membres mentionnés.
 * `href` : adresse du message ; `where` : « dans « titre du sujet » » ;
 * `alreadyNotified` : membres déjà prévenus pour ce message. Ne lève jamais.
 * Renvoie les identifiants des membres mentionnés.
 */
export async function recordMentions(input: {
  authorId: string;
  text: string;
  place: MentionPlace;
  href: string;
  where: string;
  alreadyNotified?: string[];
}): Promise<string[]> {
  try {
    const handles = extractMentions(input.text).slice(0, MENTION_MAX_PER_MESSAGE * 2);
    if (handles.length === 0) return [];
    const users = (await prisma.user.findMany({ where: { handle: { in: handles } }, select: { id: true } })) as { id: string }[];
    const ids = users.map((u) => u.id).filter((id) => id !== input.authorId).slice(0, MENTION_MAX_PER_MESSAGE);
    if (ids.length === 0) return [];
    // Déjà enregistrées pour ce message (message modifié, double envoi) : pas de doublon.
    const existing = (await prisma.communityMention.findMany({ where: { ...input.place, userId: { in: ids } }, select: { userId: true } })) as { userId: string }[];
    const fresh = ids.filter((id) => !existing.some((e) => e.userId === id));
    if (fresh.length === 0) return ids;
    const excerpt = excerptOf(input.text);
    await prisma.communityMention.createMany({ data: fresh.map((userId) => ({ userId, authorId: input.authorId, excerpt, ...input.place })) });

    const author = (await prisma.user.findUnique({ where: { id: input.authorId }, select: { handle: true } })) as { handle: string | null } | null;
    const who = displayHandle(author?.handle);
    const placeKey = Object.entries(input.place)[0].join(":");
    for (const userId of fresh) {
      if (input.alreadyNotified?.includes(userId)) continue;
      await notify(userId, {
        kind: "feedback",
        title: `${who} vous a mentionné`,
        body: `${input.where} : « ${excerptOf(input.text, 120)} »`,
        href: input.href,
        actionLabel: "Lire",
        dedupeKey: `mention:${placeKey}:${userId}`
      }).catch(() => undefined);
    }
    return ids;
  } catch (err) {
    console.error("[mentions] échec :", (err as Error).message);
    return [];
  }
}

export interface MentionDTO {
  id: string;
  author: PublicAuthor | null;
  /** « un sujet », « une réponse », « une demande d'avis », « un avis ». */
  kind: "thread" | "reply" | "request" | "comment";
  /** Titre du sujet, ou question de la demande d'avis. */
  context: string;
  excerpt: string;
  href: string;
  createdAt: string;
  read: boolean;
}

/** Onglet « Mentions » : les 50 dernières mentions reçues, et combien sont non lues. */
export async function listMentions(userId: string): Promise<{ mentions: MentionDTO[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.communityMention.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: { select: AUTHOR_SELECT },
        thread: { select: { id: true, title: true } },
        reply: { select: { id: true, threadId: true, thread: { select: { title: true } } } },
        request: { select: { id: true, context: true, kind: true } },
        comment: { select: { id: true, requestId: true, request: { select: { context: true, kind: true } } } }
      }
    }),
    prisma.communityMention.count({ where: { userId, readAt: null } })
  ]);
  const requestLabel = (r: { context: string; kind: string } | null | undefined) =>
    r?.context?.trim() ? excerptOf(r.context, 80) : r?.kind === "TITLE" ? "Demande d'avis sur des titres" : "Demande d'avis sur des miniatures";
  const mentions = (rows as unknown as {
    id: string;
    excerpt: string;
    createdAt: Date;
    readAt: Date | null;
    author: unknown;
    thread: { id: string; title: string } | null;
    reply: { id: string; threadId: string; thread: { title: string } } | null;
    request: { id: string; context: string; kind: string } | null;
    comment: { id: string; requestId: string; request: { context: string; kind: string } } | null;
  }[]).map((m) => {
    const base = { id: m.id, author: publicAuthor(m.author), excerpt: m.excerpt, createdAt: m.createdAt.toISOString(), read: Boolean(m.readAt) };
    if (m.reply) return { ...base, kind: "reply" as const, context: m.reply.thread.title, href: `/community/${m.reply.threadId}#reponse-${m.reply.id}` };
    if (m.thread) return { ...base, kind: "thread" as const, context: m.thread.title, href: `/community/${m.thread.id}` };
    if (m.comment) return { ...base, kind: "comment" as const, context: requestLabel(m.comment.request), href: `/community?onglet=avis#avis-${m.comment.requestId}` };
    return { ...base, kind: "request" as const, context: requestLabel(m.request), href: `/community?onglet=avis#avis-${m.request?.id ?? ""}` };
  });
  return { mentions, unread };
}

/** Toutes les mentions vues (ouverture de l'onglet). */
export async function markMentionsRead(userId: string): Promise<number> {
  const { count } = await prisma.communityMention.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return count;
}

export interface MemberSuggestion {
  id: string;
  handle: string;
  avatarUrl: string | null;
  levelName: string;
}

/** Membres dont le pseudo commence par ce début (suggestions du champ « @ »). */
export async function suggestMembers(viewerId: string, rawQuery: string, limit = 6): Promise<MemberSuggestion[]> {
  const q = normalizeHandle(rawQuery).slice(0, 24);
  if (!q) return [];
  const rows = (await prisma.user.findMany({
    where: { handle: { startsWith: q }, id: { not: viewerId } },
    orderBy: { handle: "asc" },
    take: limit,
    select: AUTHOR_SELECT
  })) as unknown[];
  return rows
    .map((r) => publicAuthor(r))
    .filter((a): a is PublicAuthor => Boolean(a?.handle))
    .map((a) => ({ id: a.id, handle: a.handle as string, avatarUrl: a.avatarUrl, levelName: a.levelName }));
}
