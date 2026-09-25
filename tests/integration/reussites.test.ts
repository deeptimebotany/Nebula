import { beforeEach, describe, expect, it } from "vitest";

// Réussites v2 (lot A) sur une vraie base : missions de la semaine, choix,
// coffre, boucliers de série et passage des niveaux aux rangs.
import { prisma } from "@/lib/prisma";
import { evaluateReussites } from "@/lib/reussites/engine";
import { chooseProgress, openChest } from "@/lib/reussites/weekly";
import { weekOf } from "@/lib/reussites/periods";
import { achievementUnlockDb, challengeCompletionDb, reussiteItemDb, userReussitesDb, weeklyMissionsDb } from "@/lib/prisma-extra";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;

async function setup(networks: string[] = ["INSTAGRAM", "FACEBOOK", "YOUTUBE"]) {
  const { user, brand } = await makeBrand();
  const connections = [];
  for (const network of networks) {
    connections.push(
      await prisma.socialConnection.create({
        data: { brandId: brand.id, network, externalAccountId: `${network}-${brand.id}`, displayName: network, accessToken: "t" }
      })
    );
  }
  return { user, brand, connections };
}

/** Publication réellement en ligne à cette date, sur ces connexions. */
async function published(userId: string, brandId: string, connectionIds: string[], at: Date) {
  const post = await prisma.post.create({ data: { brandId, createdById: userId, caption: "Publication", status: "PUBLISHED", createdAt: at } });
  for (const connectionId of connectionIds) {
    const c = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
    await prisma.postTarget.create({ data: { postId: post.id, connectionId, network: c!.network, status: "PUBLISHED", publishedAt: at } });
  }
  return post;
}

