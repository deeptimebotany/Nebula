import { beforeEach, describe, expect, it, vi } from "vitest";

// Réussites v3 (02/10/2026), sur une vraie base : records de qualité gagnés
// avec leur preuve (carte à partager), « Cet avis m'a aidé » (seul l'auteur
// de la demande, 3 au plus, compte pour celui qui l'a écrit), avis reçus de
// 5 créateurs, synchro quotidienne automatique des comptes connectés.
const session = vi.hoisted(() => ({ userId: null as string | null, email: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId, email: session.email } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// Réseaux simulés pour la synchro automatique : aucun appel réel.
const calls = vi.hoisted(() => ({ analytics: 0, metrics: 0 }));
vi.mock("@/lib/social", async (orig) => {
  const real = await orig<typeof import("@/lib/social")>();
  return {
    ...real,
    getSocialClient: () => ({
      fetchAnalytics: async () => {
        calls.analytics++;
        return { followers: 1500, followersDelta: 12, engagementRate: 0, impressions: 0, reach: 0, postsCount: 30 };
      },
      fetchPostMetrics: async () => {
        calls.metrics++;
        return [{ postExternalId: "vid-1", title: "Tuto cold brew", publishedAt: new Date(Date.now() - 20 * 86_400_000), views: 900, likes: 60, comments: 4, avgViewPct: 63.4, durationSeconds: 540 }];
      }
    })
  };
});

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateReussites } from "@/lib/reussites/engine";
import { loadQuality } from "@/lib/reussites/quality";
import { achievementUnlockDb } from "@/lib/prisma-extra";
import { autoSyncDueConnections } from "@/lib/social/auto-sync";
import { GET as detail } from "@/app/api/community/feedback/[id]/route";
import { PATCH as helpful } from "@/app/api/community/feedback/[id]/comments/[commentId]/route";
import { GET as recordCard } from "@/app/api/reussites/record-card/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const as = (user: { id: string; email: string }) => {
  session.userId = user.id;
  session.email = user.email;
};
const mark = (requestId: string, commentId: string, value: boolean) =>
  helpful(new NextRequest(`http://localhost/api/community/feedback/${requestId}/comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ helpful: value }), headers: { "content-type": "application/json" } }), { params: { id: requestId, commentId } });
const LONG = "La miniature B est plus lisible sur mobile, garde-la.";

async function request(authorId: string) {
  return prisma.feedbackRequest.create({ data: { authorId, kind: "TITLE", context: "Quel titre pour ma vidéo ?", closesAt: new Date(Date.now() + 3 * DAY) } });
}

describe.skipIf(!hasDatabase)("Réussites v3 : records de qualité", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    calls.analytics = 0;
    calls.metrics = 0;
  });

  it("record de vues : palier gagné avec sa preuve, notification, carte à partager", async () => {
    const { user, brand } = await makeBrand();
    const c = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: "ig-1", displayName: "Studio", accessToken: "t" } });
    for (let i = 0; i < 10; i++) {
      await prisma.postMetric.create({ data: { connectionId: c.id, network: "INSTAGRAM", postExternalId: `p${i}`, publishedAt: daysAgo(60 - i), views: 100 + (i % 2) * 20 } });
    }
    await prisma.postMetric.create({ data: { connectionId: c.id, network: "INSTAGRAM", postExternalId: "best", title: "Cold brew en 3 étapes", permalink: "https://instagram.com/p/x", publishedAt: daysAgo(10), views: 560 } });
    // Encore trop récente pour compter (moins de 7 jours) :
    await prisma.postMetric.create({ data: { connectionId: c.id, network: "INSTAGRAM", postExternalId: "new", publishedAt: daysAgo(2), views: 9000 } });

    expect((await loadQuality(user.id)).metrics.bestViewsRatio).toBe(5);
    await evaluateReussites(user.id, { force: true });
    await evaluateReussites(user.id, { force: true });
    const unlock = await achievementUnlockDb.findFirst({ where: { userId: user.id, key: "record-views-5" } });
    expect(unlock).not.toBeNull();
    expect(unlock!.detail).toMatchObject({ headline: "5× votre médiane de vues", title: "Cold brew en 3 étapes", network: "INSTAGRAM", permalink: "https://instagram.com/p/x" });
    expect(await achievementUnlockDb.findFirst({ where: { userId: user.id, key: "record-views-10" } })).toBeNull();

    as(user as { id: string; email: string });
    const ok = await recordCard(new NextRequest("http://localhost/api/reussites/record-card?key=record-views-5"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
    // Pas gagné, pas un record de qualité, pas connecté : rien.
    expect((await recordCard(new NextRequest("http://localhost/api/reussites/record-card?key=record-views-10"))).status).toBe(404);
    expect((await recordCard(new NextRequest("http://localhost/api/reussites/record-card?key=posts-10"))).status).toBe(404);
    session.userId = null;
    expect((await recordCard(new NextRequest("http://localhost/api/reussites/record-card?key=record-views-5"))).status).toBe(401);
  });

  it("deuxième évaluation après un nouveau record : notification avec la preuve", async () => {
    const { user, brand } = await makeBrand();
    const c = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: "ig-2", displayName: "Studio", accessToken: "t" } });
    for (let i = 0; i < 6; i++) await prisma.postMetric.create({ data: { connectionId: c.id, network: "INSTAGRAM", postExternalId: `p${i}`, publishedAt: daysAgo(60 - i), views: 100 } });
    await evaluateReussites(user.id, { force: true }); // première évaluation : rien de neuf
    await prisma.postMetric.create({ data: { connectionId: c.id, network: "INSTAGRAM", postExternalId: "best", title: "Mon meilleur Reel", publishedAt: daysAgo(9), views: 260 } });
    await evaluateReussites(user.id, { force: true });
    const n = await prisma.notification.findFirst({ where: { userId: user.id, dedupeKey: "ach:record-views-2" } });
    expect(n).toMatchObject({ title: "Nouveau record de qualité", actionLabel: "Partager la carte" });
    expect(n!.body).toContain("2,6× votre médiane de vues");
    expect(n!.body).toContain("« Mon meilleur Reel »");
  });

  it("« Cet avis m'a aidé » : seul l'auteur, jamais ses propres messages, 3 au plus, compte pour l'auteur de l'avis", async () => {
    const { user: author } = await makeBrand();
    const helpers = [];
    for (let i = 0; i < 4; i++) helpers.push((await makeBrand()).user);
    const req = await request(author.id);
    const comments = [];
    for (const h of helpers) comments.push(await prisma.feedbackComment.create({ data: { requestId: req.id, authorId: h.id, body: LONG } }));
    const own = await prisma.feedbackComment.create({ data: { requestId: req.id, authorId: author.id, body: "Merci à tous pour vos retours !" } });

    as(helpers[0] as { id: string; email: string });
    expect((await mark(req.id, comments[1].id, true)).status).toBe(403);
    as(author as { id: string; email: string });
    expect((await mark(req.id, own.id, true)).status).toBe(400);
    expect((await mark("autre", comments[0].id, true)).status).toBe(404);
    for (let i = 0; i < 3; i++) {
      const res = await mark(req.id, comments[i].id, true);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, helpful: true });
    }
    expect((await mark(req.id, comments[3].id, true)).status).toBe(409);
    // Démarquer libère une place ; remarquer ne renotifie pas.
    expect((await mark(req.id, comments[2].id, false)).status).toBe(200);
    expect((await mark(req.id, comments[3].id, true)).status).toBe(200);
    expect((await mark(req.id, comments[2].id, true)).status).toBe(409);

    const dto = (await (await detail(new NextRequest(`http://localhost/api/community/feedback/${req.id}`), { params: { id: req.id } })).json()) as { request: { comments: { id: string; helpful: boolean }[] } };
    expect(dto.request.comments.filter((c) => c.helpful).map((c) => c.id).sort()).toEqual([comments[0].id, comments[1].id, comments[3].id].sort());

    expect((await loadQuality(helpers[0].id)).metrics.helpfulAdvice).toBe(1);
    expect((await loadQuality(helpers[2].id)).metrics.helpfulAdvice).toBe(0);
    const notes = await prisma.notification.findMany({ where: { userId: helpers[2].id, dedupeKey: { startsWith: "feedback-helpful:" } } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Votre avis a aidé" });
    // Plusieurs avis utiles sur la même demande : comptés une fois.
    const second = await prisma.feedbackComment.create({ data: { requestId: req.id, authorId: helpers[0].id, body: LONG, helpfulAt: new Date() } });
    expect(second.id).toBeTruthy();
    expect((await loadQuality(helpers[0].id)).metrics.helpfulAdvice).toBe(1);
  });

  it("avis de 5 créateurs différents (20 caractères au moins) : palier « Avis de la communauté »", async () => {
    const { user: author } = await makeBrand();
    const req = await request(author.id);
    for (let i = 0; i < 4; i++) await prisma.feedbackComment.create({ data: { requestId: req.id, authorId: (await makeBrand()).user.id, body: LONG } });
    const short = (await makeBrand()).user;
    await prisma.feedbackComment.create({ data: { requestId: req.id, authorId: short.id, body: "Top !" } });
    await prisma.feedbackComment.create({ data: { requestId: req.id, authorId: author.id, body: LONG } });
    await evaluateReussites(author.id, { force: true });
    expect(await achievementUnlockDb.findFirst({ where: { userId: author.id, key: "feedback-received-5" } })).toBeNull();
    await prisma.feedbackComment.create({ data: { requestId: req.id, authorId: short.id, body: LONG } });
    await evaluateReussites(author.id, { force: true });
    const unlock = await achievementUnlockDb.findFirst({ where: { userId: author.id, key: "feedback-received-5" } });
    expect(unlock?.detail).toMatchObject({ headline: "5 créateurs ont donné leur avis", title: "Quel titre pour ma vidéo ?" });
  });
});

