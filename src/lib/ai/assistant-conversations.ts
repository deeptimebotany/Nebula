// Conversations de « Demander à Nebula » (09/10/2026, demande de Lucas).
//
// - La conversation en cours est enregistrée à chaque réponse de
//   l'assistant (/api/ai/chat) : le navigateur envoie tout le fil, le
//   serveur garde le texte des messages (sans les erreurs ni les images).
// - Elle reste dans le chat quand on change de page ou qu'on ferme le
//   tiroir ; recharger la page ou quitter Nebula ouvre un chat vide, et
//   l'ancienne conversation se retrouve dans « Discussions » (menu ☰).
// - Une conversation appartient à une personne ET une marque : jamais
//   visible des autres membres de la marque.
// - Bornes : 60 messages par conversation (les plus récents), 100
//   conversations par personne et par marque (les plus anciennes effacées),
//   effacement automatique après 90 jours sans nouveau message (cron).
import { prisma } from "@/lib/prisma";

export const CONVERSATION_MAX_MESSAGES = 60;
export const CONVERSATIONS_PER_BRAND = 100;
export const CONVERSATION_RETENTION_DAYS = 90;
const TITLE_MAX = 80;
const TEXT_MAX = 8_000;

export interface StoredMessage {
  role: "user" | "model";
  text: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

/** Titre : la première question, sur une ligne, raccourcie. */
export function conversationTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.text ?? "";
  const line = first.replace(/\s+/g, " ").trim();
  if (!line) return "Conversation";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

/** Messages gardés : rôle et texte seulement, bornés. */
export function storableMessages(messages: { role: string; text: string }[]): StoredMessage[] {
  return messages
    .filter((m): m is StoredMessage => (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim() !== "")
    .map((m) => ({ role: m.role, text: m.text.slice(0, TEXT_MAX) }))
    .slice(-CONVERSATION_MAX_MESSAGES);
}

function readMessages(value: unknown): StoredMessage[] {
  return Array.isArray(value) ? storableMessages(value as { role: string; text: string }[]) : [];
}

/**
 * Enregistre la conversation (création, ou mise à jour si `conversationId`
 * est à cette personne et à cette marque) et renvoie son identifiant.
 * Un identifiant inconnu ou à quelqu'un d'autre crée une nouvelle conversation.
 */
export async function saveConversation(params: { userId: string; brandId: string; conversationId?: string | null; messages: { role: string; text: string }[] }): Promise<string | null> {
  const messages = storableMessages(params.messages);
  if (!messages.some((m) => m.role === "user")) return null;
  const data = { title: conversationTitle(messages), messages: messages as unknown as object };
  if (params.conversationId) {
    const updated = await prisma.assistantConversation.updateMany({
      where: { id: params.conversationId, userId: params.userId, brandId: params.brandId },
      data
    });
    if (updated.count > 0) return params.conversationId;
  }
  const created = await prisma.assistantConversation.create({ data: { ...data, userId: params.userId, brandId: params.brandId } });
  // Au-delà de 100 conversations pour cette marque : les plus anciennes partent.
  const extra = await prisma.assistantConversation.findMany({
    where: { userId: params.userId, brandId: params.brandId },
    orderBy: { updatedAt: "desc" },
    skip: CONVERSATIONS_PER_BRAND,
    select: { id: true }
  });
  if (extra.length) await prisma.assistantConversation.deleteMany({ where: { id: { in: extra.map((c: { id: string }) => c.id) } } });
  return created.id;
}

/** Les conversations d'une personne pour une marque, de la plus récente à la plus ancienne. */
export async function listConversations(userId: string, brandId: string): Promise<ConversationSummary[]> {
  const rows: { id: string; title: string; updatedAt: Date; messages: unknown }[] = await prisma.assistantConversation.findMany({
    where: { userId, brandId },
    orderBy: { updatedAt: "desc" },
    take: CONVERSATIONS_PER_BRAND,
    select: { id: true, title: true, updatedAt: true, messages: true }
  });
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString(), messageCount: readMessages(r.messages).length }));
}

export async function getConversation(userId: string, id: string): Promise<{ id: string; brandId: string; title: string; messages: StoredMessage[]; updatedAt: string } | null> {
  const row = await prisma.assistantConversation.findFirst({ where: { id, userId } });
  if (!row) return null;
  return { id: row.id, brandId: row.brandId, title: row.title, messages: readMessages(row.messages), updatedAt: row.updatedAt.toISOString() };
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const res = await prisma.assistantConversation.deleteMany({ where: { id, userId } });
  return res.count > 0;
}

/** Cron : conversations sans nouveau message depuis 90 jours. */
export async function purgeOldConversations(now: Date = new Date()): Promise<number> {
  const res = await prisma.assistantConversation.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - CONVERSATION_RETENTION_DAYS * 86_400_000) } } });
  return res.count;
}
