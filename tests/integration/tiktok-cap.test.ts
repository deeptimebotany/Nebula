import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Plafond TikTok des comptes qui publient (06/10/2026), sur une vraie base :
// comptes différents sur 24 h glissantes, pic du jour, alerte au seuil une
// fois par jour (cloche + e-mail) avec le maximum des 30 jours précédents,
// alerte « plafond atteint », purge.
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; html: string }[] }));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  isEmailConfigured: () => true,
  sendEmail: vi.fn(async (m: { to: string; subject: string; html: string }) => {
    mail.sent.push(m);
    return { id: "e1" };
  })
}));

import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL } from "@/lib/owner";
import { noteTiktokCapReached, purgeTiktokPublishers, recordTiktokPublisher, tiktokCapStats } from "@/lib/social/tiktok-cap";
import { hasDatabase, resetDatabase } from "./helpers";

const NOW = new Date("2026-10-06T10:00:00Z");
const H = 3_600_000;

describe.skipIf(!hasDatabase)("plafond TikTok des comptes qui publient", () => {
  beforeEach(async () => {
    await resetDatabase();
    await prisma.tiktokPublisher.deleteMany({});
    await prisma.tiktokPublisherDay.deleteMany({});
    mail.sent = [];
    process.env.TIKTOK_DAILY_PUBLISHER_CAP = "5";
    delete process.env.TIKTOK_PUBLISHER_ALERT_AT;
  });
  afterAll(() => {
    delete process.env.TIKTOK_DAILY_PUBLISHER_CAP;
  });

  it("comptes différents sur 24 h glissantes ; pic du jour qui ne redescend pas", async () => {
    expect(await recordTiktokPublisher("open-a", NOW)).toBe(1);
    expect(await recordTiktokPublisher("open-a", new Date(NOW.getTime() + H))).toBe(1);
    expect(await recordTiktokPublisher("open-b", new Date(NOW.getTime() + 2 * H))).toBe(2);
    // Un compte vu il y a plus de 24 h ne compte plus.
    await prisma.tiktokPublisher.create({ data: { accountId: "open-old", lastAt: new Date(NOW.getTime() - 25 * H) } });
    expect(await recordTiktokPublisher("open-c", new Date(NOW.getTime() + 3 * H))).toBe(3);
    expect((await prisma.tiktokPublisherDay.findUniqueOrThrow({ where: { day: "2026-10-06" } })).peak).toBe(3);
    // Le lendemain, 24 h plus tard : a, b, c sortent de la fenêtre ; le pic d'hier reste.
    expect(await recordTiktokPublisher("open-d", new Date(NOW.getTime() + 28 * H))).toBe(1);
    expect((await prisma.tiktokPublisherDay.findUniqueOrThrow({ where: { day: "2026-10-06" } })).peak).toBe(3);
    expect((await prisma.tiktokPublisherDay.findUniqueOrThrow({ where: { day: "2026-10-07" } })).peak).toBe(1);
    // Aucune alerte sans compte propriétaire, et jamais d'erreur.
    expect(await recordTiktokPublisher("", NOW)).toBeNull();
  });

  it("alerte au seuil (4 sur 5) une seule fois par jour, cloche et e-mail, avec le maximum des 30 jours précédents", async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
    await prisma.tiktokPublisherDay.createMany({
      data: [
        { day: "2026-10-03", peak: 3 },
        { day: "2026-09-01", peak: 5 }, // plus de 30 jours : ignoré
        { day: "2026-10-06", peak: 0 }
      ]
    });
    for (const [i, id] of ["a", "b", "c"].entries()) await recordTiktokPublisher(`open-${id}`, new Date(NOW.getTime() + i * 60_000));
    expect(await prisma.notification.count({ where: { userId: owner.id } })).toBe(0);
    expect(await recordTiktokPublisher("open-d", new Date(NOW.getTime() + 5 * 60_000))).toBe(4);
    const notes = await prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "TikTok : 4 comptes ont publié sur 24 h (plafond : 5)", href: "/admin/reseaux", dedupeKey: "tiktok-cap:seuil:2026-10-06" });
    expect(notes[0].body).toContain("Maximum des 30 derniers jours : 3 comptes, le 3 octobre.");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: OWNER_EMAIL, subject: "TikTok : 4 comptes ont publié sur 24 h (plafond : 5)" });
    expect(mail.sent[0].html).toContain("Ouvrir la page Réseaux");
    expect(mail.sent[0].html).not.toContain("veille des API");
    // 5e compte le même jour : pas de deuxième alerte du seuil.
    await recordTiktokPublisher("open-e", new Date(NOW.getTime() + 6 * 60_000));
    expect(await prisma.notification.count({ where: { userId: owner.id } })).toBe(1);
    expect(mail.sent).toHaveLength(1);
    expect(await tiktokCapStats(new Date(NOW.getTime() + 7 * 60_000))).toEqual({ last24h: 5, cap: 5, alertAt: 4, max30: { peak: 3, day: "2026-10-03" } });
  });

  it("TikTok renvoie le plafond : alerte « plafond atteint » une fois par jour", async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
    await noteTiktokCapReached(NOW);
    await noteTiktokCapReached(new Date(NOW.getTime() + H));
    const notes = await prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "TikTok a refusé une publication : plafond de 5 comptes atteint", dedupeKey: "tiktok-cap:atteint:2026-10-06" });
    await noteTiktokCapReached(new Date(NOW.getTime() + 24 * H));
    expect(await prisma.notification.count({ where: { userId: owner.id } })).toBe(2);
  });

  it("purge : comptes sans publication depuis 60 jours, pics de plus de 400 jours", async () => {
    await prisma.tiktokPublisher.createMany({ data: [{ accountId: "vieux", lastAt: new Date(NOW.getTime() - 61 * 24 * H) }, { accountId: "recent", lastAt: NOW }] });
    await prisma.tiktokPublisherDay.createMany({ data: [{ day: "2025-08-01", peak: 2 }, { day: "2026-10-01", peak: 2 }] });
    expect(await purgeTiktokPublishers(NOW)).toBe(2);
    expect((await prisma.tiktokPublisher.findMany()).map((p) => p.accountId)).toEqual(["recent"]);
    expect((await prisma.tiktokPublisherDay.findMany()).map((p) => p.day)).toEqual(["2026-10-01"]);
  });
});
