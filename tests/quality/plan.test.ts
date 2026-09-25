import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  membership: { findFirst: vi.fn(), count: vi.fn() },
  socialConnection: { findMany: vi.fn() },
  post: { count: vi.fn() }
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { assertConnectionQuota, assertPostQuota, connectionSlotsFor, countConnectionSlots, getUserPlan } from "@/lib/billing/plan";

const NOW = new Date("2026-09-24T10:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const user = { aiTrialUntil: null, trialEndsAt: null, compPlan: null, compMaxBrands: null, compUntil: null };

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.resetAllMocks();
  db.user.findUnique.mockResolvedValue(user);
  db.subscription.findUnique.mockResolvedValue(null);
  db.membership.findFirst.mockResolvedValue({ userId: "u1" });
});

describe("comptes connectés : décompte du quota", () => {
  it("Instagram + Facebook d'une même connexion Meta comptent pour un", () => {
    expect(connectionSlotsFor(["INSTAGRAM", "FACEBOOK"])).toBe(1);
    expect(connectionSlotsFor(["INSTAGRAM", "FACEBOOK", "FACEBOOK"])).toBe(2);
  });
  it("tous les autres réseaux comptent (Bluesky, Threads, Pinterest, LinkedIn oubliés avant le lot 3)", () => {
    expect(connectionSlotsFor(["BLUESKY", "THREADS", "PINTEREST", "LINKEDIN"])).toBe(4);
    expect(connectionSlotsFor(["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "BLUESKY"])).toBe(4);
    expect(connectionSlotsFor([])).toBe(0);
  });
  it("ne compte pas les comptes déconnectés", async () => {
    db.socialConnection.findMany.mockResolvedValue([{ network: "BLUESKY" }, { network: "LINKEDIN" }]);
    expect(await countConnectionSlots("b1")).toBe(2);
    expect(db.socialConnection.findMany.mock.calls[0][0].where.status).toEqual({ not: "DISCONNECTED" });
  });
  it("le palier Gratuit bloque au-delà de 4 comptes", async () => {
    db.socialConnection.findMany.mockResolvedValue([{ network: "TIKTOK" }, { network: "YOUTUBE" }, { network: "BLUESKY" }, { network: "THREADS" }]);
    await expect(assertConnectionQuota("b1")).rejects.toThrow();
    db.socialConnection.findMany.mockResolvedValue([{ network: "TIKTOK" }, { network: "INSTAGRAM" }, { network: "FACEBOOK" }]);
    await expect(assertConnectionQuota("b1")).resolves.toBeUndefined();
  });
});

describe("palier : payant > offert > essai > gratuit", () => {
  it("un abonnement payant actif l'emporte", async () => {
    db.subscription.findUnique.mockResolvedValue({ plan: "AGENCY", status: "ACTIVE", interval: "year", maxBrands: 10, pausedUntil: null });
    expect(await getUserPlan("u1")).toMatchObject({ plan: "AGENCY", paid: true, interval: "year", maxBrands: 10 });
  });
  it("un abonnement en pause retombe sur l'essai Pro en cours", async () => {
    db.subscription.findUnique.mockResolvedValue({ plan: "PRO", status: "ACTIVE", pausedUntil: inDays(10) });
    db.user.findUnique.mockResolvedValue({ ...user, trialEndsAt: inDays(3) });
    expect(await getUserPlan("u1")).toMatchObject({ plan: "PRO", paid: false, onTrial: true });
  });
  it("accès offert expiré et essai expiré : Gratuit", async () => {
    db.user.findUnique.mockResolvedValue({ ...user, compPlan: "PRO", compUntil: inDays(-1), trialEndsAt: inDays(-1) });
    expect((await getUserPlan("u1")).plan).toBe("FREE");
  });
  it("accès offert en cours : palier offert", async () => {
    db.user.findUnique.mockResolvedValue({ ...user, compPlan: "AGENCY", compUntil: inDays(30) });
    expect(await getUserPlan("u1")).toMatchObject({ plan: "AGENCY", paid: false, comp: { until: inDays(30) } });
  });
});

describe("publications par mois", () => {
  it("le palier Gratuit bloque à 20 publications", async () => {
    db.post.count.mockResolvedValue(20);
    await expect(assertPostQuota("b1")).rejects.toThrow(/Limite de publications/);
    db.post.count.mockResolvedValue(19);
    await expect(assertPostQuota("b1")).resolves.toBeUndefined();
  });
});
