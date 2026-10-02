// Avis de la communauté (02/10/2026) : règles sans base de données.
import { describe, expect, it } from "vitest";
import { canSeeResults, optionLetter, timeLeftLabel, votePercent, winningOptions } from "@/lib/community/feedback-rules";
import { PLAN_LIMITS } from "@/lib/plans";

describe("avis de la communauté : règles", () => {
  it("résultats cachés tant qu'on n'a pas voté (sauf l'auteur, et une fois terminée)", () => {
    expect(canSeeResults({ mine: false, voted: false, closed: false })).toBe(false);
    expect(canSeeResults({ mine: false, voted: true, closed: false })).toBe(true);
    expect(canSeeResults({ mine: true, voted: false, closed: false })).toBe(true);
    expect(canSeeResults({ mine: false, voted: false, closed: true })).toBe(true);
  });

  it("gagnant, égalité, aucun vote", () => {
    expect(winningOptions([{ id: "a", votes: 3 }, { id: "b", votes: 5 }])).toEqual(["b"]);
    expect(winningOptions([{ id: "a", votes: 4 }, { id: "b", votes: 4 }, { id: "c", votes: 1 }])).toEqual(["a", "b"]);
    expect(winningOptions([{ id: "a", votes: 0 }, { id: "b", votes: null }])).toEqual([]);
  });

  it("pourcentages et temps restant", () => {
    expect(votePercent(1, 3)).toBe(33);
    expect(votePercent(null, 3)).toBe(0);
    expect(votePercent(2, 0)).toBe(0);
    const now = Date.parse("2026-10-02T10:00:00Z");
    expect(timeLeftLabel("2026-10-05T10:00:00Z", now)).toBe("encore 3 j");
    expect(timeLeftLabel("2026-10-02T15:30:00Z", now)).toBe("encore 5 h");
    expect(timeLeftLabel("2026-10-02T10:20:00Z", now)).toBe("encore 20 min");
    expect(timeLeftLabel("2026-10-02T09:00:00Z", now)).toBe("terminé");
    expect([0, 1, 2].map(optionLetter)).toEqual(["A", "B", "C"]);
  });

  it("limite par palier : 2 par semaine en Gratuit, sans limite pratique ailleurs", () => {
    expect(PLAN_LIMITS.FREE.feedbackPerWeek).toBe(2);
    expect(PLAN_LIMITS.TRIAL.feedbackPerWeek).toBeNull();
    expect(PLAN_LIMITS.PRO.feedbackPerWeek).toBeNull();
    expect(PLAN_LIMITS.AGENCY.feedbackPerWeek).toBeNull();
  });
});
