import { beforeEach, describe, expect, it } from "vitest";

// Rangs rééquilibrés (10/10/2026, retour de Lucas : « une vidéo et deux,
// trois succès, et je suis presque Émergent III »). Sur une vraie base : un
// compte déjà évalué est recalculé une seule fois (XP enregistrés aux
// nouvelles valeurs, rang recalculé, paliers en trop retirés, une annonce) ;
// un compte neuf reçoit le repère sans recalcul.
import { prisma } from "@/lib/prisma";
import { MIGRATION_KEY, XP_RECALC_KEY, catalogXp, evaluateReussites } from "@/lib/reussites/engine";
import { achievementUnlockDb, userReussitesDb } from "@/lib/prisma-extra";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const keys = async (userId: string) => new Set((await achievementUnlockDb.findMany({ where: { userId } })).map((u) => u.key));

describe.skipIf(!hasDatabase)("recalcul unique des XP et des rangs", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("valeurs du catalogue : premiers pas réduits", () => {
    expect(catalogXp("star-regularite-1")).toBe(15);
    expect(catalogXp("star-regularite-2")).toBe(60);
    expect(catalogXp("first-post")).toBe(20);
    expect(catalogXp("launch")).toBe(50);
    expect(catalogXp("multi-network")).toBe(40);
    expect(catalogXp("rank-4")).toBeNull();
  });

  it("compte déjà évalué : XP aux nouvelles valeurs, rang recalculé (il peut baisser), paliers en trop retirés, une seule annonce", async () => {
    const { user } = await makeBrand();
    const now = new Date();
    // Comme Lucas : premiers pas comptés aux anciennes valeurs, Émergent III atteint.
    const old: [string, number][] = [
      ["first-post", 50],
      ["launch", 100],
      ["multi-network", 80],
      ["star-regularite-1", 40],
      ["star-formats-1", 40],
      ["star-portee-1", 40],
      ["star-communaute-1", 40],
      ["star-strategie-1", 40]
    ];
    for (const [key, xp] of old) await achievementUnlockDb.create({ data: { userId: user.id, key, xp, celebratedAt: now } });
    for (const step of [2, 3, 4, 5, 6]) await achievementUnlockDb.create({ data: { userId: user.id, key: `rank-${step}`, xp: 0, celebratedAt: now } });
    await achievementUnlockDb.create({ data: { userId: user.id, key: "level-4", xp: 0, celebratedAt: now } });
    await achievementUnlockDb.create({ data: { userId: user.id, key: MIGRATION_KEY, xp: 0, celebratedAt: now } });
    await userReussitesDb.update({ where: { id: user.id }, data: { reussitesCheckedAt: new Date(Date.now() - DAY), creatorXp: 470, creatorLevel: 6 } });

    const r = await evaluateReussites(user.id, { force: true });
    // 20 + 50 + 40 + 5 × 15 = 185 XP (+ missions éventuelles) : Lancement II.
    expect((await achievementUnlockDb.findFirst({ where: { userId: user.id, key: "star-regularite-1" } }))?.xp).toBe(15);
    expect((await achievementUnlockDb.findFirst({ where: { userId: user.id, key: "launch" } }))?.xp).toBe(50);
    expect(r!.xp).toBeGreaterThanOrEqual(185);
    expect(r!.level.name).toBe("Lancement II");
    const have = await keys(user.id);
    expect(have.has("rank-2")).toBe(true);
    for (const k of ["rank-3", "rank-4", "rank-5", "rank-6", "level-4"]) expect(have.has(k), k).toBe(false);
    expect(have.has(XP_RECALC_KEY)).toBe(true);
    expect((await userReussitesDb.findUnique({ where: { id: user.id }, select: { creatorLevel: true } }))?.creatorLevel).toBe(2);
    // Une seule annonce, aucune carte « nouveau rang ».
    const notes = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(notes.filter((n: { dedupeKey: string | null }) => n.dedupeKey === "reussites:recalc-2026-10")).toHaveLength(1);
    expect(notes.filter((n: { dedupeKey: string | null }) => n.dedupeKey?.startsWith("rank:"))).toHaveLength(0);
    expect(await achievementUnlockDb.count({ where: { userId: user.id, celebratedAt: null } })).toBe(0);

    // Une seule fois : un palier gagné ensuite n'est plus jamais retiré.
    await achievementUnlockDb.create({ data: { userId: user.id, key: "posts-500", xp: 500, celebratedAt: now } });
    const again = await evaluateReussites(user.id, { force: true });
    expect(again!.level.name).toBe("Émergent I");
    expect((await achievementUnlockDb.findFirst({ where: { userId: user.id, key: "posts-500" } }))?.xp).toBe(500);
    expect(await prisma.notification.count({ where: { userId: user.id, dedupeKey: "reussites:recalc-2026-10" } })).toBe(1);
  });

  it("compte neuf : repère posé dès la première évaluation, sans recalcul ni annonce", async () => {
    const { user } = await makeBrand();
    await evaluateReussites(user.id, { force: true });
    expect((await keys(user.id)).has(XP_RECALC_KEY)).toBe(true);
    expect(await prisma.notification.count({ where: { userId: user.id, dedupeKey: "reussites:recalc-2026-10" } })).toBe(0);
  });
});
