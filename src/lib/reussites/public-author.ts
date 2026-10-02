// Auteur d'un message de la Communauté tel qu'envoyé au navigateur : nom,
// rang de créateur, anneau d'avatar gagné, vitrine (3 badges choisis) et
// mention « Mentor » (étoile Communauté ★5) et badge « Fondateur » (offres
// fondateurs du 02/10/2026, à vie) — jamais le reste des préférences du
// compte, ni le type d'offre prise.
import { rankAt, ringFromCosmetics, type RingStyle } from "./catalog";
import { MENTOR_STAR, showcaseBadge, type ShowcaseBadge } from "./skills";

/** À passer à `select` (les champs Réussites sont récents : typage souple). */
export const AUTHOR_SELECT = {
  id: true,
  name: true,
  creatorXp: true,
  creatorLevel: true,
  enabledCosmetics: true,
  showcase: true,
  achievementUnlocks: { where: { key: MENTOR_STAR }, select: { key: true } },
  founderSince: true
} as unknown as { id: true; name: true };

export interface PublicAuthor {
  id: string;
  name: string;
  level: number;
  levelName: string;
  title: string | null;
  ring: RingStyle | null;
  showcase: Pick<ShowcaseBadge, "key" | "emoji" | "label">[];
  mentor: boolean;
  /** Badge « Fondateur » : a pris une offre fondateur (gardé à vie). */
  founder: boolean;
}

export function publicAuthor(raw: unknown): PublicAuthor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as {
    id: string;
    name: string;
    creatorXp?: number | null;
    creatorLevel?: number | null;
    enabledCosmetics?: string[] | null;
    showcase?: string[] | null;
    achievementUnlocks?: { key: string }[] | null;
    founderSince?: Date | string | null;
  };
  const lvl = rankAt(a.creatorXp ?? 0, a.creatorLevel ?? 1);
  const showcase = (a.showcase ?? [])
    .map((k) => showcaseBadge(k))
    .filter((b): b is ShowcaseBadge => Boolean(b))
    .map(({ key, emoji, label }) => ({ key, emoji, label }));
  return {
    id: a.id,
    name: a.name,
    level: lvl.level,
    levelName: lvl.name,
    title: lvl.title,
    ring: ringFromCosmetics(a.enabledCosmetics ?? []),
    showcase,
    mentor: Boolean(a.achievementUnlocks?.length),
    founder: Boolean(a.founderSince)
  };
}
