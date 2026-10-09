import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Limite de comptes connectés (09/10/2026, demande de Lucas), sur une vraie
// base : essai terminé avec 6 comptes → la marque ne publie plus et la
// fenêtre propose les comptes à déconnecter ; une fois revenue dans la
// limite, tout repart (et les comptes mis en veille se réveillent) ; un
// nouveau compte n'est accepté que s'il tient dans le palier, une
// reconnexion passe toujours.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/billing/connection-limit/route";
import { assertConnectionAllowed, brandConnectionOverage, connectionLimitState } from "@/lib/billing/connection-limit";
import { assertBrandWritable } from "@/lib/billing/trial-expiry";
import { createPost } from "@/lib/posts/create-post";
import { PLAN_LIMITS } from "@/lib/plans";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, resetDatabase } from "./helpers";

const DAY = 86_400_000;
let seq = 0;

async function owner(trialDays: number) {
  seq++;
  const user = await prisma.user.create({
    data: { email: `limite${seq}-${Date.now()}@test.fr`, name: "Limite", passwordHash: "x", emailVerifiedAt: new Date(), ageConfirmedAt: new Date(), trialEndsAt: new Date(Date.now() + trialDays * DAY) }
  });
  const brand = await prisma.brand.create({ data: { name: "Café Nebula", slug: `limite-${seq}-${Date.now()}` } });
  await prisma.membership.create({ data: { userId: user.id, brandId: brand.id, role: "OWNER" } });
  return { user, brand };
}

const connect = (brandId: string, network: string, extra: Record<string, unknown> = {}) =>
  prisma.socialConnection.create({ data: { brandId, network, externalAccountId: `${network}-${Math.random()}`, displayName: network, accessToken: "tok", ...extra } });

/** 6 comptes : Instagram + 5 autres réseaux (6 places). */
async function sixAccounts(brandId: string) {
  const out = [];
  for (const n of ["INSTAGRAM", "TIKTOK", "YOUTUBE", "BLUESKY", "PINTEREST", "THREADS"]) out.push(await connect(brandId, n));
  return out;
}

