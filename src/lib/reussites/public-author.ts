// Auteur d'un message de la Communauté tel qu'envoyé au navigateur : nom,
// niveau de créateur et anneau d'avatar gagné (jamais le reste des
// préférences du compte).
import { levelFor, ringFromCosmetics, type RingStyle } from "./catalog";

/** À passer à `select` (les champs Réussites sont récents : typage souple). */
export const AUTHOR_SELECT = { id: true, name: true, creatorXp: true, enabledCosmetics: true } as unknown as { id: true; name: true };

export interface PublicAuthor {
  id: string;
  name: string;
  level: number;
  levelName: string;
  title: string | null;
  ring: RingStyle | null;
}

export function publicAuthor(raw: unknown): PublicAuthor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { id: string; name: string; creatorXp?: number | null; enabledCosmetics?: string[] | null };
  const lvl = levelFor(a.creatorXp ?? 0);
  return { id: a.id, name: a.name, level: lvl.level, levelName: lvl.name, title: lvl.title, ring: ringFromCosmetics(a.enabledCosmetics ?? []) };
}
