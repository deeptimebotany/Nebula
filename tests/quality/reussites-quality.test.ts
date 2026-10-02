// Réussites v3 (02/10/2026) : records de qualité — règles pures de quality.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  bestGrowth30d,
  engagementAboveBenchmarks,
  feedbackReceivedBest,
  followersAt,
  growthMonthsStreak,
  median,
  retentionStats,
  savesSharesRecord,
  viewsRecord,
  type FollowerSnapshot,
  type MetricPostRow
} from "@/lib/reussites/quality";
import { ALL_TIERS, COUNT_RECORD_SERIES, QUALITY_KEYS, SERIES, qualityCount } from "@/lib/reussites/catalog";

const NOW = new Date("2026-10-02T12:00:00Z");
// fr-FR sépare les milliers par une espace fine insécable.
const plain = (s: string | undefined) => (s ?? "").replace(/\u202f/g, " ");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const row = (over: Partial<MetricPostRow>): MetricPostRow => ({
  connectionId: "c1",
  network: "INSTAGRAM",
  title: null,
  permalink: null,
  publishedAt: daysAgo(10),
  capturedAt: daysAgo(1),
  views: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  avgViewPct: null,
  durationSeconds: null,
  ...over
});

describe("record de vues (médiane des 10 publications précédentes du même compte)", () => {
  const history = Array.from({ length: 10 }, (_, i) => row({ publishedAt: daysAgo(40 - i), views: 100 + (i % 2) * 20 }));

  it("médiane", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("une publication à 3,4× la médiane, preuve comprise", () => {
    const r = viewsRecord([...history, row({ publishedAt: daysAgo(10), views: 374, title: "Cold brew en 3 étapes", permalink: "https://example.com/p" })], NOW);
    expect(r.ratio).toBe(3.4);
    expect(r.evidence).toMatchObject({ headline: "3,4× votre médiane de vues", title: "Cold brew en 3 étapes", network: "INSTAGRAM", permalink: "https://example.com/p" });
    expect(plain(r.evidence!.detail)).toBe("374 vues, pour une médiane de 110 sur vos 10 publications précédentes (Instagram)");
  });

  it("en ligne depuis moins de 7 jours, historique trop court, médiane trop basse : rien", () => {
    expect(viewsRecord([...history, row({ publishedAt: daysAgo(3), views: 5000 })], NOW).ratio).toBe(1.2);
    expect(viewsRecord(history.slice(0, 4).concat(row({ views: 5000 })), NOW).ratio).toBe(0);
    const tiny = Array.from({ length: 6 }, (_, i) => row({ publishedAt: daysAgo(40 - i), views: 10 }));
    expect(viewsRecord([...tiny, row({ views: 400 })], NOW).ratio).toBe(0);
  });

  it("chaque compte est comparé à lui-même", () => {
    const other = Array.from({ length: 6 }, (_, i) => row({ connectionId: "c2", network: "TIKTOK", publishedAt: daysAgo(40 - i), views: 10_000 }));
    // 12 000 vues sur le compte TikTok : 1,2× sa médiane, pas 100×.
    expect(viewsRecord([...history, ...other, row({ connectionId: "c2", network: "TIKTOK", views: 12_000 })], NOW).ratio).toBe(1.2);
  });
});

describe("engagement au-dessus des repères du réseau", () => {
  const snaps = new Map<string, FollowerSnapshot[]>([["c1", [{ connectionId: "c1", capturedAt: daysAgo(60), followers: 1000 }]]]);

  it("abonnés au moment de la publication : dernier relevé avant, sinon le premier après", () => {
    const list = [
      { connectionId: "c1", capturedAt: daysAgo(30), followers: 800 },
      { connectionId: "c1", capturedAt: daysAgo(5), followers: 1200 }
    ];
    expect(followersAt(list, daysAgo(10))).toBe(800);
    expect(followersAt(list, daysAgo(40))).toBe(800);
    expect(followersAt([], daysAgo(1))).toBeNull();
  });

  it("repère médian (1,5 %) et élevé (4 %) sur Instagram", () => {
    const r = engagementAboveBenchmarks(
      [
        row({ likes: 45, comments: 5 }), // 5 % : médian et élevé
        row({ likes: 20 }), // 2 % : médian
        row({ likes: 10 }), // 1 % : rien
        row({ likes: 500, publishedAt: daysAgo(2) }), // trop récente
        row({ network: "LINKEDIN", likes: 500 }) // pas de repère
      ],
      snaps,
      NOW
    );
    expect(r).toMatchObject({ median: 2, high: 1 });
    expect(r.evidence).toMatchObject({ headline: "5 % d'engagement par abonné", network: "INSTAGRAM" });
    expect(plain(r.evidence!.detail)).toBe("Repère Instagram : médian 1,5 %, élevé 4 % (50 interactions, 1 000 abonnés)");
  });

  it("moins de 100 abonnés : pas comparé", () => {
    const small = new Map([["c1", [{ connectionId: "c1", capturedAt: daysAgo(60), followers: 50 }]]]);
    expect(engagementAboveBenchmarks([row({ likes: 40 })], small, NOW)).toMatchObject({ median: 0, high: 0, evidence: null });
  });
});

describe("rétention YouTube", () => {
  const yt = (over: Partial<MetricPostRow>) => row({ network: "YOUTUBE", durationSeconds: 600, views: 500, ...over });

  it("vidéos de plus de 3 minutes vues 100 fois : part moyenne regardée", () => {
    const r = retentionStats([yt({ avgViewPct: 62.7, title: "Tuto" }), yt({ avgViewPct: 51 }), yt({ avgViewPct: 40 }), yt({ avgViewPct: 90, durationSeconds: 45 }), yt({ avgViewPct: 80, views: 40 }), yt({ avgViewPct: 85, publishedAt: daysAgo(3) }), row({ avgViewPct: 99 })], NOW);
    expect(r).toMatchObject({ good: 2, best: 62 });
    expect(r.evidence).toMatchObject({ headline: "Vidéo regardée à 62 % en moyenne", title: "Tuto", network: "YOUTUBE" });
    expect(plain(r.evidence!.detail)).toBe("Vidéo YouTube de 10 min, 500 vues (YouTube Analytics)");
  });

  it("sans donnée de rétention : rien", () => {
    expect(retentionStats([yt({})], NOW)).toMatchObject({ good: 0, best: 0, evidence: null });
  });
});

describe("croissance réelle", () => {
  const labels = new Map([["c1", { network: "INSTAGRAM", name: "Studio Nova" }]]);
  const s = (d: number, followers: number, connectionId = "c1"): FollowerSnapshot => ({ connectionId, capturedAt: daysAgo(d), followers });

  it("abonnés nets sur 30 jours, depuis le plus bas relevé de la période", () => {
    const r = bestGrowth30d([s(50, 900), s(28, 1000), s(20, 980), s(2, 1127)], labels);
    // 980 → 1 127 en 18 jours : +147, soit +15 %.
    expect(r.pct).toBe(15);
    expect(r.evidence).toMatchObject({ headline: "+15 % d'abonnés en 30 jours" });
    expect(plain(r.evidence!.detail)).toBe("+147 abonnés nets sur Instagram (Studio Nova), de 980 à 1 127");
  });

  it("moins de 20 abonnés nets : rien (un petit compte ne gagne pas +15 % avec 15 abonnés)", () => {
    expect(bestGrowth30d([s(20, 100), s(1, 115)], labels).pct).toBe(0);
  });

  it("mois de croissance d'affilée (+1 % au moins, relevés sur 7 jours au moins)", () => {
    const at = (m: number, d: number, followers: number): FollowerSnapshot => ({ connectionId: "c1", capturedAt: new Date(Date.UTC(2026, m, d, 12)), followers });
    const snaps = [at(4, 2, 1000), at(4, 28, 1030), at(5, 2, 1030), at(5, 27, 1060), at(6, 1, 1060), at(6, 30, 1100), at(7, 3, 1100), at(7, 5, 1200)];
    // Mai, juin, juillet : +3 %, +2,9 %, +3,8 %. Août : relevés sur 2 jours seulement.
    expect(growthMonthsStreak(snaps, labels).months).toBe(3);
    // Un mois plat casse la série.
    const flat = [at(4, 2, 1000), at(4, 28, 1030), at(5, 2, 1030), at(5, 27, 1031), at(6, 1, 1031), at(6, 30, 1100)];
    expect(growthMonthsStreak(flat, labels).months).toBe(1);
  });
});

describe("contenu utile et avis de la communauté", () => {
  it("partages + enregistrements d'une même publication", () => {
    const r = savesSharesRecord([row({ shares: 40, saves: 80, title: "Recette" }), row({ shares: 100, saves: null })]);
    expect(r.best).toBe(120);
    expect(r.evidence).toMatchObject({ headline: "120 partages et enregistrements", title: "Recette" });
  });

  it("avis argumentés de créateurs différents, jamais les siens", () => {
    const c = (authorId: string, body = "Le premier visuel est plus lisible, garde-le.") => ({ authorId, body, createdAt: daysAgo(1) });
    const r = feedbackReceivedBest(
      [
        { id: "r1", context: "Quelle miniature ?", comments: [c("a"), c("b"), c("b"), c("c"), c("d"), c("e"), c("me"), c("f", "Top !")] },
        { id: "r2", context: "", comments: [c("a")] }
      ],
      "me"
    );
    expect(r.best).toBe(5);
    expect(r.evidence).toMatchObject({ headline: "5 créateurs ont donné leur avis", title: "Quelle miniature ?" });
  });
});

describe("catalogue des records de qualité", () => {
  it("un album « Qualité », des clés uniques, des records qui comptent pour les rangs", () => {
    const quality = SERIES.filter((s) => s.category === "qualite");
    expect(quality.map((s) => s.id)).toEqual(["record-vues", "engagement-repere", "engagement-eleve", "retention", "retention-record", "croissance-reelle", "croissance-continue", "contenu-utile"]);
    expect(new Set(ALL_TIERS.map((t) => t.key)).size).toBe(ALL_TIERS.length);
    for (const k of QUALITY_KEYS) expect(ALL_TIERS.some((t) => t.key === k), k).toBe(true);
    expect(qualityCount(["record-views-2", "posts-10", "helpful-5", "viral"])).toBe(3);
    // Séries « nombre de publications » : la preuve est la meilleure d'entre elles.
    expect(COUNT_RECORD_SERIES.every((id) => SERIES.some((s) => s.id === id))).toBe(true);
  });

  it("le volume rapporte peu : un record de qualité vaut plus qu'un palier de publications", () => {
    const xp = (k: string) => ALL_TIERS.find((t) => t.key === k)!.xp;
    expect(xp("record-views-2")).toBeGreaterThan(xp("posts-10"));
    expect(Math.max(...SERIES.filter((s) => s.id === "posts").flatMap((s) => s.tiers.map((t) => t.xp)))).toBeLessThanOrEqual(60);
  });
});
