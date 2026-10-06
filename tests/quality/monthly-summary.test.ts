// Bilan du mois (03/10/2026) : calendrier d'envoi, calcul des vrais chiffres
// selon la façon dont chaque réseau les donne, phrases calculées et e-mail.
import { describe, expect, it } from "vitest";
import { accountFollowers, accountViews, buildSummary, insightsOf, pctText, viewsInRange, type NebulaTargetIn, type PostMetricIn, type SnapIn, type SummaryInput } from "@/lib/monthly-summary/build";
import { dayIndexOf, daysInMonth, monthBounds, monthLabel, nextMonth, ofMonth, previousMonth } from "@/lib/monthly-summary/period";
import { dueMonth, endOfMonthSyncWindow } from "@/lib/monthly-summary/period-window";
import { renderSummaryEmail, summarySubject, type SummaryLinks } from "@/lib/monthly-summary/email";

const TZ = "Europe/Paris";
const at = (iso: string) => new Date(iso);
const snap = (connectionId: string, iso: string, followers: number, impressions = 0): SnapIn => ({ connectionId, capturedAt: at(iso), followers, impressions });
const post = (connectionId: string, id: string, iso: string, views: number | null, extra: Partial<PostMetricIn> = {}): PostMetricIn => ({
  connectionId,
  postExternalId: id,
  title: `Vidéo ${id}`,
  permalink: `https://example.com/${id}`,
  thumbnailUrl: null,
  publishedAt: at(iso),
  views,
  likes: views === null ? null : Math.round(views / 10),
  comments: views === null ? null : 2,
  shares: null,
  saves: null,
  durationSeconds: null,
  ...extra
});
const LINKS: SummaryLinks = {
  logoUrl: "https://nebulahub.space/email/nebula-logo.png",
  bilanUrl: "https://nebulahub.space/analytics/bilan",
  calendarUrl: "https://nebulahub.space/calendar",
  engagementsUrl: "https://nebulahub.space/engagements",
  settingsUrl: "https://nebulahub.space/settings#compte",
  unsubscribeUrl: "https://nebulahub.space/api/email/bilan/unsubscribe?token=abc",
  billingUrl: "https://nebulahub.space/billing"
};

describe("mois et calendrier d'envoi", () => {
  it("mois calendaires à l'heure de Paris, changement d'heure compris", () => {
    expect(monthBounds("2026-10", TZ)).toEqual({ start: at("2026-09-30T22:00:00Z"), end: at("2026-10-31T23:00:00Z") });
    expect([daysInMonth("2026-09"), daysInMonth("2026-02"), daysInMonth("2028-02")]).toEqual([30, 28, 29]);
    expect([previousMonth("2026-01"), nextMonth("2026-12")]).toEqual(["2025-12", "2027-01"]);
    expect(dayIndexOf(at("2026-09-30T22:30:00Z"), "2026-10", TZ)).toBe(0);
    expect(dayIndexOf(at("2026-09-30T21:30:00Z"), "2026-10", TZ)).toBe(-1);
    expect([monthLabel("2026-09"), ofMonth("2026-08"), ofMonth("2026-09"), ofMonth("2026-04")]).toEqual(["septembre 2026", "d'août", "de septembre", "d'avril"]);
  });

  it("le 3 à 9 h (Paris), le bilan du mois précédent ; relevé de fin de mois avant", () => {
    expect(dueMonth(at("2026-10-02T12:00:00Z"))).toBeNull();
    expect(dueMonth(at("2026-10-03T06:59:00Z"))).toBeNull();
    expect(dueMonth(at("2026-10-03T07:00:00Z"))).toBe("2026-09");
    expect(dueMonth(at("2026-10-20T10:00:00Z"))).toBe("2026-09");
    expect(dueMonth(at("2027-01-03T08:00:00Z"))).toBe("2026-12");
    expect([endOfMonthSyncWindow(at("2026-10-01T10:00:00Z")), endOfMonthSyncWindow(at("2026-10-03T06:00:00Z")), endOfMonthSyncWindow(at("2026-10-03T08:00:00Z"))]).toEqual([true, true, false]);
  });
});

