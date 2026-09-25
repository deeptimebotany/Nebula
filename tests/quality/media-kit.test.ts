// Media kit public (produit n°10) : chiffres calculés sans saisie (abonnés,
// évolution, vues médianes, engagement, rythme), comptes masqués,
// publications mises en avant (choix du créateur ou automatiques), liens de
// profil sûrs, réglages relus depuis la base, palier.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computeKitStats, displayHandle, profileUrl, type KitConnectionRow, type KitMetricRow, type KitSnapshotRow } from "@/lib/media-kit/stats";
import { cleanOffers, postChoicesFrom, settingsFromRow, type MediaKitRow } from "@/lib/media-kit/load";
import { PLAN_LIMITS } from "@/lib/plans";
import { isAppPath, usesStrictCsp, needsStrictDocument } from "@/lib/csp";

const NOW = new Date("2026-09-25T12:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

const conn = (over: Partial<KitConnectionRow>): KitConnectionRow => ({
  id: "yt",
  network: "YOUTUBE",
  displayName: "Café Nebula",
  handle: null,
  avatarUrl: null,
  externalAccountId: "UCabcdefghijklmnopqrstuv",
  status: "CONNECTED",
  ...over
});
const snap = (connectionId: string, d: number, followers: number): KitSnapshotRow => ({ connectionId, capturedAt: ago(d), followers });
let n = 0;
const metric = (connectionId: string, network: KitMetricRow["network"], d: number, over: Partial<KitMetricRow> = {}): KitMetricRow => ({
  id: `m${++n}`,
  connectionId,
  network,
  title: `Publication ${n}`,
  permalink: `https://example.com/p/${n}`,
  thumbnailUrl: null,
  publishedAt: ago(d),
  capturedAt: ago(1),
  views: null,
  likes: 10,
  comments: 2,
  shares: 0,
  ...over
});

const connections = [
  conn({}),
  conn({ id: "ig", network: "INSTAGRAM", displayName: "cafe.nebula", handle: "@cafe.nebula", externalAccountId: "17841400000" }),
  conn({ id: "old", network: "TIKTOK", displayName: "ancien", status: "DISCONNECTED" })
];
const snapshots = [snap("yt", 40, 9_000), snap("yt", 31, 9_500), snap("yt", 10, 9_900), snap("yt", 1, 10_000), snap("yt", 0.5, 0), snap("ig", 20, 4_000), snap("ig", 2, 4_400), snap("old", 1, 99_999)];
const metrics = [
  metric("yt", "YOUTUBE", 5, { views: 3_000, likes: 150, comments: 30, shares: 20 }),
  metric("yt", "YOUTUBE", 12, { views: 1_000, likes: 50, comments: 10, shares: 0 }),
  metric("yt", "YOUTUBE", 20, { views: 2_000, likes: 80, comments: 10, shares: 10 }),
  metric("yt", "YOUTUBE", 1, { views: 90_000, likes: 5_000 }), // trop récente pour les taux
  metric("yt", "YOUTUBE", 150, { views: 50_000, likes: 900 }), // hors 90 jours, mais dans les 180 jours des mises en avant
  metric("ig", "INSTAGRAM", 3, { likes: 300, comments: 40, shares: 20 }),
  metric("ig", "INSTAGRAM", 9, { likes: 100, comments: 10, shares: 0 }),
  metric("ig", "INSTAGRAM", 16, { likes: 150, comments: 20, shares: 10 }),
  metric("old", "TIKTOK", 4, { views: 1_000_000 })
];

describe("chiffres du media kit (sans saisie)", () => {
  const stats = computeKitStats({ connections, snapshots, metrics, hiddenConnectionIds: [], featuredPostIds: [], now: NOW });

  it("comptes : déconnectés jamais affichés, abonnés = dernier relevé non nul, tri par audience", () => {
    expect(stats.accounts.map((a) => a.id)).toEqual(["yt", "ig"]);
    expect(stats.accounts[0]).toMatchObject({ followers: 10_000, handle: null, profileUrl: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv" });
    expect(stats.accounts[1]).toMatchObject({ followers: 4_400, handle: "@cafe.nebula", profileUrl: "https://www.instagram.com/cafe.nebula/" });
  });

  it("évolution : relevé d'il y a 30 jours, sinon premier relevé s'il a 14 jours", () => {
    expect(stats.accounts[0].growth).toEqual({ delta: 500, pct: 5.3, days: 30 });
    expect(stats.accounts[1].growth).toEqual({ delta: 400, pct: 10, days: 18 });
  });

  it("vues médianes et engagement sur 90 jours, 3 publications au moins, publications de moins de 2 jours écartées", () => {
    expect(stats.accounts[0].medianViews).toBe(2_000);
    // YouTube : interactions moyennes (200 + 60 + 100) / 3 = 120 ; 120 / 10 000 = 1,2 %
    expect(stats.accounts[0].engagementRate).toBe(1.2);
    // Instagram : (360 + 110 + 180) / 3 = 216,67 ; / 4 400 = 4,92 %
    expect(stats.accounts[1].engagementRate).toBe(4.92);
    expect(stats.accounts[1].medianViews).toBeNull();
    expect(stats.accounts[0].postsPerMonth).toBe(1.3); // 4 publications en 90 jours
    expect(stats.accounts[0].measuredPosts).toBe(3);
  });

  it("totaux : audience, vues sur 90 jours, engagement pondéré par les abonnés", () => {
    expect(stats.totals).toEqual({ audience: 14_400, views90: 96_000, engagementRate: 2.34, postsPerMonth: 2.3, accounts: 2 });
  });

  it("publications automatiques : les meilleures de chaque compte à tour de rôle, 6 au plus", () => {
    expect(stats.postsChosen).toBe(false);
    expect(stats.posts.map((p) => [p.network, p.views ?? p.interactions])).toEqual([
      ["YOUTUBE", 50_000],
      ["INSTAGRAM", 360],
      ["YOUTUBE", 3_000],
      ["INSTAGRAM", 180],
      ["YOUTUBE", 2_000],
      ["INSTAGRAM", 110]
    ]);
    expect(stats.updatedAt).toBe(ago(1).toISOString());
  });

  it("comptes masqués et mises en avant choisies (ordre gardé, compte masqué exclu)", () => {
    const ytPost = metrics[1].id;
    const igPost = metrics[5].id;
    const s = computeKitStats({ connections, snapshots, metrics, hiddenConnectionIds: ["ig"], featuredPostIds: [ytPost, igPost, "inconnu"], now: NOW });
    expect(s.accounts.map((a) => a.id)).toEqual(["yt"]);
    expect(s.totals.audience).toBe(10_000);
    expect(s.postsChosen).toBe(true);
    expect(s.posts.map((p) => p.id)).toEqual([ytPost]);
  });

  it("rien de relevé : tout à null, jamais de zéro inventé", () => {
    const s = computeKitStats({ connections: [conn({})], snapshots: [], metrics: [], hiddenConnectionIds: [], featuredPostIds: [], now: NOW });
    expect(s.accounts[0]).toMatchObject({ followers: null, growth: null, medianViews: null, engagementRate: null, postsPerMonth: null });
    expect(s.totals).toEqual({ audience: null, views90: null, engagementRate: null, postsPerMonth: null, accounts: 1 });
    expect(s.posts).toEqual([]);
  });
});

describe("liens et réglages", () => {
  it("liens de profil construits seulement quand l'identifiant a la bonne forme", () => {
    expect(profileUrl("TIKTOK", "open-id", "@studio.nova")).toBe("https://www.tiktok.com/@studio.nova");
    expect(profileUrl("TIKTOK", "open-id", "Studio Nova")).toBeNull();
    expect(profileUrl("YOUTUBE", "YOUTUBE-1", null)).toBeNull();
    expect(profileUrl("FACEBOOK", "1234567890", null)).toBe("https://www.facebook.com/1234567890");
    expect(profileUrl("INSTAGRAM", "x", "javascript:alert(1)")).toBeNull();
    expect(displayHandle("YOUTUBE", "@chaine")).toBeNull();
    expect(displayHandle("BLUESKY", "moi.bsky.social")).toBe("@moi.bsky.social");
  });

  it("réglages relus depuis la base : listes nettoyées, offres bornées", () => {
    const row = {
      published: true,
      headline: "Accroche",
      about: "À propos",
      contactEmail: "contact@exemple.fr",
      hiddenConnectionIds: ["a", 3, "b"],
      featuredPostIds: "pas une liste",
      offers: [{ label: "  Reel   sponsorisé ", price: " 250 € " }, { label: "", price: "10 €" }, ...Array.from({ length: 8 }, (_, i) => ({ label: `Offre ${i}`, price: "" }))]
    } as unknown as MediaKitRow;
    const s = settingsFromRow(row);
    expect(s.hiddenConnectionIds).toEqual([]);
    expect(s.featuredPostIds).toEqual([]);
    expect(s.offers[0]).toEqual({ label: "Reel sponsorisé", price: "250 €" });
    expect(s.offers).toHaveLength(6);
    expect(settingsFromRow(null)).toMatchObject({ published: false, headline: "", offers: [] });
    expect(cleanOffers([{ label: "x".repeat(200), price: "y".repeat(100) }])[0]).toEqual({ label: "x".repeat(70), price: "y".repeat(30) });
  });

  it("publications proposées dans l'éditeur : 15 meilleures par compte, jamais d'un compte déconnecté", () => {
    const choices = postChoicesFrom({ connections, snapshots, metrics });
    expect(choices.some((c) => c.connectionId === "old")).toBe(false);
    expect(choices.filter((c) => c.connectionId === "yt").map((c) => c.views)).toEqual([90_000, 50_000, 3_000, 2_000, 1_000]);
  });

  it("palier : publication réservée à Pro et Agence ; pages classées pour la CSP", () => {
    expect([PLAN_LIMITS.FREE.mediaKitEnabled, PLAN_LIMITS.PRO.mediaKitEnabled, PLAN_LIMITS.AGENCY.mediaKitEnabled]).toEqual([false, true, true]);
    expect(isAppPath("/media-kit")).toBe(true);
    expect(isAppPath("/kit/cafe-nebula")).toBe(false);
    expect(usesStrictCsp("/kit/cafe-nebula")).toBe(true);
    expect(needsStrictDocument("/decouvrir/media-kit")).toBe(true);
  });
});
