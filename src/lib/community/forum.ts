// Forum de la Communauté façon YouTube (10/10/2026, demande de Lucas) :
//  - réponses à un message, sur un seul niveau (une réponse à une réponse
//    rejoint le même fil et mentionne @pseudo) ;
//  - j'aime / je n'aime pas sur le sujet et sur chaque réponse : un seul
//    des deux par personne ; le nombre de j'aime est affiché, celui des je
//    n'aime pas jamais (choix de Lucas) ;
//  - notification à l'auteur du sujet, ou du message auquel on répond.
// Les votes sont des CommunityReaction (emoji « like » / « dislike ») : les
// anciennes réactions comptent comme des j'aime, et Réussites ne compte
// jamais les je n'aime pas.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { AUTHOR_SELECT, publicAuthor, type PublicAuthor } from "@/lib/reussites/public-author";
import { displayHandle } from "./handle-rules";
import { recordMentions } from "./mentions";

export const FORUM_REPLY_MAX = 3000;
export const LIKE = "like";
export const DISLIKE = "dislike";
export type ForumVote = "like" | "dislike" | null;

export interface ForumReplyDTO {
  id: string;
  body: string;
  createdAt: string;
  /** Réponse de premier niveau à laquelle celle-ci répond (null : réponse au sujet). */
  parentId: string | null;
  author: PublicAuthor | null;
  likes: number;
  myVote: ForumVote;
}

export interface ForumThreadDTO {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  author: PublicAuthor | null;
  likes: number;
  myVote: ForumVote;
  replies: ForumReplyDTO[];
}

type Reaction = { userId: string; emoji: string; threadId: string | null; replyId: string | null };

/** J'aime affichés (anciennes réactions comprises) et vote de la personne. */
function tally(reactions: Reaction[], viewerId: string): { likes: number; myVote: ForumVote } {
  let likes = 0;
  let myVote: ForumVote = null;
  for (const r of reactions) {
    const dislike = r.emoji === DISLIKE;
    if (!dislike) likes++;
    if (r.userId === viewerId) myVote = dislike ? "dislike" : "like";
  }
  return { likes, myVote };
}

export async function loadThread(viewerId: string, threadId: string): Promise<ForumThreadDTO | null> {
  const thread = (await prisma.forumThread.findUnique({
    where: { id: threadId },
    include: {
      author: { select: AUTHOR_SELECT },
      replies: { orderBy: { createdAt: "asc" }, include: { author: { select: AUTHOR_SELECT } } }
    }
  })) as unknown as {
    id: string;
    title: string;
    body: string;
    category: string;
    createdAt: Date;
    author: unknown;
    replies: { id: string; body: string; createdAt: Date; parentId: string | null; author: unknown }[];
  } | null;
  if (!thread) return null;
  const reactions = (await prisma.communityReaction.findMany({
    where: { OR: [{ threadId }, { replyId: { in: thread.replies.map((r) => r.id) } }] },
    select: { userId: true, emoji: true, threadId: true, replyId: true }
  })) as Reaction[];
  const byReply = new Map<string, Reaction[]>();
  for (const r of reactions) if (r.replyId) byReply.set(r.replyId, [...(byReply.get(r.replyId) ?? []), r]);
  return {
    id: thread.id,
    title: thread.title,
    body: thread.body,
    category: thread.category,
    createdAt: thread.createdAt.toISOString(),
    author: publicAuthor(thread.author),
    ...tally(
      reactions.filter((r) => r.threadId === threadId),
      viewerId
    ),
    replies: thread.replies.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      parentId: r.parentId,
      author: publicAuthor(r.author),
      ...tally(byReply.get(r.id) ?? [], viewerId)
    }))
  };
}

