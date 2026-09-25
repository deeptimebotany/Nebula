// Réussites v2, lot B : constellation de compétences (étoiles, leçons),
// condition de variété des rangs, meilleur créneau, bilan, vitrine — règles pures.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { STEPS, rankAt } from "@/lib/reussites/catalog";
import { LESSONS, findLesson } from "@/lib/reussites/lessons";
import { ALL_STARS, SKILLS, STAR_XP, gatedRank, maxStepAllowed, missingForRank, showcaseBadge, skillLevels, starProgress, type SkillId } from "@/lib/reussites/skills";
import { bestSlotCount, longestRun, slotTest } from "@/lib/reussites/skill-metrics";
import { focusOptions, weekRangeLabel } from "@/lib/reussites/review";
import { weekOf } from "@/lib/reussites/periods";
import { bestHourOf, hourGap, wallHour } from "@/lib/best-hour";
import type { PublishedPost } from "@/lib/reussites/posts";

const levels = (over: Partial<Record<SkillId, number>> = {}): Record<SkillId, number> => ({ regularite: 0, formats: 0, portee: 0, communaute: 0, strategie: 0, ...over });

describe("constellation", () => {
  it("5 compétences × 5 étoiles, clés uniques, XP croissants, une leçon par étoile", () => {
    expect(SKILLS).toHaveLength(5);
    expect(ALL_STARS).toHaveLength(25);
    expect(new Set(ALL_STARS.map((s) => s.key)).size).toBe(25);
    for (const sk of SKILLS) expect(sk.stars.map((s) => s.xp)).toEqual([...STAR_XP]);
    for (const st of ALL_STARS) {
      expect(findLesson(st.key)?.title.length).toBeGreaterThan(10);
      expect(st.href.startsWith("/") || st.href === "#bilan").toBe(true);
      expect(st.requirements.length).toBeGreaterThan(0);
    }
    expect(LESSONS).toHaveLength(25);
  });

  it("progression : l'exigence la moins avancée compte ; étoile allumée quand toutes sont atteintes", () => {
    const studio = ALL_STARS.find((s) => s.key === "star-formats-5")!;
    expect(starProgress(studio, { publishedVideos: 25, importedVideos: 2 })).toMatchObject({ values: [25, 2], pct: 40, done: false });
    expect(starProgress(studio, { publishedVideos: 30, importedVideos: 5 })).toMatchObject({ pct: 100, done: true });
    expect(starProgress(studio, {}).pct).toBe(0);
  });

  it("niveau d'une compétence = étoiles allumées", () => {
    expect(skillLevels(["star-regularite-1", "star-regularite-3", "star-portee-1", "posts-10"])).toMatchObject({ regularite: 2, portee: 1, formats: 0 });
  });
});

describe("condition de variété des rangs", () => {
  it("Étoile : 2 compétences au niveau 2 ; Constellation : 3 au niveau 3 ; Nébuleuse : 4 au niveau 4", () => {
    expect(maxStepAllowed(levels())).toBe(6);
    expect(maxStepAllowed(levels({ regularite: 2, formats: 2 }))).toBe(9);
    expect(maxStepAllowed(levels({ regularite: 3, formats: 3, portee: 3 }))).toBe(12);
    expect(maxStepAllowed(levels({ regularite: 4, formats: 4, portee: 4, communaute: 4 }))).toBe(15);
  });

  it("rang en attente : barre pleine et ce qui manque, compétences les plus proches d'abord", () => {
    const r = gatedRank(1000, levels({ regularite: 2, formats: 1 }));
    expect(r).toMatchObject({ level: 6, name: "Comète III", pct: 100, nextName: "Étoile I" });
    expect(r.pending).toEqual({ step: 7, name: "Étoile I", condition: "2 compétences au niveau 2", missing: ["1 compétence de plus au niveau 2", "Formats vidéo (1/2)"] });
    expect(gatedRank(500, levels()).pending).toBeNull(); // XP insuffisants : rien en attente
  });

  it("un rang déjà atteint n'est jamais retiré, mais jamais au-delà des XP", () => {
    expect(gatedRank(1300, levels(), 8)).toMatchObject({ level: 8, name: "Étoile II" });
    expect(gatedRank(1300, levels(), 12).level).toBe(8);
    expect(gatedRank(1300, levels({ regularite: 2, portee: 2 }), 1)).toMatchObject({ level: 8, pending: null });
  });

  it("rankAt : progression dans le palier enregistré", () => {
    expect(rankAt(520, 5)).toMatchObject({ name: "Comète II", pct: 35, pending: null });
    expect(missingForRank(3, levels({ regularite: 2, formats: 2 }))).toEqual([]);
  });

  it("la migration garde le palier des XP : mêmes seuils que le catalogue", () => {
    const dir = join(process.cwd(), "prisma/migrations");
    const name = readdirSync(dir).find((d) => d.endsWith("_reussites_constellation"))!;
    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    const pairs = Array.from(sql.matchAll(/WHEN "creatorXp" >= (\d+) THEN (\d+)/g)).map((m) => [Number(m[1]), Number(m[2])]);
    const expected = STEPS.filter((s) => s.step > 1).map((s) => [s.minXp, s.step]).reverse();
    expect(pairs).toEqual(expected);
  });
});

