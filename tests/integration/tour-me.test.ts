import { beforeEach, describe, expect, it, vi } from "vitest";

// Visite guidée (lot U4), sons de l'interface (lot U5) et bootstrap /api/me
// (palier Essai, quotas de l'IA, lots E1-E4), sur une vraie base.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PATCH as patchTour } from "@/app/api/me/tour/route";
import { PATCH as patchSounds } from "@/app/api/settings/ui-sounds/route";
import { buildMe } from "@/lib/me";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const req = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe.skipIf(!hasDatabase)("visite guidée, sons et bootstrap", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("visite : étape gardée (reprise après rechargement), terminée une fois, « Revoir la visite »", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    const me0 = await buildMe({ user: { id: user.id, email: user.email } } as unknown as Session);
    expect(me0?.tour).toEqual({ completed: false, step: 0 });

    expect((await patchTour(req("/api/me/tour", { action: "step", step: 2 }))).status).toBe(200);
    expect((await buildMe({ user: { id: user.id, email: user.email } } as unknown as Session))?.tour).toEqual({ completed: false, step: 2 });

    expect((await patchTour(req("/api/me/tour", { action: "done" }))).status).toBe(200);
    expect((await buildMe({ user: { id: user.id, email: user.email } } as unknown as Session))?.tour.completed).toBe(true);

    expect((await patchTour(req("/api/me/tour", { action: "restart" }))).status).toBe(200);
    expect((await buildMe({ user: { id: user.id, email: user.email } } as unknown as Session))?.tour).toEqual({ completed: false, step: 0 });

    expect((await patchTour(req("/api/me/tour", { action: "step", step: 9 }))).status).toBe(400);
  });

  it("sons de l'interface : activés par défaut, coupés sur le compte", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    expect((await buildMe({ user: { id: user.id, email: user.email } } as unknown as Session))?.uiSounds).toBe(true);
    expect((await patchSounds(req("/api/settings/ui-sounds", { enabled: false }))).status).toBe(200);
    expect((await buildMe({ user: { id: user.id, email: user.email } } as unknown as Session))?.uiSounds).toBe(false);
  });

  it("bootstrap d'un compte en essai : palier TRIAL, jours restants, quotas de l'IA par type, adresse à confirmer", async () => {
    const { user } = await makeBrand();
    await prisma.user.update({ where: { id: user.id }, data: { trialEndsAt: new Date(Date.now() + 5 * 86_400_000), passwordHash: "x", emailVerifiedAt: null } });
    const me = await buildMe({ user: { id: user.id, email: user.email } } as unknown as Session);
    expect(me).toMatchObject({ plan: "TRIAL", onTrial: true, trialDaysLeft: 5, maxBrands: 2 });
    expect(me?.ai.emailConfirmed).toBe(false);
    expect(me?.ai.quota.text).toEqual({ limit: 20, used: 0, remaining: 20 });
    expect(me?.ai.quota.studio.limit).toBe(5);
    expect(me?.trialDenied).toBeNull();
  });
});
