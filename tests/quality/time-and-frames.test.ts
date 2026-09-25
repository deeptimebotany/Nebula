import { describe, expect, it } from "vitest";
import { localInputToUtc, timeZoneLabel, utcToLocalInput } from "@/lib/timezone";
import { isPastSchedule } from "@/lib/schedule-guard";
import { BIO_FRAMES, bioCardSize, frameFitsTheme, resolveBioFrame } from "@/lib/bio-frames";

const PARIS = "Europe/Paris";

describe("fuseaux horaires (heure de la marque ↔ UTC)", () => {
  it("heure d'été et heure d'hiver", () => {
    expect(localInputToUtc("2026-07-01T18:00", PARIS)!.toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(localInputToUtc("2026-01-15T18:00", PARIS)!.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });
  it.each([PARIS, "America/New_York", "Asia/Kolkata", "Australia/Lord_Howe"])("aller-retour sans décalage (%s)", (tz) => {
    for (const v of ["2026-01-01T00:00", "2026-06-30T23:59"]) expect(utcToLocalInput(localInputToUtc(v, tz)!, tz)).toBe(v);
  });
  it("refuse une saisie mal formée ; décalages d'une demi-heure", () => {
    expect(localInputToUtc("25/09/2026 18:00", PARIS)).toBeNull();
    expect(timeZoneLabel("Asia/Kolkata", new Date("2026-07-01T12:00:00Z"))).toBe("UTC+5:30");
  });
});

describe("pas de programmation dans le passé", () => {
  const now = Date.parse("2026-09-24T10:00:00Z");
  it("tolère 60 s d'écart d'horloge, pas plus", () => {
    expect(isPastSchedule(new Date(now - 59_000), now)).toBe(false);
    expect(isPastSchedule(new Date(now - 61_000), now)).toBe(true);
    expect(isPastSchedule(new Date(now + 3_600_000), now)).toBe(false);
  });
});

describe("cadres de la Page bio liés aux thèmes", () => {
  const frame = (key: string) => BIO_FRAMES.find((f) => f.key === key)!;
  it("les thèmes « univers » n'acceptent que leurs cadres (et la couronne)", () => {
    expect(frameFitsTheme(frame("or-halo"), "or-imperial")).toBe(true);
    expect(frameFitsTheme(frame("couronne"), "or-imperial")).toBe(true);
    expect(frameFitsTheme(frame("eclipse-halo"), "or-imperial")).toBe(false);
    expect(frameFitsTheme(frame("prisme"), "prisme")).toBe(true);
  });
  it("un cadre incompatible retombe sur le cadre du thème", () => {
    expect(resolveBioFrame("or-imperial", "eclipse-halo")).toEqual({ style: "halo", flavor: "or" });
    expect(resolveBioFrame("prisme", "or-halo")).toEqual({ style: "prisme", flavor: "eclipse" });
    expect(resolveBioFrame("or-imperial", "none")).toBeNull();
  });
  it("taille de carte : Gratuit < Pro < Agence < 1M d'abonnés", () => {
    expect(bioCardSize("FREE", false)).toBe("base");
    expect(bioCardSize("PRO", false)).toBe("pro");
    expect(bioCardSize("AGENCY", false)).toBe("agency");
    expect(bioCardSize("FREE", true)).toBe("legend");
  });
});
