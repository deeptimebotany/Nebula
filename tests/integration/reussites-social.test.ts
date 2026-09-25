import { beforeEach, describe, expect, it } from "vitest";

// Réussites v2, lot C, sur une vraie base : défi collectif (objectif
// automatique, objectif atteint, badge accordé au retour), badge de saison,
// vidéo à la une (accord, tickets, file d'attente, retrait), Premier
// décollage, badge Explorateur (caché tant qu'il n'est pas gagné), rareté.
import { prisma } from "@/lib/prisma";
import { MIGRATION_KEY, evaluateReussites } from "@/lib/reussites/engine";
import { COLLECTIVE_MIN_TARGET, clearCollectiveCache, ensureCollective, setCollectiveTarget } from "@/lib/reussites/collective";
import { SEASON_XP, seasonOfMonth } from "@/lib/reussites/seasons";
import { FEATURE_DAYS, adminFeature, currentFeatured, featureTickets, featuredAdminView, grantRankTicket, removeFeatured, setFeatureConsent, spendFeatureTicket } from "@/lib/reussites/featured";
import { RARITY_MIN_CREATORS, computeRarity, rarityMap } from "@/lib/reussites/rarity";
import { monthlyChallengeFor } from "@/lib/reussites/catalog";
import { monthOf } from "@/lib/reussites/periods";
import { buildPage } from "@/lib/reussites/view";
import { achievementUnlockDb, challengeCompletionDb, reussiteItemDb, userReussitesDb } from "@/lib/prisma-extra";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;

async function setup(opts: { fresh?: boolean } = {}) {
  const { user, brand } = await makeBrand();
  const connection = await prisma.socialConnection.create({
    data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: `ig-${brand.id}`, displayName: "IG", accessToken: "t" }
  });
  if (!opts.fresh) {
    // Compte déjà passé à la v2, créé il y a longtemps (pas de Premier décollage).
    await userReussitesDb.update({ where: { id: user.id }, data: { reussitesCheckedAt: new Date(Date.now() - DAY) } });
    await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date(Date.now() - 60 * DAY) } });
    await achievementUnlockDb.create({ data: { userId: user.id, key: MIGRATION_KEY, xp: 0, celebratedAt: new Date() } });
  }
  return { user, brand, connection };
}

/** Vidéo mise en ligne à une date donnée. */
async function video(userId: string, brandId: string, connectionId: string, at: Date, opts: { scheduled?: boolean } = {}) {
  const post = await prisma.post.create({
    data: { brandId, createdById: userId, caption: "Vidéo", status: "PUBLISHED", createdAt: at, scheduledAt: opts.scheduled ? at : null }
  });
  const asset = await prisma.mediaAsset.create({
    data: { brandId, type: "VIDEO", url: `/u/${post.id}`, filename: "v.mp4", mimeType: "video/mp4", sizeBytes: 1, width: 1080, height: 1920 }
  });
  await prisma.postMedia.create({ data: { postId: post.id, mediaAssetId: asset.id, order: 0 } });
  await prisma.postTarget.create({ data: { postId: post.id, connectionId, network: "INSTAGRAM", status: "PUBLISHED", publishedAt: at } });
  return post;
}

async function shared(authorId: string, title: string, ageDays = 1) {
  return prisma.sharedVideo.create({
    data: { authorId, network: "YOUTUBE", title, externalUrl: `https://youtu.be/${title}`, createdAt: new Date(Date.now() - ageDays * DAY) }
  });
}

const unlocked = async (userId: string) => new Set((await achievementUnlockDb.findMany({ where: { userId } })).map((u) => u.key));
const collectiveRow = (month: string) =>
  (prisma as unknown as { collectiveChallenge: { findUnique(a: unknown): Promise<{ target: number; source: string; reachedAt: Date | null } | null> } }).collectiveChallenge.findUnique({
    where: { month }
  });

