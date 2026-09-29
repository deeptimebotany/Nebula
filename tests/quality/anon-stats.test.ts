// Statistiques de groupe anonymes (29/09/2026) : seuil de 20 comptes,
// masquage secondaire dans les parts, données propres à Nebula seulement.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANON_MIN_ACCOUNTS, aggregateAnonStats, countHashtags, hourBand, type AnonAccountRow, type AnonPostRow } from "@/lib/anon-stats/aggregate";

function post(owner: number, over: Partial<AnonPostRow> = {}): AnonPostRow {
  return { owner: `o${owner}`, networks: ["INSTAGRAM"], weekday: 1, hour: 18, format: "IMAGE", captionLength: 120, hashtagCount: 5, ...over };
}
const account = (owner: number, bio = false): AnonAccountRow => ({ owner: `o${owner}`, features: { page_bio: bio, media_kit: false, studio_ia: false, rapports_clients: false, calendrier_partage: false } });

describe("seuil d'anonymat", () => {
  it("moins de 20 comptes : aucun chiffre ; 20 comptes : des chiffres", () => {
    const few = Array.from({ length: ANON_MIN_ACCOUNTS - 1 }, (_, i) => post(i));
    expect(aggregateAnonStats(few, Array.from({ length: ANON_MIN_ACCOUNTS - 1 }, (_, i) => account(i)))).toEqual([]);
    const enough = Array.from({ length: ANON_MIN_ACCOUNTS }, (_, i) => post(i));
    const cells = aggregateAnonStats(enough, Array.from({ length: ANON_MIN_ACCOUNTS }, (_, i) => account(i, i < 5)));
    expect(cells.find((c) => c.metric === "publications.reseau" && c.dimension === "INSTAGRAM")).toMatchObject({ value: 100, sampleAccounts: 20 });
    expect(cells.find((c) => c.metric === "fonctions.adoption" && c.dimension === "page_bio")).toMatchObject({ value: 25, sampleAccounts: 20 });
    // Aucune valeur ne repose sur moins de 20 comptes.
    expect(cells.every((c) => c.sampleAccounts >= ANON_MIN_ACCOUNTS)).toBe(true);
  });

  it("beaucoup de publications d'un seul compte ne suffisent pas", () => {
    const one = Array.from({ length: 500 }, () => post(1));
    expect(aggregateAnonStats(one, [account(1)])).toEqual([]);
  });

  it("parts : une case sous le seuil n'est pas devinable par soustraction", () => {
    // 25 comptes sur Instagram, 21 sur YouTube, 3 seulement sur TikTok.
    const rows = [
      ...Array.from({ length: 25 }, (_, i) => post(i)),
      ...Array.from({ length: 21 }, (_, i) => post(i, { networks: ["YOUTUBE"], format: "VIDEO" })),
      ...Array.from({ length: 3 }, (_, i) => post(100 + i, { networks: ["TIKTOK"], format: "VIDEO" }))
    ];
    const shares = aggregateAnonStats(rows, []).filter((c) => c.metric === "publications.reseau");
    // TikTok masqué (3 comptes), et YouTube (la plus petite case restante) aussi.
    expect(shares.map((c) => c.dimension)).toEqual(["INSTAGRAM"]);
  });

  it("créneaux en tranches horaires, hashtags comptés", () => {
    expect([0, 5, 6, 8, 9, 12, 15, 18, 21, 23].map(hourBand)).toEqual(["0-6h", "0-6h", "6-9h", "6-9h", "9-12h", "12-15h", "15-18h", "18-21h", "21-24h", "21-24h"]);
    expect(countHashtags("Super #café #latte_art et #2026 mais pas un#faux")).toBe(3);
  });
});

describe("sources", () => {
  it("le calcul ne lit jamais les données reçues des API des réseaux", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/anon-stats/load.ts"), "utf8").replace(/\/\/.*$/gm, "");
    for (const table of ["postMetric", "analyticsSnapshot", "engagementItem", "videoInsight", "socialConnection", "accessToken"]) expect(src).not.toContain(table);
    // Seuls les comptes qui ont donné leur accord.
    expect(src).toContain("statsConsent: true");
  });
});