describe("vrais chiffres, réseau par réseau", () => {
  it("Instagram (valeur du jour) : un relevé par jour, additionnés", () => {
    const snaps = [snap("ig", "2026-09-01T08:00:00Z", 100, 50), snap("ig", "2026-09-01T20:00:00Z", 101, 70), snap("ig", "2026-09-02T08:00:00Z", 103, 30)];
    const v = accountViews("daily", snaps, [], "2026-09", TZ);
    expect(v.total).toBe(100);
    expect(v.daily?.slice(0, 3)).toEqual([70, 30, 0]);
  });

  it("YouTube (compteur total de la chaîne) : fin du mois moins début, jamais la somme des relevés", () => {
    const snaps = [snap("yt", "2026-08-31T20:00:00Z", 500, 10_000), snap("yt", "2026-09-10T08:00:00Z", 520, 10_400), snap("yt", "2026-09-30T08:00:00Z", 560, 11_250)];
    expect(accountViews("cumulative", snaps, [], "2026-09", TZ).total).toBe(1_250);
    // Sans relevé avant le mois : depuis le premier relevé du mois.
    const partial = accountViews("cumulative", snaps.slice(1), [], "2026-09", TZ);
    expect(partial).toMatchObject({ total: 850, partial: true });
    // Rapports clients : même règle sur une période quelconque.
    expect(viewsInRange("cumulative", snaps.slice(1), snaps[0], [], at("2026-09-01T00:00:00Z"), at("2026-10-01T00:00:00Z"))).toBe(1_250);
  });

  it("Pinterest (30 derniers jours) : le dernier relevé du mois s'il est récent ; TikTok : vues des publications du mois ; Bluesky : rien", () => {
    expect(accountViews("rolling30", [snap("pin", "2026-09-29T08:00:00Z", 10, 4_200)], [], "2026-09", TZ).total).toBe(4_200);
    expect(accountViews("rolling30", [snap("pin", "2026-09-12T08:00:00Z", 10, 4_200)], [], "2026-09", TZ).total).toBeNull();
    const posts = [post("tt", "1", "2026-09-05T10:00:00Z", 1_000), post("tt", "2", "2026-08-30T10:00:00Z", 9_999), post("tt", "3", "2026-09-20T10:00:00Z", null)];
    expect(accountViews("posts", [], posts, "2026-09", TZ).total).toBe(1_000);
    expect(accountViews("none", [snap("bs", "2026-09-05T10:00:00Z", 10, 99)], [], "2026-09", TZ).total).toBeNull();
  });

  it("abonnés : gain jour par jour depuis le dernier relevé d'avant le mois, pertes comprises", () => {
    const f = accountFollowers([snap("a", "2026-08-31T12:00:00Z", 100), snap("a", "2026-09-01T12:00:00Z", 110), snap("a", "2026-09-03T12:00:00Z", 105)], "2026-09", TZ)!;
    expect(f).toMatchObject({ total: 105, base: 100, gain: 5, partial: false });
    expect(f.daily.slice(0, 4)).toEqual([10, 0, -5, 0]);
    expect(accountFollowers([snap("a", "2026-08-31T12:00:00Z", 100)], "2026-09", TZ)).toBeNull();
  });

  it("« Ce qui a marché » : rien sous 6 publications chiffrées ; sinon le créneau qui fait vraiment mieux", () => {
    const base = (id: string, iso: string, views: number) => ({ ...post("ig", id, iso, views), network: "INSTAGRAM", mediaType: "VIDEO" });
    const few = ["1", "2", "3", "4", "5"].map((id, i) => base(id, `2026-09-0${i + 1}T16:30:00Z`, 100));
    expect(insightsOf(few, TZ)).toEqual([]);
    const evening = ["1", "2", "3"].map((id, i) => base(`e${id}`, `2026-09-0${i + 1}T17:00:00Z`, 3_000)); // 19 h à Paris
    const morning = ["1", "2", "3", "4"].map((id, i) => base(`m${id}`, `2026-09-1${i}T08:00:00Z`, 1_000)); // 10 h
    const tips = insightsOf([...evening, ...morning], TZ);
    expect(tips[0]).toMatchObject({ kind: "hour" });
    expect(tips[0].text).toContain("entre 18 h et 21 h");
    expect(tips[0].text).toContain("3 fois plus de vues");
  });

  it("pourcentages à la française", () => {
    expect([pctText(22.4), pctText(5.84), pctText(-8), pctText(0.04)]).toEqual(["+22 %", "+5,8 %", "−8 %", "+0 %"]);
  });
});

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
  const targets: NebulaTargetIn[] = [
    // Une publication Nebula sur Instagram et YouTube : compte une fois, deux mises en ligne.
    { postId: "p1", connectionId: "ig", externalPostId: "ig-1", externalUrl: null, publishedAt: at("2026-09-14T16:00:00Z"), mediaType: "VIDEO", title: "Latte art <le cœur>", thumbnailUrl: "https://abc.public.blob.vercel-storage.com/t.jpg" },
    { postId: "p1", connectionId: "yt", externalPostId: "yt-1", externalUrl: "https://youtu.be/1", publishedAt: at("2026-09-14T16:05:00Z"), mediaType: "VIDEO", title: "Latte art <le cœur>", thumbnailUrl: null }
  ];
  return {
    month: "2026-09",
    tz: TZ,
    brand: { id: "b1", name: "Studio <Nova>", slug: "studio-nova" },
    accounts: [
      { id: "ig", network: "INSTAGRAM", name: "@studio.nova" },
      { id: "yt", network: "YOUTUBE", name: "@StudioNova" },
      { id: "tt", network: "TIKTOK", name: "@studionova" }
    ],
    upsell: true,
    snapshots: [
      snap("ig", "2026-07-31T12:00:00Z", 900, 10),
      snap("ig", "2026-08-31T12:00:00Z", 1_000, 300),
      snap("ig", "2026-09-14T12:00:00Z", 1_100, 900),
      snap("ig", "2026-09-30T12:00:00Z", 1_120, 400),
      snap("yt", "2026-08-31T12:00:00Z", 200, 50_000),
      snap("yt", "2026-09-30T12:00:00Z", 230, 52_000)
    ],
    postMetrics: [
      post("ig", "ig-1", "2026-09-14T16:00:00Z", 5_000, { title: null }),
      post("yt", "yt-1", "2026-09-14T16:05:00Z", 1_500, { thumbnailUrl: "https://i.ytimg.com/vi/1/hq.jpg" }),
      post("tt", "tt-9", "2026-09-20T18:00:00Z", 800, { thumbnailUrl: "https://p16-sign.tiktokcdn.com/x.jpg" }),
      post("ig", "ig-0", "2026-08-10T10:00:00Z", 2_000)
    ],
    targets,
    scheduledNext: [at("2026-10-06T16:00:00Z"), at("2026-10-06T18:00:00Z")],
    community: { comments: 12, replies: 3 },
    bio: { total: 300, delta: 40 },
    reussites: { xp: 120, missions: 3, badges: ["Régularité · palier 2"], rank: "Régulier I", nextRank: "Régulier II", xpToNext: 80 },
    ...overrides
  };
}

