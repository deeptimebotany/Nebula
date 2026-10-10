// Vitrine de Réussites (10/10/2026, retour de Lucas : « impossible de changer
// de badge dans la vitrine »). Vitrine pleine, les autres badges étaient
// grisés tant qu'on n'en retirait pas un. Maintenant : on touche une place,
// puis le badge qui la remplace ; aucun badge n'est grisé.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initialSlots, placeBadge } from "@/lib/reussites/showcase-slots";

describe("vitrine : changer de badge", () => {
  it("vitrine pleine : la dernière place est active, un nouveau badge la remplace", () => {
    const start = initialSlots(["a", "b", "c"], 3);
    expect(start).toEqual({ slots: ["a", "b", "c"], active: 2 });
    expect(placeBadge(start.slots, start.active, "d")).toEqual({ slots: ["a", "b", "d"], active: 2 });
  });
  it("place touchée dans la vitrine : c'est elle qui change", () => {
    const start = initialSlots(["a", "b", "c"], 3, 0);
    expect(start.active).toBe(0);
    expect(placeBadge(start.slots, start.active, "d").slots).toEqual(["d", "b", "c"]);
  });
  it("places libres remplies dans l'ordre ; un badge déjà choisi est retiré et libère sa place", () => {
    let s = initialSlots([], 3);
    expect(s).toEqual({ slots: [null, null, null], active: 0 });
    s = placeBadge(s.slots, s.active, "a");
    s = placeBadge(s.slots, s.active, "b");
    expect(s).toEqual({ slots: ["a", "b", null], active: 2 });
    s = placeBadge(s.slots, s.active, "a");
    expect(s).toEqual({ slots: [null, "b", null], active: 0 });
  });
  it("plus aucun badge grisé quand la vitrine est pleine ; chaque place de la vitrine s'ouvre sur elle-même", () => {
    const ui = readFileSync("src/components/reussites/showcase-section.tsx", "utf8");
    expect(ui).not.toContain("prev.length >= showcase.max ? prev");
    expect(ui).not.toContain("disabled={full || busy}");
    expect(ui).toContain("onClick={() => setEditing(i)}");
    expect(ui).toContain('aria-label={`${b.label} : changer ce badge`}');
    expect(ui).toContain('aria-label="Places de la vitrine"');
  });
});
