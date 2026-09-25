// Réussites v2 (lot A) : rangs à paliers, missions de la semaine, coffre,
// série et boucliers — règles pures.
import { describe, expect, it } from "vitest";
import { REWARDS, STEPS, levelKey, rankFor, rankKey } from "@/lib/reussites/catalog";
import { CHEST_TABLE, MISSIONS, chestItemFromRoll, findMission, habitTargetFor, pickWeeklyMissions, type MissionContext } from "@/lib/reussites/missions";
import { shieldToGrant, shieldsToUse, streakOf } from "@/lib/reussites/streak";

describe("rangs à paliers", () => {
  it("5 rangs × 3 paliers, seuils croissants", () => {
    expect(STEPS).toHaveLength(15);
    for (let i = 1; i < STEPS.length; i++) expect(STEPS[i].minXp).toBeGreaterThan(STEPS[i - 1].minXp);
    expect(STEPS.map((s) => s.name).slice(0, 4)).toEqual(["Étincelle I", "Étincelle II", "Étincelle III", "Comète I"]);
  });

  it("rang, palier et progression dans le palier", () => {
    expect(rankFor(0)).toMatchObject({ level: 1, name: "Étincelle I", rank: 1, tier: 1, pct: 0, nextName: "Étincelle II" });
    expect(rankFor(520)).toMatchObject({ level: 5, name: "Comète II", rankId: "comete", levelXp: 450, nextXp: 650, pct: 35 });
    expect(rankFor(9000)).toMatchObject({ level: 15, name: "Nébuleuse III", nextXp: null, pct: 100 });
    expect(rankFor(-5).xp).toBe(0);
  });

  it("mêmes XP que les anciens niveaux aux récompenses : personne ne perd rien", () => {
    // Ancien niveau 3 (300), 7 (3 000), 8 (5 000) = Comète I, Constellation II, Nébuleuse I.
    expect(rankFor(300).name).toBe("Comète I");
    expect(rankFor(3000).name).toBe("Constellation II");
    expect(rankFor(5000).name).toBe("Nébuleuse I");
    // Les récompenses restent accordées par l'ancienne clé ET par le nouveau palier.
    const byKey = (k: string) => REWARDS.find((r) => r.key === k)!.grantedBy;
    expect(byKey("ach:ring-argent")).toEqual(expect.arrayContaining([levelKey(5), rankKey(7)]));
    expect(byKey("ach:frame-astre")).toEqual(expect.arrayContaining([levelKey(7), rankKey(11)]));
    expect(byKey("ach:ring-stellaire")).toEqual(expect.arrayContaining([levelKey(8), rankKey(13)]));
  });
});

describe("objectif de la mission Habitude", () => {
  it("médiane des 4 dernières semaines + 1, plafonnée selon le palier", () => {
    expect(habitTargetFor([1, 2, 2, 3], "PRO")).toEqual({ target: 3, gentle: false });
    expect(habitTargetFor([5, 5, 6, 6], "FREE").target).toBe(4);
    expect(habitTargetFor([9, 9, 9, 9], "PRO").target).toBe(7);
  });

  it("nouveau compte ou 2 semaines vides : semaine douce, objectif 1", () => {
    expect(habitTargetFor([], "FREE").target).toBe(1);
    expect(habitTargetFor([3, 4, 0, 0], "PRO")).toEqual({ target: 1, gentle: true });
  });
});