describe.skipIf(!hasDatabase)("Réussites v2 : missions, coffre, boucliers", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("missions créées à la première évaluation, Habitude validée par de vraies publications", async () => {
    const { user, brand, connections } = await setup();
    const week = weekOf(new Date());
    const r1 = await evaluateReussites(user.id, { force: true });
    expect(r1).not.toBeNull();
    const row = await weeklyMissionsDb.findUnique({ where: { userId_week: { userId: user.id, week: week.id } } });
    expect(row).toMatchObject({ habitTarget: 1 });
    expect(row!.choices).toHaveLength(3);
    // Mystère non révélée tant que les deux autres ne sont pas faites (sauf à partir de jeudi).
    const mystery = r1!.missions.missions.find((m) => m.slot === "mystery")!;
    expect(mystery.revealed).toBe(new Date() >= new Date(week.start.getTime() + 3 * DAY));

    // Lundi 10 h : compte pour toutes les formulations de la mission Habitude
    // (« publier 1 fois », « publier avant mercredi »).
    const monday = new Date(Math.min(week.start.getTime() + 10 * 3_600_000, Date.now() - 60_000));
    await published(user.id, brand.id, [connections[0].id], monday);
    const r2 = await evaluateReussites(user.id, { force: true });
    const habit = r2!.missions.missions.find((m) => m.slot === "habit")!;
    expect(habit.done).toBe(true);
    const completion = await challengeCompletionDb.findFirst({ where: { userId: user.id, period: week.id, challengeKey: "mission-habit" } });
    expect(completion).toMatchObject({ kind: "MISSION", xp: 30 });
    // Réévaluer ne valide jamais deux fois.
    await evaluateReussites(user.id, { force: true });
    expect(await challengeCompletionDb.count({ where: { userId: user.id, kind: "MISSION", challengeKey: "mission-habit" } })).toBe(1);
  });

  it("Progression : un seul changement par semaine, et seulement parmi les propositions", async () => {
    const { user } = await setup();
    await evaluateReussites(user.id, { force: true });
    const row = (await weeklyMissionsDb.findFirst({ where: { userId: user.id } }))!;
    expect((await chooseProgress(user.id, "prog-inconnue")).ok).toBe(false);
    expect(await chooseProgress(user.id, row.choices[1])).toEqual({ ok: true });
    const second = await chooseProgress(user.id, row.choices[2]);
    expect(second).toMatchObject({ ok: false, status: 409 });
    expect((await weeklyMissionsDb.findFirst({ where: { userId: user.id } }))!.progressKey).toBe(row.choices[1]);
  });

  it("coffre : fermé avant 3 missions, ouvert une seule fois, XP et objet enregistrés", async () => {
    const { user } = await setup();
    await evaluateReussites(user.id, { force: true });
    const week = weekOf(new Date());
    expect(await openChest(user.id, week.id)).toMatchObject({ ok: false, status: 409 });
    for (const slot of ["habit", "progress", "mystery"]) {
      await challengeCompletionDb.create({ data: { userId: user.id, period: week.id, challengeKey: `mission-${slot}`, kind: "MISSION", xp: 30 } });
    }
    const opened = await openChest(user.id, week.id);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect([40, 100]).toContain(opened.xp);
    expect(await openChest(user.id, week.id)).toMatchObject({ ok: false, status: 409 });
    const chest = await challengeCompletionDb.findFirst({ where: { userId: user.id, kind: "CHEST" } });
    expect(chest?.xp).toBe(opened.xp);
    const items = await reussiteItemDb.findMany({ where: { userId: user.id, reason: `chest:${week.id}` } });
    expect(items.length).toBe(opened.item === "shield" || opened.item === "fragment" || opened.item === "feature" ? 1 : 0);
  });

  it("bouclier dépensé automatiquement pour une semaine manquée ; série sauvée", async () => {
    const { user, brand, connections } = await setup();
    const week = weekOf(new Date());
    // Actif il y a 3 et 2 semaines, rien la semaine dernière.
    await published(user.id, brand.id, [connections[0].id], new Date(week.start.getTime() - 20 * DAY));
    await published(user.id, brand.id, [connections[0].id], new Date(week.start.getTime() - 13 * DAY));
    await reussiteItemDb.create({ data: { userId: user.id, item: "shield", qty: 1, reason: "test:don" } });
    // Compte déjà évalué avant (pas de premier passage, qui ne notifie que le récapitulatif).
    await userReussitesDb.update({ where: { id: user.id }, data: { reussitesCheckedAt: new Date(Date.now() - DAY) } });
    const r = await evaluateReussites(user.id, { force: true });
    expect(r!.streak.usedNow).toHaveLength(1);
    expect(r!.streak.streak.current).toBe(3);
    expect(r!.streak.shields).toBe(0);
    expect(await prisma.notification.count({ where: { userId: user.id, title: "Un bouclier a protégé votre série" } })).toBe(1);
    // Pas deux fois.
    const again = await evaluateReussites(user.id, { force: true });
    expect(again!.streak.usedNow).toHaveLength(0);
    expect(await reussiteItemDb.count({ where: { userId: user.id, qty: -1 } })).toBe(1);
  });

  it("passage des niveaux aux rangs : paliers enregistrés sans avalanche, une seule annonce", async () => {
    const { user } = await setup();
    // Compte déjà évalué par l'ancienne version : 700 XP, ancien niveau 4.
    await userReussitesDb.update({ where: { id: user.id }, data: { reussitesCheckedAt: new Date(Date.now() - DAY), creatorXp: 700, creatorLevel: 4 } });
    await achievementUnlockDb.create({ data: { userId: user.id, key: "posts-500", xp: 700, celebratedAt: new Date() } });
    await achievementUnlockDb.create({ data: { userId: user.id, key: "level-4", xp: 0, celebratedAt: new Date() } });
    const r = await evaluateReussites(user.id, { force: true });
    expect(r!.level.name).toBe("Comète III");
    const ranks = await achievementUnlockDb.findMany({ where: { userId: user.id, key: { startsWith: "rank-" } } });
    expect(ranks.map((x) => x.key).sort()).toEqual(["rank-2", "rank-3", "rank-4", "rank-5", "rank-6"]);
    expect(ranks.every((x) => x.celebratedAt)).toBe(true);
    const notes = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(notes.filter((n: { dedupeKey: string | null }) => n.dedupeKey === "reussites:v2")).toHaveLength(1);
    expect(notes.filter((n: { dedupeKey: string | null }) => n.dedupeKey?.startsWith("rank:"))).toHaveLength(0);
    const u = await userReussitesDb.findUnique({ where: { id: user.id }, select: { creatorLevel: true } });
    expect(u?.creatorLevel).toBe(6);
  });
});
