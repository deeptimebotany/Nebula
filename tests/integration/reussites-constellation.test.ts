import { beforeEach, describe, expect, it } from "vitest";

// Réussites v2, lot B, sur une vraie base : étoiles de la constellation
// mesurées sur les données réelles, condition de variété des rangs (rang en
// attente, rang déjà atteint jamais retiré), bilan de la semaine, vitrine.
import { prisma } from "@/lib/prisma";
import { MIGRATION_KEY, evaluateReussites } from "@/lib/reussites/engine";
import { saveReview } from "@/lib/reussites/review";
import { saveShowcase } from "@/lib/reussites/showcase";
import { publicAuthor, AUTHOR_SELECT } from "@/lib/reussites/public-author";
import { reussiteRewardKeys } from "@/lib/reussites/unlocks";
import { buildPage } from "@/lib/reussites/view";
import { weekOf } from "@/lib/reussites/periods";
import { achievementUnlockDb, userReussitesDb, weeklyMissionsDb } from "@/lib/prisma-extra";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const HOUR = 3_600_000;

async function setup(networks: string[] = ["INSTAGRAM", "YOUTUBE"]) {
  const { user, brand } = await makeBrand();
  const connections = [];
  for (const network of networks) {
    connections.push(
      await prisma.socialConnection.create({
        data: { brandId: brand.id, network, externalAccountId: `${network}-${brand.id}`, displayName: network, accessToken: "t" }
      })
    );
  }
  // Compte déjà passé à la v2 : ni premier passage, ni rattrapage.
  await userReussitesDb.update({ where: { id: user.id }, data: { reussitesCheckedAt: new Date(Date.now() - DAY) } });
  await achievementUnlockDb.create({ data: { userId: user.id, key: MIGRATION_KEY, xp: 0, celebratedAt: new Date() } });
  return { user, brand, connections };
}

/** Publication en ligne, éventuellement programmée et avec un média. */
async function published(
  userId: string,
  brandId: string,
  connectionIds: string[],
  at: Date,
  opts: { scheduledLeadMs?: number; media?: { type: string; width?: number; height?: number; importSource?: string }; thumbnail?: string } = {}
) {
  const createdAt = new Date(at.getTime() - (opts.scheduledLeadMs ?? 0));
  const post = await prisma.post.create({
    data: { brandId, createdById: userId, caption: "Publication", status: "PUBLISHED", createdAt, scheduledAt: opts.scheduledLeadMs ? at : null }
  });
  if (opts.media) {
    const asset = await prisma.mediaAsset.create({
      data: { brandId, type: opts.media.type, url: `/u/${post.id}`, filename: "f", mimeType: "video/mp4", sizeBytes: 1, width: opts.media.width, height: opts.media.height, importSource: opts.media.importSource }
    });
    await prisma.postMedia.create({ data: { postId: post.id, mediaAssetId: asset.id, order: 0 } });
  }
  for (const connectionId of connectionIds) {
    const c = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
    await prisma.postTarget.create({
      data: { postId: post.id, connectionId, network: c!.network, status: "PUBLISHED", publishedAt: at, thumbnailStatus: c!.network === "YOUTUBE" ? (opts.thumbnail ?? null) : null }
    });
  }
  return post;
}

const unlocked = async (userId: string) => new Set((await achievementUnlockDb.findMany({ where: { userId } })).map((u) => u.key));

