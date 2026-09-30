// Easter eggs « à lire » (corrigés le 30/09/2026) : « Vu dans le code
// source » et « Message dans la console » ne sont plus accordés à la simple
// ouverture d'une page (ex. une page 404 juste après une inscription) : le
// commentaire caché et le message de la console donnent un code à taper dans
// la palette de commandes.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { SECRET_PHRASES, findEasterEgg, secretEggFor, sourceSecretComment } from "@/lib/easter-eggs-registry";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("easter eggs à lire", () => {
  it("codes reconnus sans tenir compte des accents, espaces, apostrophes ni majuscules", () => {
    expect(secretEggFor("poussière d'étoiles")).toBe("hidden-comment");
    expect(secretEggFor("  Poussiere D Etoiles ")).toBe("hidden-comment");
    expect(secretEggFor("HYPERESPACE")).toBe("console-signature");
    for (const other of ["", "   ", "nebula", "poussière", "étoiles"]) expect(secretEggFor(other)).toBeNull();
    for (const key of Object.keys(SECRET_PHRASES)) expect(findEasterEgg(key), key).toBeDefined();
  });

  it("le commentaire caché est un vrai commentaire HTML qui donne le code", () => {
    const comment = sourceSecretComment("Bonjour.");
    expect(comment.startsWith("<!-- ") && comment.endsWith(" -->")).toBe(true);
    expect(comment.slice(4, -3)).not.toContain("--");
    expect(comment).toContain(`« ${SECRET_PHRASES["hidden-comment"]} »`);
    expect(comment).toContain("Ctrl/Cmd+K");
  });

  it("plus jamais accordés à l'affichage d'une page", () => {
    for (const file of ["src/app/not-found.tsx", "src/app/(dashboard)/support/page.tsx"]) {
      const src = read(file);
      expect(src, file).not.toContain('reportEasterEggFound("hidden-comment")');
      expect(src, file).toContain("sourceSecretComment(");
    }
    const eggs = read("src/components/easter-eggs.tsx");
    expect(eggs).not.toContain('reportEasterEggFound("console-signature")');
    expect(eggs).toContain('SECRET_PHRASES["console-signature"]');
    expect(read("src/components/dashboard/command-palette.tsx")).toContain("secretEggFor(query)");
  });
});
