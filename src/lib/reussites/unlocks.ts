// Clés de déblocage d'un compte : easter eggs trouvés ET récompenses
// Réussites (« ach:* », voir catalog.ts → REWARDS). Les cosmétiques, fonds
// et cadres de page bio réservés utilisent la même propriété requiresEgg
// pour les deux : ce fichier est le seul endroit qui sait les distinguer.
import { prisma } from "@/lib/prisma";
import { achievementUnlockDb } from "@/lib/prisma-extra";
import { isReussiteRewardKey, rewardKeysFromUnlocks } from "./catalog";

/** Clés de récompenses Réussites débloquées (« ach:* »). */
export async function reussiteRewardKeys(userId: string): Promise<string[]> {
  const rows = await achievementUnlockDb.findMany({ where: { userId }, select: { key: true } });
  return rewardKeysFromUnlocks(rows.map((r) => r.key));
}

export async function unlockKeysFor(userId: string): Promise<Set<string>> {
  const [eggs, rewards] = await Promise.all([
    prisma.easterEggFound.findMany({ where: { userId }, select: { key: true } }) as Promise<{ key: string }[]>,
    reussiteRewardKeys(userId)
  ]);
  return new Set([...eggs.map((e) => e.key), ...rewards]);
}

/** true si ce compte a débloqué cette clé (easter egg ou récompense Réussites). */
export async function hasUnlockKey(userId: string, key: string): Promise<boolean> {
  if (isReussiteRewardKey(key)) return (await reussiteRewardKeys(userId)).includes(key);
  const found = await prisma.easterEggFound.findUnique({ where: { userId_key: { userId, key } }, select: { id: true } });
  return Boolean(found);
}

/** Libellé de verrou : « Réussite » ou « Easter egg ». */
export function unlockSourceLabel(key: string): string {
  return isReussiteRewardKey(key) ? "Réussite" : "Easter egg";
}