describe.skipIf(!hasDatabase)("Réussites v2, lot B : constellation, rangs, bilan, vitrine", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("étoiles allumées par de vraies données : programmation, semaines actives, verticales, miniatures", async () => {
    const { user, brand, connections } = await setup();
    const [ig, yt] = connections;
    const week = weekOf(new Date());
    // 4 semaines différentes (pas besoin qu'elles se suivent), dont une programmée 2 h à l'avance.
    for (const w of [1, 3, 5, 7]) await published(user.id, brand.id, [ig.id], new Date(week.start.getTime() - w * 7 * DAY + 10 * HOUR), { scheduledLeadMs: w === 1 ? 2 * HOUR : 0 });
    // 3 vidéos verticales, dont 5 miniatures YouTube appliquées au total.
    for (let i = 0; i < 5; i++) {
      await published(user.id, brand.id, [yt.id], new Date(week.start.getTime() - (20 + i) * DAY), {
        media: { type: "VIDEO", width: i < 3 ? 1080 : 1920, height: i < 3 ? 1920 : 1080 },
        thumbnail: "APPLIED"
      });
    }
    const r = await evaluateReussites(user.id, { force: true });
    expect(r).not.toBeNull();
    const keys = await unlocked(user.id);
    expect(keys.has("star-regularite-1")).toBe(true);
    expect(keys.has("star-regularite-2")).toBe(true);
    expect(keys.has("star-formats-2")).toBe(true);
    expect(keys.has("star-formats-4")).toBe(true);
    expect(keys.has("star-formats-1")).toBe(false); // aucun import
    expect(r!.skillMetrics).toMatchObject({ scheduledPublished: 1, verticalVideos: 3, youtubeThumbnails: 5 });
    const star = await achievementUnlockDb.findFirst({ where: { userId: user.id, key: "star-regularite-1" } });
    expect(star?.xp).toBe(40);
    // Plus de 3 étoiles d'un coup : une seule notification groupée.
    const batch = await prisma.notification.findMany({ where: { userId: user.id, dedupeKey: { startsWith: "stars:batch:" } } });
    expect(batch).toHaveLength(1);
    expect(batch[0].body).toContain("Formats vidéo ★4 · Miniature soignée");
    // Réévaluer n'allume jamais deux fois.
    await evaluateReussites(user.id, { force: true });
    expect(await achievementUnlockDb.count({ where: { userId: user.id, key: "star-formats-4" } })).toBe(1);
  });

  it("réponses aux commentaires repérées : Première réponse, puis Conversation et le cadre « Halo »", async () => {
    const { user, connections } = await setup();
    const add = (n: number, replied: boolean) =>
      Promise.all(
        Array.from({ length: n }, (_, i) =>
          prisma.engagementItem.create({
            data: { connectionId: connections[0].id, network: "INSTAGRAM", externalId: `c${replied ? "r" : "n"}${i}-${Date.now()}`, text: "Top", ownerRepliedAt: replied ? new Date() : null }
          })
        )
      );
    await add(3, false);
    await add(1, true);
    await evaluateReussites(user.id, { force: true });
    let keys = await unlocked(user.id);
    expect(keys.has("star-communaute-1")).toBe(true);
    expect(keys.has("star-communaute-3")).toBe(false);
    await add(19, true);
    await evaluateReussites(user.id, { force: true });
    keys = await unlocked(user.id);
    expect(keys.has("star-communaute-3")).toBe(true);
    expect(await reussiteRewardKeys(user.id)).toContain("ach:frame-halo");
  });

  it("rang en attente : XP suffisants mais pas les compétences ; entré dès que la condition est remplie", async () => {
    const { user } = await setup();
    // 1 000 XP (Étoile I demande 900 XP et 2 compétences au niveau 2), palier 6 atteint.
    await achievementUnlockDb.create({ data: { userId: user.id, key: "posts-500", xp: 1000, celebratedAt: new Date() } });
    await userReussitesDb.update({ where: { id: user.id }, data: { creatorLevel: 6, creatorXp: 1000 } });
    const r = await evaluateReussites(user.id, { force: true });
    expect(r!.level).toMatchObject({ level: 6, name: "Comète III", pct: 100 });
    expect(r!.level.pending).toMatchObject({ step: 7, name: "Étoile I", condition: "2 compétences au niveau 2" });
    expect(await prisma.notification.count({ where: { userId: user.id, dedupeKey: "rank-pending:7" } })).toBe(1);
    expect((await unlocked(user.id)).has("rank-7")).toBe(false);

    // Deux compétences au niveau 2.
    for (const key of ["star-regularite-1", "star-regularite-2", "star-portee-1", "star-portee-2"]) {
      await achievementUnlockDb.create({ data: { userId: user.id, key, xp: 0, celebratedAt: new Date() } });
    }
    const again = await evaluateReussites(user.id, { force: true });
    expect(again!.level).toMatchObject({ level: 7, name: "Étoile I", pending: null });
    expect((await userReussitesDb.findUnique({ where: { id: user.id }, select: { creatorLevel: true } }))?.creatorLevel).toBe(7);
  });

  it("passage à la v2 d'un compte déjà haut placé : rang gardé sans condition, étoiles en silence, une seule annonce", async () => {
    const { user, brand, connections } = await makeBrand().then(async (x) => ({
      ...x,
      connections: [await prisma.socialConnection.create({ data: { brandId: x.brand.id, network: "INSTAGRAM", externalAccountId: `ig-${x.brand.id}`, displayName: "IG", accessToken: "t" } })]
    }));
    await published(user.id, brand.id, [connections[0].id], new Date(Date.now() - 3 * DAY), { scheduledLeadMs: 2 * HOUR });
    await achievementUnlockDb.create({ data: { userId: user.id, key: "posts-500", xp: 1000, celebratedAt: new Date() } });
    await userReussitesDb.update({ where: { id: user.id }, data: { reussitesCheckedAt: new Date(Date.now() - DAY), creatorXp: 1000, creatorLevel: 5 } });
    const r = await evaluateReussites(user.id, { force: true });
    expect(r!.level.name).toBe("Étoile I");
    expect(r!.level.pending).toBeNull();
    const keys = await unlocked(user.id);
    expect(keys.has(MIGRATION_KEY)).toBe(true);
    expect(keys.has("star-regularite-1")).toBe(true);
    const notes = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(notes.filter((n: { dedupeKey: string | null }) => n.dedupeKey === "reussites:v2")).toHaveLength(1);
    expect(notes.filter((n: { dedupeKey: string | null }) => n.dedupeKey?.startsWith("star:"))).toHaveLength(0);
    expect(notes.filter((n: { dedupeKey: string | null }) => n.dedupeKey?.startsWith("rank-pending:"))).toHaveLength(0);
  });

  it("bilan de la semaine : cap enregistré une fois (modifiable), étoile Premier bilan, Rituel sur 3 semaines", async () => {
    const { user } = await setup();
    expect((await saveReview(user.id, "slot")).ok).toBe(false); // semaine pas encore créée
    await evaluateReussites(user.id, { force: true });
    expect(await saveReview(user.id, "inconnu")).toMatchObject({ ok: false, status: 400 });
    expect(await saveReview(user.id, "format")).toEqual({ ok: true });
    const week = weekOf(new Date());
    const first = await weeklyMissionsDb.findUnique({ where: { userId_week: { userId: user.id, week: week.id } } });
    expect(first).toMatchObject({ reviewFocus: "format" });
    expect(first!.reviewedAt).not.toBeNull();
    await saveReview(user.id, "new");
    const second = await weeklyMissionsDb.findUnique({ where: { userId_week: { userId: user.id, week: week.id } } });
    expect(second).toMatchObject({ reviewFocus: "new" });
    expect(second!.reviewedAt!.getTime()).toBe(first!.reviewedAt!.getTime());
    await evaluateReussites(user.id, { force: true });
    expect((await unlocked(user.id)).has("star-strategie-1")).toBe(true);

    // Deux semaines précédentes avec un bilan : 3 d'affilée.
    for (const w of [1, 2]) {
      const at = new Date(week.start.getTime() - w * 7 * DAY + DAY);
      await weeklyMissionsDb.create({
        data: { userId: user.id, week: weekOf(at).id, habitKey: "habit-posts", habitTarget: 1, choices: [], progressKey: "prog-plan3", mysteryKey: "mys-weekend", reviewedAt: at, reviewFocus: "rhythm" }
      });
    }
    await evaluateReussites(user.id, { force: true });
    expect((await unlocked(user.id)).has("star-strategie-2")).toBe(true);

    const page = await buildPage(user.id);
    expect(page!.review).toMatchObject({ done: true, focus: "new" });
    expect(page!.review.options.map((o) => o.key)).toEqual(["format", "slot", "rhythm", "new"]);
  });

  it("vitrine : seulement des badges gagnés, 3 au plus, visibles dans la Communauté", async () => {
    const { user } = await setup();
    await achievementUnlockDb.create({ data: { userId: user.id, key: "first-post", xp: 50, celebratedAt: new Date() } });
    await achievementUnlockDb.create({ data: { userId: user.id, key: "star-communaute-5", xp: 150, celebratedAt: new Date() } });
    expect(await saveShowcase(user.id, ["first-post", "viral"])).toMatchObject({ ok: false, status: 409 });
    expect(await saveShowcase(user.id, ["first-post", "a", "b", "c"])).toMatchObject({ ok: false, status: 400 });
    expect(await saveShowcase(user.id, ["star-communaute-5", "first-post"])).toEqual({ ok: true });
    const raw = await prisma.user.findUnique({ where: { id: user.id }, select: AUTHOR_SELECT });
    const author = publicAuthor(raw);
    expect(author?.mentor).toBe(true);
    expect(author?.showcase.map((b) => b.key)).toEqual(["star-communaute-5", "first-post"]);
    expect(author?.showcase[0].label).toBe("Communauté ★5 · Mentor");
  });
});
