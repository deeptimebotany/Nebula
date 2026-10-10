import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Comptes déconnectés (10/10/2026, retour de Lucas : après avoir tout
// déconnecté, Interactions montrait encore 2 comptes dans Commentaires et 4
// dans Engagement, avec leurs chiffres). Sur une vraie base : la déconnexion
// efface les données de tous les réseaux, le cron nettoie les comptes déjà
// déconnectés, et Interactions ne les montre plus.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { disconnectConnection } from "@/lib/social/revoke";
import { ANONYMIZED_CHANNEL_NAME, purgeDisconnectedData } from "@/lib/social/disconnected-data";
import { GET as ENGAGEMENTS } from "@/app/api/engagements/route";
import { GET as COMMENTS } from "@/app/api/engagement/route";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

async function account(brandId: string, network: string, displayName: string, status = "CONNECTED") {
  const connection = await prisma.socialConnection.create({
    data: {
      brandId,
      network,
      status,
      externalAccountId: `${network}-${Math.random()}`,
      displayName,
      handle: `@${displayName.toLowerCase().replace(/\s+/g, "")}`,
      avatarUrl: "https://cdn.test/photo.jpg",
      accessToken: status === "DISCONNECTED" ? "" : `tok-${network}`
    }
  });
  await prisma.analyticsSnapshot.create({ data: { connectionId: connection.id, network, followers: 500 } });
  await prisma.postMetric.create({ data: { connectionId: connection.id, network, postExternalId: `p-${Math.random()}`, title: "Vidéo", views: 1700, likes: 28, comments: 5 } });
  await prisma.engagementItem.create({ data: { connectionId: connection.id, network, externalId: `c-${Math.random()}`, text: "Super", publishedAt: new Date() } });
  return connection;
}

const counts = async (connectionId: string) => ({
  analytics: await prisma.analyticsSnapshot.count({ where: { connectionId } }),
  metrics: await prisma.postMetric.count({ where: { connectionId } }),
  comments: await prisma.engagementItem.count({ where: { connectionId } })
});

describe.skipIf(!hasDatabase)("comptes déconnectés : données effacées, plus affichés", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(() => {
    session.userId = null;
    vi.unstubAllGlobals();
  });

  it("déconnexion d'un compte Instagram : chiffres et commentaires effacés, publications gardées", async () => {
    const { user, brand } = await makeBrand();
    const ig = await account(brand.id, "INSTAGRAM", "cafe.nebula");
    const post = await prisma.post.create({ data: { brandId: brand.id, createdById: user.id, title: "Menu", caption: "", status: "PUBLISHED" } });
    await prisma.postTarget.create({ data: { postId: post.id, connectionId: ig.id, network: "INSTAGRAM", status: "PUBLISHED", externalPostId: "ig-1", metadata: {} } });
    installNetwork([]);
    await disconnectConnection(ig.id);
    expect(await counts(ig.id)).toEqual({ analytics: 0, metrics: 0, comments: 0 });
    expect(await prisma.socialConnection.findUniqueOrThrow({ where: { id: ig.id } })).toMatchObject({ status: "DISCONNECTED", accessToken: "", displayName: "cafe.nebula" });
    // L'historique des publications faites avec Nebula reste.
    expect(await prisma.postTarget.count({ where: { connectionId: ig.id } })).toBe(1);
  });

  it("cron : les comptes déjà déconnectés perdent leurs données, les chaînes YouTube leur nom ; les comptes connectés ne bougent pas", async () => {
    const { brand } = await makeBrand();
    const royal = await account(brand.id, "YOUTUBE", "Royal", "DISCONNECTED");
    const pin = await account(brand.id, "PINTEREST", "Nebula", "DISCONNECTED");
    const live = await account(brand.id, "TIKTOK", "deeptimebotany");
    expect(await purgeDisconnectedData()).toEqual({ connections: 2 });
    expect(await counts(royal.id)).toEqual({ analytics: 0, metrics: 0, comments: 0 });
    expect(await counts(pin.id)).toEqual({ analytics: 0, metrics: 0, comments: 0 });
    expect(await counts(live.id)).toEqual({ analytics: 1, metrics: 1, comments: 1 });
    expect(await prisma.socialConnection.findUniqueOrThrow({ where: { id: royal.id } })).toMatchObject({ displayName: ANONYMIZED_CHANNEL_NAME, handle: null, avatarUrl: null });
    expect((await prisma.socialConnection.findUniqueOrThrow({ where: { id: pin.id } })).displayName).toBe("Nebula");
    // Rien à refaire au passage suivant.
    expect(await purgeDisconnectedData()).toEqual({ connections: 0 });
  });

  it("Interactions (Commentaires et Engagement) ne montre plus les comptes déconnectés", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    const royal = await account(brand.id, "YOUTUBE", "Royal", "DISCONNECTED");
    const dtb = await account(brand.id, "YOUTUBE", "Deep Time Botany");
    await account(brand.id, "PINTEREST", "Nebula", "DISCONNECTED");
    await account(brand.id, "TIKTOK", "deeptimebotany", "DISCONNECTED");

    const eng = await (await ENGAGEMENTS(new NextRequest(`http://localhost/api/engagements?brandId=${brand.id}`))).json();
    expect(eng.connections.map((c: { id: string }) => c.id)).toEqual([dtb.id]);
    expect(eng.totals.views.value).toBe(1700);
    expect(eng.posts).toHaveLength(1);

    const com = await (await COMMENTS(new NextRequest(`http://localhost/api/engagement?brandId=${brand.id}`))).json();
    expect(com.connections.map((c: { id: string }) => c.id)).toEqual([dtb.id]);
    expect(com.items).toHaveLength(1);
    // Ouvert pour un seul compte déconnecté : introuvable.
    expect((await COMMENTS(new NextRequest(`http://localhost/api/engagement?connectionId=${royal.id}`))).status).toBe(404);
  });
});