const get = (brandId: string) => GET(new NextRequest(`http://localhost/api/billing/connection-limit?brandId=${brandId}`));
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/billing/connection-limit", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe.skipIf(!hasDatabase)("limite de comptes connectés du palier", () => {
  beforeEach(async () => {
    await resetDatabase();
    // Révocation chez les réseaux à la déconnexion : réponses fixes.
    installNetwork([
      { method: "POST", url: /.*/, body: {} },
      { method: "GET", url: /.*/, body: {} },
      { method: "DELETE", url: /.*/, body: {} }
    ]);
  });
  afterEach(() => {
    session.userId = null;
    vi.unstubAllGlobals();
  });

  it("pendant l'essai : 6 comptes, rien à faire", async () => {
    const { brand } = await owner(5);
    await sixAccounts(brand.id);
    expect(await brandConnectionOverage(brand.id)).toMatchObject({ slots: 6, max: PLAN_LIMITS.TRIAL.maxConnections, over: false });
    expect(await assertBrandWritable(brand.id)).toEqual({ ok: true });
  });

  it("essai terminé avec 6 comptes : marque bloquée tout de suite (sans attendre le cron), 4 comptes proposés", async () => {
    const { user, brand } = await owner(-1);
    const accounts = await sixAccounts(brand.id);
    expect(await brandConnectionOverage(brand.id)).toMatchObject({ slots: 6, max: PLAN_LIMITS.FREE.maxConnections, over: true });
    expect(await assertBrandWritable(brand.id)).toMatchObject({ ok: false, reason: "connection_limit" });
    const created = await createPost(user.id, { brandId: brand.id, title: "", caption: "Bonjour", mediaAssetIds: [], targets: [{ connectionId: accounts[1].id, network: "TIKTOK" }], publishNow: false });
    expect(created).toMatchObject({ ok: false, status: 402, reason: "connection_limit" });

    session.userId = user.id;
    const state = await (await get(brand.id)).json();
    expect(state).toMatchObject({ slots: 6, max: 4, over: true, planLabel: PLAN_LIMITS.FREE.label });
    expect(state.connections).toHaveLength(6);
    expect(state.suggestedKeep).toHaveLength(4);
  });

  it("déconnecter les comptes en trop : la marque repart, les comptes en veille se réveillent", async () => {
    const { user, brand } = await owner(-1);
    const accounts = await sixAccounts(brand.id);
    // Le cron était déjà passé : 2 comptes en veille.
    await prisma.socialConnection.updateMany({ where: { id: { in: [accounts[4].id, accounts[5].id] } }, data: { dormantAt: new Date() } });
    session.userId = user.id;
    // On garde les 2 comptes en veille et on déconnecte 2 comptes actifs.
    const res = await post({ brandId: brand.id, connectionIds: [accounts[0].id, accounts[1].id] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ disconnected: 2, state: { slots: 4, over: false } });
    const after = await prisma.socialConnection.findMany({ where: { brandId: brand.id }, orderBy: { network: "asc" } });
    expect(after.filter((c) => c.status === "DISCONNECTED").map((c) => c.id).sort()).toEqual([accounts[0].id, accounts[1].id].sort());
    expect(after.filter((c) => c.status !== "DISCONNECTED").every((c) => c.dormantAt === null)).toBe(true);
    expect(await assertBrandWritable(brand.id)).toEqual({ ok: true });
  });

  it("déconnexion refusée pour les comptes d'une autre marque ou d'une autre personne", async () => {
    const a = await owner(-1);
    const b = await owner(-1);
    const theirs = await connect(b.brand.id, "TIKTOK");
    session.userId = a.user.id;
    expect((await post({ brandId: a.brand.id, connectionIds: [theirs.id] })).status).toBe(400);
    expect((await post({ brandId: b.brand.id, connectionIds: [theirs.id] })).status).toBe(404);
    expect((await prisma.socialConnection.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("CONNECTED");
  });

  it("nouveau compte : seulement s'il tient dans le palier ; reconnexion toujours possible", async () => {
    const { brand } = await owner(-1);
    const ig = await connect(brand.id, "INSTAGRAM");
    const tiktok = await connect(brand.id, "TIKTOK", { status: "ERROR" });
    await connect(brand.id, "YOUTUBE");
    await connect(brand.id, "BLUESKY");
    const gone = await connect(brand.id, "PINTEREST", { status: "DISCONNECTED", accessToken: "" });
    // 4 / 4 en Gratuit.
    await expect(assertConnectionAllowed(brand.id, "THREADS", "nouveau")).rejects.toThrow(/Limite de comptes connectés atteinte pour le palier/);
    // Compte déjà relié (même expiré) : reconnexion acceptée.
    await expect(assertConnectionAllowed(brand.id, "TIKTOK", tiktok.externalAccountId)).resolves.toBeUndefined();
    // Compte déconnecté : il reprendrait une place → refusé.
    await expect(assertConnectionAllowed(brand.id, "PINTEREST", gone.externalAccountId)).rejects.toThrow();
    // Page Facebook : un compte de plus (Instagram et Facebook comptent chacun pour un depuis le 09/10/2026), refusée.
    await expect(assertConnectionAllowed(brand.id, "FACEBOOK", "page-1")).rejects.toThrow(/Limite de comptes connectés atteinte/);
    expect(ig.id).toBeTruthy();
  });

  it("état sans dépassement : tous les comptes gardés", async () => {
    const { brand } = await owner(-1);
    const a = await connect(brand.id, "TIKTOK");
    const state = await connectionLimitState(brand.id);
    expect(state).toMatchObject({ over: false, slots: 1, suggestedKeep: [a.id] });
  });
});