describe("meilleur créneau et tests de créneaux", () => {
  const post = (id: string, targets: { network: string; connectionId: string; at: Date }[]): PublishedPost => ({
    id,
    firstAt: targets[0].at,
    networks: new Set(targets.map((t) => t.network)),
    type: "VIDEO",
    hasFirstComment: false,
    mediaIds: [],
    imported: false,
    scheduledAhead: false,
    vertical: false,
    youtubeThumbnail: false,
    targets
  });

  it("heure dans le fuseau de la marque (avant : celle du serveur)", () => {
    const at = new Date("2026-09-24T16:30:00Z");
    expect(wallHour(at, "Europe/Paris")).toBe(18);
    expect(wallHour(at, "America/Montreal")).toBe(12);
    expect(hourGap(23, 0)).toBe(1);
    expect(hourGap(6, 18)).toBe(12);
  });

  it("meilleure heure d'un compte, puis publications à une heure près", () => {
    const snaps = [16, 16, 16, 9, 9].map((h, i) => ({ capturedAt: new Date(Date.UTC(2026, 8, 20 + i, h, 0)), followersDelta: h === 16 ? 10 : 1, engagementRate: 1 }));
    expect(bestHourOf(snaps, "Europe/Paris")).toMatchObject({ hour: 18 });
    const connections = [{ id: "c1", network: "INSTAGRAM", brand: { timezone: "Europe/Paris" }, analytics: snaps }];
    const posts = [
      post("a", [{ network: "INSTAGRAM", connectionId: "c1", at: new Date("2026-09-25T17:10:00Z") }]), // 19 h
      post("b", [{ network: "INSTAGRAM", connectionId: "c1", at: new Date("2026-09-25T09:00:00Z") }]), // 11 h
      post("c", [{ network: "INSTAGRAM", connectionId: "c2", at: new Date("2026-09-25T16:00:00Z") }]) // compte sans données
    ];
    expect(bestSlotCount(posts, connections)).toBe(1);
    expect(bestSlotCount(posts, [{ ...connections[0], analytics: snaps.slice(0, 4) }])).toBe(0); // moins de 5 relevés
  });

  it("test de créneaux : matin et soir sur un même réseau, 30 derniers jours", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const tz = new Map([["c1", "Europe/Paris"]]);
    const at = (d: number, h: number) => new Date(Date.UTC(2026, 8, d, h - 2, 0)); // heure de Paris (UTC+2)
    const posts = [
      post("m1", [{ network: "TIKTOK", connectionId: "c1", at: at(20, 8) }]),
      post("m2", [{ network: "TIKTOK", connectionId: "c1", at: at(21, 9) }]),
      post("e1", [{ network: "TIKTOK", connectionId: "c1", at: at(22, 19) }]),
      post("x", [{ network: "TIKTOK", connectionId: "c1", at: at(22, 14) }]), // après-midi : ni l'un ni l'autre
      post("old", [{ network: "TIKTOK", connectionId: "c1", at: new Date("2026-08-01T18:00:00Z") }])
    ];
    expect(slotTest(posts, tz, now)).toEqual({ morning: 2, evening: 1 });
  });

  it("plus longue suite de semaines", () => {
    expect(longestRun([3, 4, 5, 8, 9])).toBe(3);
    expect(longestRun([])).toBe(0);
  });
});

describe("bilan de la semaine et vitrine", () => {
  it("propositions de cap tirées des chiffres, période lisible", () => {
    const opts = focusOptions({ days: 2, top: { title: "Recette de la tarte aux pommes express, en trois gestes seulement", views: 900, network: "TIKTOK", permalink: null, hour: 19 } });
    expect(opts.map((o) => o.key)).toEqual(["format", "slot", "rhythm", "new"]);
    expect(opts[0].label).toBe("Refaire le format de « Recette de la tarte aux pommes express, en troi… » (TikTok)");
    expect(opts[1].label).toBe("Publier vers 19 h, l'heure de votre publication la plus vue");
    expect(opts[2].label).toBe("Publier sur 3 jours différents cette semaine");
    expect(focusOptions({ days: 0, top: null })[0].label).toBe("Refaire le format de votre publication préférée");
    expect(weekRangeLabel(weekOf(new Date("2026-09-23T12:00:00Z")))).toBe("du 21 au 27 septembre");
    expect(weekRangeLabel(weekOf(new Date("2026-09-30T12:00:00Z")))).toBe("du 28 septembre au 4 octobre");
  });

  it("badges de vitrine : étoiles et accomplissements, clés inconnues refusées", () => {
    expect(showcaseBadge("star-communaute-5")).toEqual({ key: "star-communaute-5", emoji: "💬", label: "Communauté ★5 · Mentor", kind: "star" });
    expect(showcaseBadge("first-post")).toMatchObject({ kind: "accomplishment", label: "Première publication" });
    expect(showcaseBadge("migration:v2")).toBeNull();
  });
});
