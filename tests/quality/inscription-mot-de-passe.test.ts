// Inscription (09/10/2026, demande de Lucas) : le mot de passe est tapé deux
// fois, et le compte n'est pas créé si les deux ne correspondent pas.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const form = readFileSync("src/components/auth/register-form.tsx", "utf8");

describe("inscription : mot de passe tapé deux fois", () => {
  it("un second champ « Confirmez le mot de passe » suit le mot de passe", () => {
    expect(form).toContain('label="Confirmez le mot de passe"');
    expect(form).toContain('id="register-password-confirm"');
    expect(form.indexOf('id="register-password"')).toBeLessThan(form.indexOf('id="register-password-confirm"'));
  });
  it("les deux doivent être identiques avant l'envoi au serveur", () => {
    expect(form).toContain('else if (form.passwordConfirm !== form.password) next.passwordConfirm = "Les deux mots de passe ne correspondent pas.";');
    expect(form).toMatch(/if \(!validate\(\)\) return;[\s\S]*fetch\("\/api\/auth\/register"/);
    // Seul le mot de passe part au serveur, pas la confirmation.
    expect(form).not.toMatch(/passwordConfirm: form\.passwordConfirm/);
  });
});