describe("bilan complet", () => {
  it("chiffres, comparaison, top et mois suivant", () => {
    const d = buildSummary(input());
    expect(d.hasData).toBe(true);
    expect(d.firstReport).toBe(false);
    expect(d.followers).toMatchObject({ total: 1_350, gain: 150 });
    expect(d.views.rows.find((r) => r.network === "YOUTUBE")?.total).toBe(2_000);
    expect(d.views.rows.find((r) => r.network === "INSTAGRAM")?.total).toBe(1_300);
    expect(d.views.rows.find((r) => r.network === "TIKTOK")?.total).toBe(800);
    expect(d.views.total).toBe(4_100);
    expect(d.publications).toMatchObject({ count: 2, online: 3, videos: 2, viaNebula: 1 });
    expect(d.top.map((t) => t.network)).toEqual(["INSTAGRAM", "YOUTUBE", "TIKTOK"]);
    // Miniatures : fichier Nebula ou YouTube ; jamais une adresse TikTok qui expire.
    expect(d.top.map((t) => t.thumbnailUrl)).toEqual(["https://abc.public.blob.vercel-storage.com/t.jpg", "https://i.ytimg.com/vi/1/hq.jpg", null]);
    expect(d.top[0].title).toBe("Latte art <le cœur>");
    expect(d.nextMonth).toMatchObject({ key: "2026-10", scheduled: 2, days: 1, missing: 1 });
    expect(d.essentials[0]).toMatch(/^.+ : \*\*\+150 abonnés\*\*/);
    expect(d.insights).toEqual([]);
  });

  it("premier bilan sans mois précédent ; marque sans aucune donnée", () => {
    const first = buildSummary(input({ snapshots: input().snapshots.filter((s) => s.capturedAt >= at("2026-09-01T00:00:00Z")), postMetrics: input().postMetrics.filter((p) => p.publishedAt >= at("2026-09-01T00:00:00Z")) }));
    expect(first.firstReport).toBe(true);
    expect(first.essentials[0]).toMatch(/^Votre premier bilan/);
    const empty = buildSummary(input({ snapshots: [], postMetrics: [], targets: [], community: null, bio: null, reussites: null }));
    expect(empty.hasData).toBe(false);
  });

  it("e-mail : échappé, moins de 102 Ko, sans « undefined » ni « NaN », encart Pro seulement en Gratuit", () => {
    const longTitles = input({
      postMetrics: Array.from({ length: 40 }, (_, i) => post("ig", `x${i}`, `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`, 1_000 + i, { title: "Un titre très long ".repeat(10) }))
    });
    const d = buildSummary(longTitles);
    const mail = renderSummaryEmail(d, LINKS);
    expect(Buffer.byteLength(mail.html)).toBeLessThan(102_000);
    expect(mail.html).not.toMatch(/undefined|NaN|\[object Object\]/);
    expect(mail.text).not.toMatch(/undefined|NaN/);
    expect(mail.html).toContain("Studio &lt;Nova&gt;");
    expect(mail.html).not.toContain("Studio <Nova>");
    expect(mail.html).toContain("Allez plus loin avec Pro");
    expect(mail.html).toContain(LINKS.unsubscribeUrl.replace(/&/g, "&amp;"));
    expect(renderSummaryEmail(buildSummary(input({ upsell: false })), LINKS).html).not.toContain("Allez plus loin avec Pro");
    expect(summarySubject(buildSummary(input()))).toBe("Studio <Nova> · votre bilan de septembre : +150 abonnés");
  });
});
