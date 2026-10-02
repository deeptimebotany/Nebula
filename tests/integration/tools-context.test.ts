import { beforeEach, describe, expect, it, vi } from "vitest";

// Outils dans l'application (02/10/2026), sur une vraie base : le
// préremplissage reprend ce que Nebula a relevé pour la marque (abonnés,
// interactions des 30 derniers jours, titres YouTube, @pseudos, Page bio,
// accroche du media kit), et seuls les membres de la marque y ont accès.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/tools/context/route";
import type { ToolContextDTO } from "@/lib/tools/app-context";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const call = (brandId?: string) => GET(new NextRequest(`http://localhost/api/tools/context${brandId ? `?brandId=${brandId}` : ""}`));

async function connection(brandId: string, network: string, handle: string | null) {
  return prisma.socialConnection.create({ data: { brandId, network, externalAccountId: `${network}-${handle}-${Math.random()}`, displayName: `Compte ${network}`, handle, accessToken: "x" } });
}

describe.skipIf(!hasDatabase)("outils dans l'application : préremplissage", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("refuse sans session, sans marque, et hors de la marque", async () => {
    const { brand } = await makeBrand();
    const stranger = (await makeBrand()).user;
    expect((await call(brand.id)).status).toBe(401);
    session.userId = stranger.id;
    expect((await call()).status).toBe(400);
    expect([403, 404]).toContain((await call(brand.id)).status);
  });

  it("chiffres relevés, titres YouTube, pseudos, Page bio et accroche du media kit", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    await prisma.brand.update({ where: { id: brand.id }, data: { timezone: "America/Montreal" } });
    await prisma.mediaKit.create({ data: { brandId: brand.id, headline: "Recettes de café maison et tests de matériel" } });
    await prisma.linkPage.create({ data: { brandId: brand.id, published: true, bio: "ancienne bio" } });
    const ig = await connection(brand.id, "INSTAGRAM", "@studio.nova");
    const yt = await connection(brand.id, "YOUTUBE", "StudioNovaCafe");
    await connection(brand.id, "FACEBOOK", "studionovacafe");
    const empty = await connection(brand.id, "TIKTOK", "studionova");
    await connection(brand.id, "BLUESKY", "studionova.bsky.social");

    const now = Date.now();
    // Relevés d'abonnés : le dernier non nul compte.
    await prisma.analyticsSnapshot.createMany({
      data: [
        { connectionId: ig.id, network: "INSTAGRAM", followers: 12000, capturedAt: new Date(now - 2 * DAY) },
        { connectionId: ig.id, network: "INSTAGRAM", followers: 12300, capturedAt: new Date(now - DAY) },
        { connectionId: ig.id, network: "INSTAGRAM", followers: 0, capturedAt: new Date(now - 1000) },
        { connectionId: yt.id, network: "YOUTUBE", followers: 24800, capturedAt: new Date(now - DAY) }
      ]
    });
    // Instagram : 2 publications sur 30 jours (la 3e est trop ancienne).
    await prisma.postMetric.createMany({
      data: [
        { connectionId: ig.id, network: "INSTAGRAM", postExternalId: "a", publishedAt: new Date(now - 3 * DAY), likes: 400, comments: 30, shares: 20 },
        { connectionId: ig.id, network: "INSTAGRAM", postExternalId: "b", publishedAt: new Date(now - 10 * DAY), likes: 20, comments: null, shares: 5 },
        { connectionId: ig.id, network: "INSTAGRAM", postExternalId: "c", publishedAt: new Date(now - 60 * DAY), likes: 9999, comments: 9999, shares: 9999 },
        // YouTube : rien sur 30 jours → les dernières publications, et leurs titres.
        { connectionId: yt.id, network: "YOUTUBE", postExternalId: "v1", publishedAt: new Date(now - 40 * DAY), likes: 300, comments: 12, shares: null, title: "5 erreurs qui ruinent votre café" },
        { connectionId: yt.id, network: "YOUTUBE", postExternalId: "v2", publishedAt: new Date(now - 45 * DAY), likes: 100, comments: 8, shares: null, title: "Le cold brew en 3 étapes" }
      ]
    });

    const res = await call(brand.id);
    expect(res.status).toBe(200);
    const d = (await res.json()) as ToolContextDTO;
    expect(d.brand.timezone).toBe("America/Montreal");
    expect(d.about).toBe("Recettes de café maison et tests de matériel");
    // Bluesky n'a pas de repères : absent des comptes des outils.
    expect(d.accounts.map((a) => a.network)).toEqual(["INSTAGRAM", "YOUTUBE", "FACEBOOK", "TIKTOK"]);
    const igAcc = d.accounts.find((a) => a.network === "INSTAGRAM")!;
    expect(igAcc.followers).toBe(12300);
    expect(igAcc.engagement).toEqual({ posts: 2, likes: 420, comments: 30, shares: 25, basis: "window" });
    const ytAcc = d.accounts.find((a) => a.network === "YOUTUBE")!;
    expect(ytAcc.engagement).toEqual({ posts: 2, likes: 400, comments: 20, shares: 0, basis: "recent" });
    expect(d.accounts.find((a) => a.connectionId === empty.id)).toMatchObject({ followers: null, engagement: null });
    expect(d.youtubeTitles).toEqual(["5 erreurs qui ruinent votre café", "Le cold brew en 3 étapes"]);
    expect(d.audit).toMatchObject({ instagram: "@studio.nova", youtube: "@StudioNovaCafe", tiktok: "@studionova" });
    expect(d.audit.website).toMatch(new RegExp(`/l/${brand.slug}$`));
    expect(d.bestTimes.map((b) => b.network).sort()).toEqual(["BLUESKY", "FACEBOOK", "INSTAGRAM", "TIKTOK", "YOUTUBE"]);
    expect(d.minSnapshots).toBe(5);
  });

  it("Page bio non publiée : pas de lien ; sans media kit : la bio de la Page bio", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    await prisma.linkPage.create({ data: { brandId: brand.id, published: false, bio: "Coach sportif à Lyon" } });
    const d = (await (await call(brand.id)).json()) as ToolContextDTO;
    expect(d.audit.website).toBeUndefined();
    expect(d.about).toBe("Coach sportif à Lyon");
    expect(d.accounts).toEqual([]);
  });
});
