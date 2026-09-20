// Badges de la communauté Nebula — calculés à la volée à partir de VOTRE
// vraie activité (ForumThread/ForumReply/SharedVideo déjà en base), jamais
// stockés séparément : pas de table dédiée à tenir synchronisée, le calcul
// est trivial (trois COUNT) et toujours exact.

export type BadgeCategory = "threads" | "replies" | "videos";
export type BadgeTier = "bronze" | "argent" | "or";

export interface BadgeDef {
  category: BadgeCategory;
  label: string;
  thresholds: Record<BadgeTier, number>;
}

export const BADGE_DEFS: BadgeDef[] = [
  { category: "threads", label: "Pilier du forum", thresholds: { bronze: 1, argent: 5, or: 20 } },
  { category: "replies", label: "Toujours là pour aider", thresholds: { bronze: 3, argent: 15, or: 50 } },
  { category: "videos", label: "Créateur inspirant", thresholds: { bronze: 1, argent: 5, or: 15 } }
];

const TIER_ORDER: BadgeTier[] = ["bronze", "argent", "or"];

export interface EarnedBadge {
  category: BadgeCategory;
  label: string;
  tier: BadgeTier | null; // null = pas encore de palier atteint
  count: number;
  nextTier: BadgeTier | null; // null = déjà au palier max (or)
  nextThreshold: number | null;
}

export function computeBadges(counts: Record<BadgeCategory, number>): EarnedBadge[] {
  return BADGE_DEFS.map((def) => {
    const count = counts[def.category] ?? 0;
    let tier: BadgeTier | null = null;
    for (const t of TIER_ORDER) {
      if (count >= def.thresholds[t]) tier = t;
    }
    const nextTier = tier === null ? "bronze" : tier === "or" ? null : TIER_ORDER[TIER_ORDER.indexOf(tier) + 1];
    return {
      category: def.category,
      label: def.label,
      tier,
      count,
      nextTier,
      nextThreshold: nextTier ? def.thresholds[nextTier] : null
    };
  });
}
