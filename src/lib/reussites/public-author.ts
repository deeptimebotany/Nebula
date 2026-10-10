// Auteur d'un message de la Communauté tel qu'envoyé au navigateur : pseudo
// (« @comete4821 », jamais le nom du compte depuis le 10/10/2026), photo,
// rang de créateur, anneau d'avatar gagné, vitrine (3 badges choisis) et
// mention « Mentor » (étoile Communauté ★5) et badge « Fondateur » (offres
// fondateurs du 02/10/2026, à vie) — jamais le reste des préférences du
// compte, ni le type d'offre prise.
import { rankAt, ringFromCosmetics, type RingStyle } from "./catalog";
import { MENTOR_STAR, showcaseBadge, type ShowcaseBadge } from "./skills";
import { displayHandle } from "@/lib/community/handle-rules";

/** À passer à `select` (les champs Réussites sont récents : typage souple). */
export const AUTHOR_SELECT = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
  creatorXp: true,
  creatorLevel: true,
  enabledCosmetics: true,
  showcase: true,
  achievementUnlocks: { where: { key: MENTOR_STAR }, select: { key: true } },
  founderSince: true
} as unknown as { id: true; name: true };

export interface PublicAuthor {
  id: string;
  /** « @pseudo » (jamais le nom du compte). */
  name: string;
  /** Pseudo sans @ (lien vers la page de profil). */
  handle: string | null;
  avatarUrl: string | null;
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
    handle?: string | null;
    avatarUrl?: string | null;
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
    name: displayHandle(a.handle),
    handle: a.handle ?? null,
    avatarUrl: a.avatarUrl ?? null,
    level: lvl.level,
    levelName: lvl.name,
    title: lvl.title,
    ring: ringFromCosmetics(a.enabledCosmetics ?? []),
    showcase,
    mentor: Boolean(a.achievementUnlocks?.length),
    founder: Boolean(a.founderSince)
  };
}
