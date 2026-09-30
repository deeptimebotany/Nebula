// Rangées de pastilles de réseaux (30/09/2026) : sur un téléphone de 390 px,
// « Croissance des abonnés » (Accueil) et « Évolution des abonnés »
// (Analytics) affichaient 4 pastilles sur une seule ligne, sans retour à la
// ligne : la page faisait 465 px de large et tout l'écran apparaissait
// dézoomé. Toute rangée en flex qui liste des NetworkBadge doit pouvoir
// passer à la ligne.
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// <div className="…"> suivi directement de {liste.map((n) => (<NetworkBadge …
const ROW = /className="([^"]*)"[^>]*>\s*\{[\w.?]+\.map\(\(?\w+\)? => \(\s*<NetworkBadge\b/g;

describe("rangées de pastilles de réseaux sur mobile", () => {
  it("chaque rangée en flex passe à la ligne (flex-wrap)", () => {
    const rows: string[] = [];
    const offenders: string[] = [];
    for (const file of tsxFiles(path.join(process.cwd(), "src"))) {
      for (const m of readFileSync(file, "utf8").matchAll(ROW)) {
        const classes = m[1].split(/\s+/);
        if (!classes.includes("flex")) continue;
        rows.push(file);
        if (!classes.includes("flex-wrap")) offenders.push(`${path.relative(process.cwd(), file)} : ${m[1]}`);
      }
    }
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(offenders).toEqual([]);
  });
});