describe.skipIf(!hasDatabase)("Réussites v2, lot C : défis partagés, une, décollage, rareté", () => {
  beforeEach(async () => {
    await resetDatabase();
    clearCollectiveCache();
  });

  it("défi collectif : objectif automatique (mois précédent + 10 %, au moins 10), puis modifiable", async () => {
    const { user, brand, connection } = await setup();
    const month = monthOf(new Date());
    const previous = monthOf(new Date(month.start.getTime() - DAY));
    // 3 vidéos le mois dernier : 3 × 1,1 → 4, donc le minimum de 10.
    for (let i = 0; i < 3; i++) await video(user.id, brand.id, connection.id, new Date(previous.start.getTime() + (i + 1) * DAY));
    const row = await ensureCollective(month);
    expect(row).toMatchObject({ target: COLLECTIVE_MIN_TARGET, source: "auto", metric: "videos" });
    // Créé une seule fois : relire ne change rien.
    expect((await ensureCollective(month)).id).toBe(row.id);
    const set = await setCollectiveTarget(3);
    expect(set).toMatchObject({ target: 3, source: "admin" });
  });

  it("objectif atteint : badge collectif et 50 XP pour chaque participant, jamais pour les autres", async () => {
    const a = await setup();
    const b = await setup();
    const idle = await setup();
    await setCollectiveTarget(2);
    const now = new Date();
    await video(a.user.id, a.brand.id, a.connection.id, new Date(now.getTime() - 60_000));
    const first = await evaluateReussites(a.user.id, { force: true });
    expect(first!.collective).toMatchObject({ total: 1, target: 2, earned: false, reachedAt: null });

    await video(b.user.id, b.brand.id, b.connection.id, new Date(now.getTime() - 30_000));
    clearCollectiveCache();
    const second = await evaluateReussites(b.user.id, { force: true });
    expect(second!.collective).toMatchObject({ total: 2, participants: 2, mine: 1, earned: true });
    expect(second!.collective.reachedAt).not.toBeNull();
    const month = monthOf(now).id;
    expect(await challengeCompletionDb.findFirst({ where: { userId: b.user.id, period: month, kind: "COLLECTIVE" } })).toMatchObject({ xp: 50 });
    expect(await prisma.notification.count({ where: { userId: b.user.id, dedupeKey: `collective:${month}` } })).toBe(1);

    // Le premier participant le reçoit à sa prochaine visite ; celui qui n'a rien publié, jamais.
    await evaluateReussites(a.user.id, { force: true });
    expect(await challengeCompletionDb.count({ where: { userId: a.user.id, period: month, kind: "COLLECTIVE" } })).toBe(1);
    const idleResult = await evaluateReussites(idle.user.id, { force: true });
    expect(idleResult!.collective).toMatchObject({ mine: 0, earned: false });
    expect(await challengeCompletionDb.count({ where: { userId: idle.user.id, kind: "COLLECTIVE" } })).toBe(0);

    // Réévaluer n'accorde jamais deux fois.
    await evaluateReussites(b.user.id, { force: true });
    expect(await challengeCompletionDb.count({ where: { userId: b.user.id, kind: "COLLECTIVE" } })).toBe(1);
    const page = await buildPage(b.user.id);
    expect(page!.collective).toMatchObject({ reached: true, earned: true, xp: 50 });
    expect(page!.seasons.collective.map((c) => c.month)).toContain(month);
  });

  it("mois précédent : objectif atteint pendant l'absence du créateur, badge accordé à son retour", async () => {
    const { user, brand, connection } = await setup();
    const month = monthOf(new Date());
    const previous = monthOf(new Date(month.start.getTime() - DAY));
    await video(user.id, brand.id, connection.id, new Date(previous.start.getTime() + 2 * DAY));
    await (prisma as unknown as { collectiveChallenge: { create(a: unknown): Promise<unknown> } }).collectiveChallenge.create({
      data: { month: previous.id, target: 1, source: "auto", reachedAt: new Date(previous.start.getTime() + 3 * DAY) }
    });
    await evaluateReussites(user.id, { force: true });
    expect(await challengeCompletionDb.findFirst({ where: { userId: user.id, period: previous.id, kind: "COLLECTIVE" } })).not.toBeNull();
    expect(await prisma.notification.count({ where: { userId: user.id, dedupeKey: `collective:${previous.id}` } })).toBe(1);
    // Ce mois-ci : pas encore atteint (objectif automatique : 1 × 1,1 → minimum 10).
    expect((await collectiveRow(month.id))?.target).toBe(COLLECTIVE_MIN_TARGET);
  });

  it("badge de saison : 2 défis du mois réussis dans la saison, une seule fois", async () => {
    const { user } = await setup();
    const month = monthOf(new Date());
    const season = seasonOfMonth(month.id);
    const def = monthlyChallengeFor(month.index);
    const other = season.months.find((m) => m !== month.id)!;
    await challengeCompletionDb.create({ data: { userId: user.id, period: month.id, challengeKey: def.key, kind: "MONTHLY", xp: def.xp, celebratedAt: new Date() } });
    await evaluateReussites(user.id, { force: true });
    expect(await challengeCompletionDb.count({ where: { userId: user.id, kind: "SEASON" } })).toBe(0); // un seul défi

    await challengeCompletionDb.create({ data: { userId: user.id, period: other, challengeKey: "autre", kind: "MONTHLY", xp: 0, celebratedAt: new Date() } });
    await evaluateReussites(user.id, { force: true });
    await evaluateReussites(user.id, { force: true });
    const badges = await challengeCompletionDb.findMany({ where: { userId: user.id, kind: "SEASON" } });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ period: season.id, challengeKey: "season", xp: SEASON_XP });
    expect(await prisma.notification.count({ where: { userId: user.id, dedupeKey: `season:${season.id}` } })).toBe(1);
    const page = await buildPage(user.id);
    expect(page!.seasons.current).toMatchObject({ id: season.id, earned: true, target: 2 });
    expect(page!.seasons.badges.map((b) => b.id)).toEqual([season.id]);
  });

  it("vidéo à la une : accord, tickets (rang, coffre), dépense unique, vidéo déjà à la une refusée", async () => {
    const { user } = await setup();
    const other = await setup();
    expect(await grantRankTicket(user.id)).toBe(true);
    expect(await grantRankTicket(user.id)).toBe(false); // une seule fois
    await reussiteItemDb.create({ data: { userId: user.id, item: "feature", qty: 1, reason: "chest:2026-W39" } });
    expect(await featureTickets(user.id)).toBe(2);

    const mine = await shared(user.id, "ma-video");
    const theirs = await shared(other.user.id, "sa-video");
    expect(await spendFeatureTicket(user.id, mine.id)).toMatchObject({ ok: false, status: 409 }); // pas d'accord
    await setFeatureConsent(user.id, true);
    expect(await spendFeatureTicket(user.id, theirs.id)).toMatchObject({ ok: false, status: 404 });
    const used = await spendFeatureTicket(user.id, mine.id);
    expect(used.ok).toBe(true);
    expect(await featureTickets(user.id)).toBe(1);
    expect(await spendFeatureTicket(user.id, mine.id)).toMatchObject({ ok: false, status: 409 }); // déjà à la une
    expect(await featureTickets(user.id)).toBe(1);

    const page = await buildPage(user.id);
    expect(page!.featured).toMatchObject({ consent: true, tickets: 1 });
    expect(page!.featured.mine).toHaveLength(1);
    expect(page!.featured.mine[0]).toMatchObject({ title: "ma-video", live: true });
    expect(page!.featured.shared.find((v) => v.id === mine.id)?.featured).toBe(true);

    // Retirer son accord retire aussi ses vidéos à la une.
    await setFeatureConsent(user.id, false);
    expect((await currentFeatured()).some((c) => c.sharedVideoId === mine.id)).toBe(false);
    expect((await buildPage(user.id))!.featured.mine).toHaveLength(0);
  });

  it("3 places : la 4e attend la première place libre ; places libres complétées ; retrait par le créateur ou l'admin", async () => {
    const creators = [];
    for (let i = 0; i < 5; i++) {
      const c = await setup();
      await setFeatureConsent(c.user.id, true);
      creators.push({ ...c, video: await shared(c.user.id, `video-${i}`, i + 1) });
    }
    const refuses = await setup();
    const refused = await shared(refuses.user.id, "sans-accord", 0);
    expect(await adminFeature(refused.id)).toMatchObject({ ok: false, status: 409 });

    // Une seule vidéo à la une : les 2 autres places sont complétées (une vidéo par créateur).
    expect((await adminFeature(creators[0].video.id)).ok).toBe(true);
    let live = await currentFeatured();
    expect(live).toHaveLength(3);
    expect(live[0]).toMatchObject({ sharedVideoId: creators[0].video.id, source: "admin" });
    expect(live.slice(1).every((c) => c.source === "auto")).toBe(true);
    expect(live.some((c) => c.sharedVideoId === refused.id)).toBe(false);

    for (const c of creators.slice(1, 4)) await grantRankTicket(c.user.id);
    for (const c of creators.slice(1, 4)) expect((await spendFeatureTicket(c.user.id, c.video.id)).ok).toBe(true);
    const view = await featuredAdminView();
    expect(view.scheduled).toHaveLength(4);
    expect(view.scheduled.filter((s) => s.live)).toHaveLength(3);
    const waiting = view.scheduled.find((s) => !s.live)!;
    expect(waiting.title).toBe("video-3");
    // Commence quand la première se termine, pour 7 jours.
    const firstEnd = new Date(view.scheduled[0].endsAt).getTime();
    expect(new Date(waiting.startsAt).getTime()).toBe(firstEnd);
    expect(new Date(waiting.endsAt).getTime() - new Date(waiting.startsAt).getTime()).toBe(FEATURE_DAYS * DAY);
    live = await currentFeatured();
    expect(live.map((c) => c.source)).toEqual(["admin", "reward", "reward"]);
    expect(view.candidates.some((v) => v.id === refused.id)).toBe(false);
    // Déjà à la une ou en attente : repérées pour l'admin (pas de second bouton).
    expect(view.candidates.filter((v) => v.featured).map((v) => v.title).sort()).toEqual(["video-0", "video-1", "video-2", "video-3"]);
    expect(view.candidates.find((v) => v.title === "video-4")?.featured).toBe(false);

    // Retrait : un autre créateur ne peut pas ; le créateur ou l'admin, oui.
    const row = view.scheduled.find((s) => s.title === "video-1")!;
    expect(await removeFeatured(row.id, { userId: creators[2].user.id, admin: false })).toMatchObject({ ok: false, status: 403 });
    expect(await removeFeatured(row.id, { userId: creators[1].user.id, admin: false })).toEqual({ ok: true });
    const byAdmin = view.scheduled.find((s) => s.title === "video-2")!;
    expect(await removeFeatured(byAdmin.id, { userId: "proprietaire", admin: true })).toEqual({ ok: true });
    const removed = await (prisma as unknown as { featuredVideo: { findUnique(a: unknown): Promise<{ removedBy: string | null } | null> } }).featuredVideo.findUnique({
      where: { id: byAdmin.id }
    });
    expect(removed?.removedBy).toBe("admin");
    expect(await removeFeatured(row.id, { userId: creators[1].user.id, admin: false })).toMatchObject({ ok: false, status: 404 });
  });

  it("Premier décollage : 5 étapes réelles, carte active 7 jours, accomplissement « Décollage réussi »", async () => {
    const { user, brand, connection } = await setup({ fresh: true });
    const start = await evaluateReussites(user.id, { force: true });
    expect(start!.launch).toMatchObject({ active: true, done: 1, pct: 36 }); // réseau connecté
    expect(start!.launch.steps.map((s) => s.key)).toEqual(["connect", "video", "schedule", "publish", "stats"]);

    await video(user.id, brand.id, connection.id, new Date(Date.now() - 3_600_000), { scheduled: true });
    await prisma.analyticsSnapshot.create({ data: { connectionId: connection.id, network: "INSTAGRAM", followers: 10 } });
    const done = await evaluateReussites(user.id, { force: true });
    expect(done!.launch).toMatchObject({ active: false, done: 5, pct: 100 });
    expect((await unlocked(user.id)).has("launch")).toBe(true);
    expect((await achievementUnlockDb.findFirst({ where: { userId: user.id, key: "launch" } }))?.xp).toBe(100);

    // Compte ancien : pas de carte, même sans étapes faites.
    const old = await setup();
    expect((await evaluateReussites(old.user.id, { force: true }))!.launch.active).toBe(false);
  });

  it("Explorateur : caché tant qu'il n'est pas gagné, débloqué par 2 outils essayés avant l'inscription", async () => {
    const { user } = await setup();
    await prisma.user.update({ where: { id: user.id }, data: { toolsExplored: 1 } });
    await evaluateReussites(user.id, { force: true });
    let page = await buildPage(user.id);
    expect(page!.series.some((s) => s.id === "explorer")).toBe(false);
    const totalHidden = page!.total;

    await prisma.user.update({ where: { id: user.id }, data: { toolsExplored: 2 } });
    await evaluateReussites(user.id, { force: true });
    expect((await unlocked(user.id)).has("explorer")).toBe(true);
    page = await buildPage(user.id);
    expect(page!.series.find((s) => s.id === "explorer")?.tiers[0].unlockedAt).not.toBeNull();
    expect(page!.total).toBe(totalHidden + 1);
  });

  it("rareté : part des créateurs par badge, rien en dessous de 20 créateurs", async () => {
    const creators = [];
    for (let i = 0; i < RARITY_MIN_CREATORS; i++) {
      const c = await setup();
      await video(c.user.id, c.brand.id, c.connection.id, new Date(Date.now() - (i + 2) * DAY));
      creators.push(c);
    }
    // Compte sans publication : ne compte pas comme créateur.
    await setup();
    for (const c of creators.slice(0, 10)) await achievementUnlockDb.create({ data: { userId: c.user.id, key: "first-post", xp: 50, celebratedAt: new Date() } });
    await achievementUnlockDb.create({ data: { userId: creators[0].user.id, key: "star-communaute-5", xp: 150, celebratedAt: new Date() } });

    expect(await computeRarity()).toBe(RARITY_MIN_CREATORS);
    let map = await rarityMap();
    expect(map.get("first-post")).toEqual({ share: 0.5, tier: "commun" });
    expect(map.get("star-communaute-5")).toEqual({ share: 0.05, tier: "rare" });
    expect(map.get("posts-500")).toEqual({ share: 0, tier: "legendaire" });

    // Recalcul au plus une fois par jour : un créateur de moins, la carte d'hier reste.
    await prisma.post.deleteMany({ where: { createdById: creators[19].user.id } });
    map = await rarityMap();
    expect(map.get("first-post")?.share).toBe(0.5);
    // Le lendemain : 19 créateurs, plus de rareté affichée.
    map = await rarityMap(new Date(Date.now() + 25 * 3_600_000));
    expect(map.get("first-post")?.tier).toBeNull();
    const page = await buildPage(creators[0].user.id);
    const firstPost = page!.series.flatMap((s) => s.tiers).find((t) => t.key === "first-post");
    expect(firstPost?.rarity).toBeNull();
  });
});
