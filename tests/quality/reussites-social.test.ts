// Réussites v2, lot C : saisons, défi collectif, file de la une, rareté,
// cookie « outils essayés » — règles pures.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { SEASON_TARGET, seasonById, seasonOfMonth } from "@/lib/reussites/seasons";
import { COLLECTIVE_MIN_TARGET, autoTarget } from "@/lib/reussites/collective";
import { FEATURE_SLOTS, nextStart } from "@/lib/reussites/featured";
import { RARITY_MIN_CREATORS, rarityTier } from "@/lib/reussites/rarity";
import { TOOL_IDS, parseToolsCookie, toolsExploredCount } from "@/lib/tools-explored";
import { SERIES } from "@/lib/reussites/catalog";
import { rarityOf } from "@/lib/reussites/view";

describe("saisons", () => {
  it("3 mois par saison ; l'hiver chevauche deux années", () => {
    expect(seasonOfMonth("2026-09")).toMatchObject({ id: "2026-automne", label: "Automne 2026", months: ["2026-09", "2026-10", "2026-11"] });
    expect(seasonOfMonth("2026-12")).toMatchObject({ id: "2026-hiver", label: "Hiver 2026-2027", months: ["2026-12", "2027-01", "2027-02"] });
    expect(seasonOfMonth("2027-02").id).toBe("2026-hiver");
    expect(seasonOfMonth("2027-03").id).toBe("2027-printemps");
    expect(seasonOfMonth("2027-08")).toMatchObject({ id: "2027-ete", label: "Été 2027" });
    expect(seasonById("2026-hiver")?.months).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(seasonById("n'importe quoi")).toBeNull();
    expect(SEASON_TARGET).toBe(2);
  });
});

describe("défi collectif", () => {
  it("objectif automatique : mois précédent + 10 %, au moins 10", () => {
    expect(autoTarget(0)).toBe(COLLECTIVE_MIN_TARGET);
    expect(autoTarget(5)).toBe(10);
    expect(autoTarget(100)).toBe(110);
    expect(autoTarget(101)).toBe(112);
  });
});

describe("vidéo à la une : file d'attente", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const d = (days: number) => new Date(now.getTime() + days * 86_400_000);
  it("une place libre : tout de suite ; sinon, dès que la première des 3 dernières se termine", () => {
    expect(FEATURE_SLOTS).toBe(3);
    expect(nextStart([], now)).toEqual(now);
    expect(nextStart([d(2), d(5)], now)).toEqual(now);
    expect(nextStart([d(2), d(5), d(6)], now)).toEqual(d(2));
    // Une vidéo déjà en attente (commence à d(2), finit à d(9)) : la suivante attend d(5).
    expect(nextStart([d(2), d(5), d(6), d(9)], now)).toEqual(d(5));
    // Les mises à la une terminées ne comptent pas.
    expect(nextStart([d(-1), d(-3), d(4)], now)).toEqual(now);
  });
});

describe("rareté réelle", () => {
  it("formes selon la part des créateurs ; rien en dessous de 20 créateurs", () => {
    expect(rarityTier(0.4, 100)).toBe("commun");
    expect(rarityTier(0.25, 100)).toBe("rare");
    expect(rarityTier(0.05, 100)).toBe("rare");
    expect(rarityTier(0.02, 100)).toBe("epique");
    expect(rarityTier(0.005, 1000)).toBe("legendaire");
    expect(rarityTier(0.5, RARITY_MIN_CREATORS - 1)).toBeNull();
  });

  it("affichage : rien pour un badge que personne n'a ; sous 10 %, une décimale arrondie vers le bas", () => {
    const map = new Map([
      ["a", { share: 0, tier: "legendaire" as const }],
      ["b", { share: 1 / 21, tier: "epique" as const }],
      ["c", { share: 0.76, tier: "commun" as const }],
      ["d", { share: 0.0004, tier: "legendaire" as const }],
      ["e", { share: 0.3, tier: null }]
    ]);
    expect(rarityOf(map, "a")).toBeNull();
    expect(rarityOf(map, "b")).toEqual({ tier: "epique", pct: 4.7 });
    expect(rarityOf(map, "c")).toEqual({ tier: "commun", pct: 76 });
    expect(rarityOf(map, "d")).toEqual({ tier: "legendaire", pct: 0.1 });
    expect(rarityOf(map, "e")).toBeNull();
    expect(rarityOf(map, "inconnu")).toBeNull();
  });
});

describe("badge Explorateur", () => {
  it("cookie : seulement des outils connus, sans doublon", () => {
    expect(TOOL_IDS).toContain("legendes");
    expect(parseToolsCookie("legendes.hashtags.legendes")).toEqual(["legendes", "hashtags"]);
    expect(parseToolsCookie("legendes.<script>.inconnu")).toEqual(["legendes"]);
    expect(toolsExploredCount(encodeURIComponent("miniatures.titre-youtube"))).toBe(2);
    expect(toolsExploredCount(undefined)).toBe(0);
  });

  it("série cachée tant qu'elle n'est pas gagnée ; Décollage réussi en 5 étapes", () => {
    const explorer = SERIES.find((s) => s.id === "explorer")!;
    expect(explorer).toMatchObject({ hiddenUntilUnlocked: true, metric: "toolsExplored" });
    expect(explorer.tiers[0].target).toBe(2);
    expect(SERIES.find((s) => s.id === "launch")!.tiers[0]).toMatchObject({ target: 5, xp: 100 });
    expect(SERIES.find((s) => s.id === "first-post")!.name).toBe("Première publication");
  });
});
