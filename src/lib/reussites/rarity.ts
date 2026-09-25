// Rareté réelle des badges (Réussites v2, lot C).
//
// Part des créateurs (comptes qui ont publié au moins une fois) qui ont
// chaque accomplissement ou étoile, recalculée au plus une fois par jour
// (à la première ouverture de Réussites qui la trouve périmée). Seulement
// des totaux, jamais qui a quoi. En dessous de 20 créateurs, pas de
// rareté : une part calculée sur si peu de monde ne dirait rien.
//
// La forme du badge dépend de sa rareté (pas seulement la couleur) :
// commun = rond, rare = hexagone, épique = étoile à 8 branches,
// légendaire = étoile et halo.
import { prisma } from "@/lib/prisma";
import { achievementUnlockDb } from "@/lib/prisma-extra";
import { ALL_TIERS } from "./catalog";
import { ALL_STARS } from "./skills";

export const RARITY_MIN_CREATORS = 20;
const STALE_MS = 24 * 3_600_000;

export type RarityTier = "commun" | "rare" | "epique" | "legendaire";

export const RARITY_LABEL: Record<RarityTier, string> = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };

/** Palier de rareté d'une part (0–1), ou null si trop peu de créateurs. */
export function rarityTier(share: number, creators: number): RarityTier | null {
  if (creators < RARITY_MIN_CREATORS) return null;
  if (share > 0.25) return "commun";
  if (share >= 0.05) return "rare";
  if (share >= 0.01) return "epique";
  return "legendaire";
}

interface RarityRow {
  key: string;
  owners: number;
  creators: number;
  share: number;
  computedAt: Date;
}

interface RarityDelegate {
  findMany(args?: unknown): Promise<RarityRow[]>;
  findFirst(args?: unknown): Promise<RarityRow | null>;
  upsert(args: unknown): Promise<RarityRow>;
}
const rarityDb = (prisma as unknown as { badgeRarity: RarityDelegate }).badgeRarity;

const BADGE_KEYS = [...ALL_TIERS.map((t) => t.key), ...ALL_STARS.map((s) => s.key)];

/** Recalcule la rareté de tous les badges (totaux seulement). */
export async function computeRarity(now: Date = new Date()): Promise<number> {
  const [creators, groups] = await Promise.all([
    prisma.user.count({ where: { posts: { some: { targets: { some: { status: "PUBLISHED" } } } } } }),
    (achievementUnlockDb as unknown as { groupBy(args: unknown): Promise<{ key: string; _count: { _all: number } }[]> }).groupBy({
      by: ["key"],
      where: { key: { in: BADGE_KEYS } },
      _count: { _all: true }
    })
  ]);
  const owners = new Map(groups.map((g) => [g.key, g._count._all]));
  for (const key of BADGE_KEYS) {
    const n = owners.get(key) ?? 0;
    const share = creators > 0 ? Math.min(1, n / creators) : 0;
    await rarityDb.upsert({ where: { key }, update: { owners: n, creators, share, computedAt: now }, create: { key, owners: n, creators, share, computedAt: now } });
  }
  return creators;
}

/** Rareté de chaque badge (recalculée si elle date de plus d'un jour). */
export async function rarityMap(now: Date = new Date()): Promise<Map<string, { share: number; tier: RarityTier | null }>> {
  let rows = await rarityDb.findMany();
  const oldest = rows.reduce<number>((min, r) => Math.min(min, new Date(r.computedAt).getTime()), Infinity);
  if (rows.length < BADGE_KEYS.length || now.getTime() - oldest > STALE_MS) {
    try {
      await computeRarity(now);
      rows = await rarityDb.findMany();
    } catch (err) {
      console.error("[reussites] rareté non recalculée :", (err as Error).message);
    }
  }
  return new Map(rows.map((r) => [r.key, { share: r.share, tier: rarityTier(r.share, r.creators) }]));
}