describe("choix des missions de la semaine", () => {
  const full: MissionContext = { networks: ["INSTAGRAM", "YOUTUBE", "TIKTOK"], importSources: true, hasOldMedia: true, bioReady: false };
  const base = { userId: "u1", weekId: "2026-W40", weekIndex: 2961, habitTarget: 3 };

  it("reproductible, 3 propositions différentes, compétences variées, mystère distinct", () => {
    const a = pickWeeklyMissions({ ...base, ctx: full });
    expect(pickWeeklyMissions({ ...base, ctx: full })).toEqual(a);
    expect(new Set(a.choices).size).toBe(3);
    const skills = a.choices.map((k) => findMission(k)!.skill);
    expect(new Set(skills).size).toBeGreaterThanOrEqual(2);
    expect(a.progressKey).toBe(a.choices[0]);
    const mysteryMetric = findMission(a.mysteryKey)!.metric;
    expect(a.choices.map((k) => findMission(k)!.metric)).not.toContain(mysteryMetric);
  });

  it("jamais de mission impossible : réseaux, sources d'import, page bio déjà faite", () => {
    const ytOnly: MissionContext = { networks: ["YOUTUBE"], importSources: false, hasOldMedia: false, bioReady: true };
    for (let w = 0; w < 40; w++) {
      const p = pickWeeklyMissions({ userId: `u${w}`, weekId: `2026-W${w}`, weekIndex: w, habitTarget: 2, ctx: ytOnly });
      const keys = [...p.choices, p.mysteryKey];
      for (const forbidden of ["prog-import", "mys-import", "prog-photos", "prog-reuse", "prog-multi3", "prog-multi2", "mys-first-comment", "mys-bio"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it("la progression de la semaine dernière n'est pas reproposée", () => {
    const a = pickWeeklyMissions({ ...base, ctx: full });
    const b = pickWeeklyMissions({ ...base, ctx: full, previousProgressKey: a.progressKey });
    expect(b.choices).not.toContain(a.progressKey);
  });

  it("Habitude : alterne les formulations, objectif adapté", () => {
    const even = pickWeeklyMissions({ ...base, weekIndex: 2960, ctx: full });
    const odd = pickWeeklyMissions({ ...base, weekIndex: 2961, ctx: full });
    expect(even).toMatchObject({ habitKey: "habit-posts", habitTarget: 3 });
    expect(odd).toMatchObject({ habitKey: "habit-days", habitTarget: 3 });
    expect(pickWeeklyMissions({ ...base, habitTarget: 1, weekIndex: 2961, ctx: full })).toMatchObject({ habitKey: "habit-early", habitTarget: 1 });
  });

  it("semaine commencée tard (première visite un jeudi) : Habitude toujours faisable", () => {
    // Jeudi : 4 jours restants.
    expect(pickWeeklyMissions({ ...base, habitTarget: 1, weekIndex: 2961, daysLeft: 4, ctx: full })).toMatchObject({ habitKey: "habit-posts", habitTarget: 1 });
    expect(pickWeeklyMissions({ ...base, habitTarget: 6, weekIndex: 2961, daysLeft: 3, ctx: full })).toMatchObject({ habitKey: "habit-days", habitTarget: 3 });
    // Dimanche : un seul jour, au plus 2 publications comptées.
    expect(pickWeeklyMissions({ ...base, habitTarget: 6, weekIndex: 2960, daysLeft: 1, ctx: full })).toMatchObject({ habitKey: "habit-posts", habitTarget: 2 });
  });

  it("chaque mission a un lien d'action interne et un titre", () => {
    for (const m of MISSIONS) {
      expect(m.href.startsWith("/")).toBe(true);
      expect(m.title(m.target).length).toBeGreaterThan(5);
    }
  });
});

describe("coffre", () => {
  it("chances affichées = 100 %, tirage conforme", () => {
    expect(CHEST_TABLE.reduce((n, r) => n + r.chance, 0)).toBe(100);
    const counts = { shield: 0, fragment: 0, bonus: 0, feature: 0 };
    for (let roll = 0; roll < 100; roll++) counts[chestItemFromRoll(roll)]++;
    // Lot C : « Vidéo à la une 7 jours », 5 %.
    expect(counts).toEqual({ shield: 38, fragment: 42, bonus: 15, feature: 5 });
  });
});

describe("série et boucliers", () => {
  const set = (...w: number[]) => new Set(w);

  it("la semaine en cours ne casse jamais la série", () => {
    expect(streakOf(set(7, 8, 9), 10)).toMatchObject({ current: 3, best: 3, end: 9 });
    expect(streakOf(set(7, 8, 9, 10), 10).current).toBe(4);
    expect(streakOf(set(7, 8), 10).current).toBe(0);
  });

  it("un bouclier ne sert que s'il sauve la série", () => {
    expect(shieldsToUse(set(6, 7, 8), 10, 1)).toEqual([9]);
    expect(shieldsToUse(set(6, 7, 8), 11, 1)).toEqual([]); // 2 semaines manquées, 1 bouclier
    expect(shieldsToUse(set(6, 7, 8), 11, 2)).toEqual([9, 10]);
    expect(shieldsToUse(set(8), 10, 2)).toEqual([]); // série d'une seule semaine : pas la peine
    expect(shieldsToUse(set(6, 7, 8, 9), 10, 2)).toEqual([]); // rien de manqué
  });

  it("un bouclier toutes les 4 semaines, réserve limitée", () => {
    expect(shieldToGrant(set(5, 6, 7, 8), 9, 0, 2)).toBe("streak:5:4");
    expect(shieldToGrant(set(5, 6, 7, 8, 9, 10, 11, 12), 12, 1, 2)).toBe("streak:5:8");
    expect(shieldToGrant(set(5, 6, 7, 8), 9, 2, 2)).toBeNull();
    expect(shieldToGrant(set(6, 7, 8), 9, 0, 2)).toBeNull();
  });
});