export type ForumResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const preview = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 119)}…` : t;
};

/** Réponse au sujet, ou à une réponse (rattachée au fil de premier niveau). */
export async function postReply(userId: string, threadId: string, rawBody: string, parentId?: string | null): Promise<ForumResult<{ reply: ForumReplyDTO }>> {
  const body = String(rawBody ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, FORUM_REPLY_MAX);
  if (!body) return { ok: false, status: 400, error: "Message vide." };
  const thread = await prisma.forumThread.findUnique({ where: { id: threadId }, select: { id: true, title: true, authorId: true } });
  if (!thread) return { ok: false, status: 404, error: "Discussion introuvable" };

  let parent: { id: string; authorId: string } | null = null;
  if (parentId) {
    const p = await prisma.forumReply.findUnique({ where: { id: parentId }, select: { id: true, threadId: true, authorId: true, parentId: true } });
    if (!p || p.threadId !== threadId) return { ok: false, status: 404, error: "Message introuvable : il a peut-être été supprimé." };
    // Un seul niveau : une réponse à une réponse rejoint le fil de premier niveau.
    parent = p.parentId ? await prisma.forumReply.findUnique({ where: { id: p.parentId }, select: { id: true, authorId: true } }) : { id: p.id, authorId: p.authorId };
    if (!parent) return { ok: false, status: 404, error: "Message introuvable : il a peut-être été supprimé." };
    // La personne à qui l'on répond directement (même dans un fil).
    if (p.authorId !== parent.authorId) parent = { id: parent.id, authorId: p.authorId };
  }

  const created = (await prisma.forumReply.create({
    data: { threadId, authorId: userId, body, parentId: parent?.id ?? null },
    include: { author: { select: AUTHOR_SELECT } }
  })) as unknown as { id: string; body: string; createdAt: Date; parentId: string | null; author: unknown };
  const author = publicAuthor(created.author);
  const who = author?.name ?? displayHandle(null);

  // Notification : la personne à qui l'on répond, sinon l'auteur du sujet.
  const recipient = parent ? parent.authorId : thread.authorId;
  if (recipient !== userId) {
    await notify(recipient, {
      kind: "feedback",
      title: parent ? `${who} vous a répondu` : `${who} a répondu à votre sujet`,
      body: parent ? `« ${preview(body)} »` : `${thread.title} : « ${preview(body)} »`,
      href: `/community/${threadId}#reponse-${created.id}`,
      actionLabel: "Lire",
      dedupeKey: parent ? `forum-reply:${parent.id}:${recipient}` : `forum-thread:${threadId}`
    }).catch(() => undefined);
  }
  // Mentions @pseudo (10/10/2026) : la personne à qui l'on répond est déjà prévenue.
  await recordMentions({
    authorId: userId,
    text: body,
    place: { replyId: created.id },
    href: `/community/${threadId}#reponse-${created.id}`,
    where: `Dans « ${thread.title} »`,
    alreadyNotified: recipient !== userId ? [recipient] : []
  });

  return {
    ok: true,
    reply: { id: created.id, body: created.body, createdAt: created.createdAt.toISOString(), parentId: created.parentId, author, likes: 0, myVote: null }
  };
}

/** J'aime / je n'aime pas / rien, sur le sujet ou sur une réponse. */
export async function voteForum(
  userId: string,
  target: { threadId?: string | null; replyId?: string | null },
  value: ForumVote
): Promise<ForumResult<{ likes: number; myVote: ForumVote; recipientId: string }>> {
  const threadId = target.threadId ?? null;
  const replyId = target.replyId ?? null;
  if (Boolean(threadId) === Boolean(replyId)) return { ok: false, status: 400, error: "Précisez le sujet ou la réponse." };
  const owner = threadId
    ? await prisma.forumThread.findUnique({ where: { id: threadId }, select: { authorId: true } })
    : await prisma.forumReply.findUnique({ where: { id: replyId as string }, select: { authorId: true } });
  if (!owner) return { ok: false, status: 404, error: "Message introuvable : il a peut-être été supprimé." };
  const where = threadId ? { threadId } : { replyId };
  // Un seul vote par personne : l'ancien (j'aime, je n'aime pas ou ancienne réaction) est remplacé.
  await prisma.communityReaction.deleteMany({ where: { userId, ...where } });
  if (value) await prisma.communityReaction.create({ data: { userId, emoji: value === "dislike" ? DISLIKE : LIKE, threadId, replyId } });
  const reactions = (await prisma.communityReaction.findMany({ where, select: { userId: true, emoji: true, threadId: true, replyId: true } })) as Reaction[];
  return { ok: true, ...tally(reactions, userId), recipientId: owner.authorId };
}
