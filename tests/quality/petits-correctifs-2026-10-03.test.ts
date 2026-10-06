// Petits correctifs du 03/10/2026 :
//  - Réussites : les 3 propositions de la Progression comptent, plus de choix
//    verrouillé (« Choix fixé pour cette semaine ») ;
//  - Analytics : la carte « Évolution des abonnés » ne bouge plus au survol ;
//  - Calendrier : la frise des semaines n'affiche plus de « gros bloc gris ».
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { weekBarHeight } from "@/components/dashboard/week-scrubber";
import { tiltAmplitude } from "@/components/ui/motion-glass-card";

const ROOT = path.resolve(__dirname, "../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("Réussites : Progression au choix", () => {
  it("plus de verrouillage ni de limite de changements", () => {
    const page = read("src/app/(dashboard)/reussites/page.tsx");
    expect(page).not.toMatch(/Choix fixé|changer une fois|swapsLeft/);
    expect(page).toContain("Les 3 comptent : la première réussie valide la mission.");
    const weekly = read("src/lib/reussites/weekly.ts");
    expect(weekly).not.toMatch(/MAX_SWAPS|Vous avez déjà changé de mission/);
    expect(weekly).toContain("const reached = choiceDefs.filter((d) => values[d.metric] >= d.target);");
    expect(read("src/lib/reussites/missions.ts")).not.toContain("MAX_SWAPS");
  });
});

describe("cartes animées", () => {
  it("l'inclinaison passe par Framer Motion (plus de transformation CSS écrasée au premier survol)", () => {
    const card = read("src/components/ui/motion-glass-card.tsx");
    expect(card).not.toContain("--tilt-x");
    expect(card).toContain("transformPerspective: 800");
    expect([tiltAmplitude(300), tiltAmplitude(600), Number(tiltAmplitude(1120).toFixed(2)), tiltAmplitude(0)]).toEqual([6, 3, 1.61, 0]);
  });

  it("graphiques et calendrier immobiles au survol", () => {
    expect(read("src/app/(dashboard)/analytics/analytics-client.tsx")).toContain("<MotionGlassCard glow still>");
    expect(read("src/app/(dashboard)/dashboard/dashboard-client.tsx")).toContain("<MotionGlassCard still>");
    const calendar = read("src/app/(dashboard)/calendar/page.tsx");
    expect(calendar.match(/<MotionGlassCard still>/g)).toHaveLength(3);
    expect(calendar).not.toMatch(/<MotionGlassCard>/);
  });
});

describe("frise du calendrier", () => {
  it("semaine vide = aucune barre ; sinon proportionnelle, 4 à 30 px", () => {
    expect(weekBarHeight(0, 9)).toBe(0);
    expect(weekBarHeight(1, 9)).toBe(4);
    expect(weekBarHeight(9, 9)).toBe(30);
    expect(weekBarHeight(5, 9)).toBe(17);
    expect(weekBarHeight(3, 0)).toBe(0);
  });

  it("colonnes fines, jamais toute la largeur de la semaine", () => {
    const src = read("src/components/dashboard/week-scrubber.tsx");
    expect(src).toContain("max-w-[24px]");
    expect(src).not.toContain("const heightPct = 20 +");
  });
});