describe.skipIf(!hasDatabase)("synchro quotidienne automatique", () => {
  beforeEach(async () => {
    await resetDatabase();
    calls.analytics = 0;
    calls.metrics = 0;
  });

  async function account(opts: { activeDaysAgo?: number | null; network?: string } = {}) {
    const { user, brand } = await makeBrand();
    const active = opts.activeDaysAgo === undefined ? 1 : opts.activeDaysAgo;
    if (active !== null) await prisma.user.update({ where: { id: user.id }, data: { reussitesCheckedAt: daysAgo(active) } });
    const c = await prisma.socialConnection.create({ data: { brandId: brand.id, network: opts.network ?? "YOUTUBE", externalAccountId: `yt-${brand.id}`, displayName: "Chaîne", accessToken: "t" } });
    return { user, brand, c };
  }

  it("relève statistiques et métriques (rétention comprise), une fois par 20 h", async () => {
    const { c } = await account();
    expect(await autoSyncDueConnections()).toEqual({ synced: 1, failed: 0 });
    expect(await prisma.analyticsSnapshot.count({ where: { connectionId: c.id } })).toBe(1);
    const m = await prisma.postMetric.findFirst({ where: { connectionId: c.id } });
    expect(m).toMatchObject({ postExternalId: "vid-1", views: 900, avgViewPct: 63.4, durationSeconds: 540 });
    const after = await prisma.socialConnection.findUnique({ where: { id: c.id } });
    expect(after!.autoSyncedAt).not.toBeNull();
    expect(after!.lastMetricsSyncedAt).not.toBeNull();
    // Deuxième passage du cron : déjà fait.
    expect(await autoSyncDueConnections()).toEqual({ synced: 0, failed: 0 });
    expect(calls).toEqual({ analytics: 1, metrics: 1 });
    // 21 h plus tard : à nouveau.
    expect(await autoSyncDueConnections(new Date(Date.now() + 21 * 3_600_000))).toEqual({ synced: 1, failed: 0 });
  });

  it("jamais pour un compte abandonné, en veille, déconnecté ; pas de doublon d'un relevé fait à la main", async () => {
    await account({ activeDaysAgo: 45 });
    await account({ activeDaysAgo: null });
    const dormant = await account();
    await prisma.socialConnection.update({ where: { id: dormant.c.id }, data: { dormantAt: new Date() } });
    const expired = await account();
    await prisma.socialConnection.update({ where: { id: expired.c.id }, data: { status: "EXPIRED" } });
    expect(await autoSyncDueConnections()).toEqual({ synced: 0, failed: 0 });

    const manual = await account();
    await prisma.socialConnection.update({ where: { id: manual.c.id }, data: { lastSyncedAt: new Date(), lastMetricsSyncedAt: new Date() } });
    expect(await autoSyncDueConnections()).toEqual({ synced: 1, failed: 0 });
    expect(calls).toEqual({ analytics: 0, metrics: 0 });
  });

  it("au plus 3 comptes par passage", async () => {
    for (let i = 0; i < 5; i++) await account();
    expect(await autoSyncDueConnections()).toEqual({ synced: 3, failed: 0 });
    expect(await autoSyncDueConnections()).toEqual({ synced: 2, failed: 0 });
  });
});
