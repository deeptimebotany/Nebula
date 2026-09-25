// Vitrine du créateur (Réussites v2, lot B) — serveur uniquement : jusqu'à
// 3 badges gagnés (accomplissements ou étoiles), choisis par le créateur,
// montrés à côté de son nom dans la Communauté et sur sa carte de créateur.
// Seuls des badges réellement débloqués peuvent y figurer.
import { achievementUnlockDb, userReussitesDb } from "@/lib/prisma-extra";
import { MAX_SHOWCASE, showcaseBadge } from "./skills";
import type { ActionResult } from "./weekly";

export async function saveShowcase(userId: string, keys: unknown): Promise<ActionResult> {
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string")) return { ok: false, status: 400, error: "Badges invalides." };
  const unique = Array.from(new Set(keys as string[]));
  if (unique.length > MAX_SHOWCASE) return { ok: false, status: 400, error: `${MAX_SHOWCASE} badges au maximum dans la vitrine.` };
  if (unique.some((k) => !showcaseBadge(k))) return { ok: false, status: 400, error: "Badge inconnu." };
  const owned = await achievementUnlockDb.count({ where: { userId, key: { in: unique } } });
  if (owned !== unique.length) return { ok: false, status: 409, error: "Seuls les badges déjà gagnés peuvent aller dans la vitrine." };
  await userReussitesDb.update({ where: { id: userId }, data: { showcase: { set: unique } } });
  return { ok: true };
}
