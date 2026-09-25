import { describe, expect, it } from "vitest";
import { calendarMonthsNeeded, monthKey, monthKeysToRanges, monthsBetween } from "@/lib/calendar-range";

// Chargement du calendrier par mois (lot 4, performance).
describe("mois à charger pour le calendrier", () => {
  it("liste les mois entre deux dates, fin incluse", () => {
    expect(monthsBetween(new Date(2026, 10, 20), new Date(2027, 1, 3))).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween(new Date(2026, 8, 30), new Date(2026, 8, 1))).toEqual(["2026-09"]);
    expect(monthsBetween(new Date(2026, 9, 5), new Date(2026, 8, 1))).toEqual([]);
  });

  it("couvre la grille, le scrubber et le jour de la vue Heures", () => {
    const today = new Date(2026, 8, 24); // jeudi 24 septembre 2026
    const months = calendarMonthsNeeded({ cursor: new Date(2026, 8, 1), agendaDay: today, today });
    // Scrubber : du lundi 10 août au dimanche 15 novembre ; grille : du 31 août au 11 octobre.
    expect(months).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
  });

  it("ajoute le mois affiché et le jour de la vue Heures même loin d'aujourd'hui", () => {
    const today = new Date(2026, 8, 24);
    const months = calendarMonthsNeeded({ cursor: new Date(2027, 5, 1), agendaDay: new Date(2025, 0, 15), today });
    expect(months).toContain("2027-06");
    expect(months).toContain("2027-05"); // lundi 31 mai en tête de grille
    expect(months).toContain("2027-07"); // fin de grille début juillet
    expect(months).toContain("2025-01");
  });

  it("regroupe les mois consécutifs, avec un jour de marge de chaque côté", () => {
    const ranges = monthKeysToRanges(["2026-10", "2026-09", "2026-12", "2026-09"]);
    expect(ranges.map((r) => [r.from.toISOString(), r.to.toISOString()])).toEqual([
      ["2026-08-31T00:00:00.000Z", "2026-11-02T00:00:00.000Z"],
      ["2026-11-30T00:00:00.000Z", "2027-01-02T00:00:00.000Z"]
    ]);
  });

  it("passe d'une année à l'autre sans trou", () => {
    const ranges = monthKeysToRanges(["2026-12", "2027-01"]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].to.toISOString()).toBe("2027-02-02T00:00:00.000Z");
    expect(monthKey(new Date(2027, 0, 31))).toBe("2027-01");
  });
});
