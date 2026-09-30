// Variables d'environnement nettoyées (30/09/2026, erreur « client_key » de
// TikTok) : espaces, retours à la ligne et guillemets autour de la valeur.
import { describe, expect, it } from "vitest";
import { cleanEnvValue } from "@/lib/env-value";

describe("cleanEnvValue", () => {
  it("retire espaces, retours à la ligne et une paire de guillemets", () => {
    expect(cleanEnvValue("sbawxbk1yy7rf2k75i")).toBe("sbawxbk1yy7rf2k75i");
    expect(cleanEnvValue(" sbawxbk1yy7rf2k75i\n")).toBe("sbawxbk1yy7rf2k75i");
    expect(cleanEnvValue('"sbawxbk1yy7rf2k75i"')).toBe("sbawxbk1yy7rf2k75i");
    expect(cleanEnvValue("  'abc'  ")).toBe("abc");
    expect(cleanEnvValue('" abc "')).toBe("abc");
  });
  it("ne touche pas à l'intérieur de la valeur ; vide si absente", () => {
    expect(cleanEnvValue('a"b')).toBe('a"b');
    expect(cleanEnvValue('"abc')).toBe('"abc');
    expect(cleanEnvValue(undefined)).toBe("");
    expect(cleanEnvValue("   ")).toBe("");
    expect(cleanEnvValue('""')).toBe("");
  });
});
