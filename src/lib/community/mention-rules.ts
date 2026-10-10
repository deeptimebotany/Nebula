// Mentions @pseudo de la Communauté (10/10/2026, demande de Lucas : « que
// les personnes notifient les gens dans les commentaires »). Règles pures,
// partagées par le serveur (enregistrement, notifications), l'affichage
// (pseudo en lien vers le profil) et le champ de saisie (suggestions).
//
//  - « @pseudo » suit les règles des pseudos (handle-rules.ts) : 3 à 24
//    caractères, lettres, chiffres, point, tiret bas, commence et finit par
//    une lettre ou un chiffre ; majuscules acceptées à la saisie ;
//  - jamais au milieu d'un mot ni d'une adresse e-mail (« moi@exemple.fr ») ;
//  - au plus MENTION_MAX_PER_MESSAGE personnes prévenues par message.
import { HANDLE_MAX, HANDLE_MIN } from "./handle-rules";

export const MENTION_MAX_PER_MESSAGE = 5;

// Précédé d'un début de texte ou d'un caractère qui n'appartient pas à un
// pseudo, une adresse ou un lien ; un pseudo finit toujours par une lettre
// ou un chiffre (le point d'une fin de phrase n'en fait pas partie).
const MENTION_RE = /(^|[^A-Za-z0-9._@/])@([A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?)/g;

/** Pseudos mentionnés dans un texte, en minuscules, sans doublon, dans l'ordre. */
export function extractMentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const handle = m[2].toLowerCase();
    if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) continue;
    if (!out.includes(handle)) out.push(handle);
  }
  return out;
}

export type MentionPart = { kind: "text"; text: string } | { kind: "mention"; handle: string; text: string };

/** Découpe un texte en morceaux de texte et en mentions (affichage en liens). */
export function splitMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const handle = m[2].toLowerCase();
    if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) continue;
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({ kind: "mention", handle, text: `@${m[2]}` });
    last = start + 1 + m[2].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/**
 * Mention en cours de saisie juste avant le curseur (« … @lea| ») : début du
 * « @ » et ce qui est déjà tapé, pour proposer des membres. null sinon.
 */
export function mentionAtCursor(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const m = /(^|[^A-Za-z0-9._@/])@([A-Za-z0-9._]{0,24})$/.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2].toLowerCase() };
}

/** Remplace la mention en cours de saisie par « @pseudo » suivi d'une espace. */
export function insertMention(text: string, at: { start: number; query: string }, handle: string): { text: string; cursor: number } {
  const end = at.start + 1 + at.query.length;
  const inserted = `@${handle} `;
  const rest = text.slice(end).replace(/^ /, "");
  return { text: text.slice(0, at.start) + inserted + rest, cursor: at.start + inserted.length };
}
