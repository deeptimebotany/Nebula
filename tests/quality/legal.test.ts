// Mentions légales (29/09/2026) : numéros d'immatriculation cohérents et
// sans faute de frappe, page complète (plus aucun « en cours
// d'immatriculation »).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_LEGAL, formatSiren, isValidSirenOrSiret } from "@/lib/site";

describe("identité légale de l'éditeur", () => {
  it("SIREN et SIRET valides (clé de Luhn) et cohérents", () => {
    expect(isValidSirenOrSiret(SITE_LEGAL.siren)).toBe(true);
    expect(isValidSirenOrSiret(SITE_LEGAL.siret)).toBe(true);
    expect(SITE_LEGAL.siret.startsWith(SITE_LEGAL.siren)).toBe(true);
    // Une faute d'un chiffre est détectée.
    expect(isValidSirenOrSiret("130498752")).toBe(false);
    expect(isValidSirenOrSiret("12345")).toBe(false);
  });

  it("affichage groupé par trois", () => {
    expect(formatSiren("130498751")).toBe("130 498 751");
    expect(formatSiren("13049875100010")).toBe("130 498 751 00010");
  });

  it("toutes les mentions obligatoires sont renseignées", () => {
    for (const key of ["publisherName", "publisherForm", "siren", "siret", "address", "publicationDirector", "apeCode"] as const) {
      expect(SITE_LEGAL[key], key).not.toBe("");
    }
    const page = readFileSync(path.resolve(__dirname, "../../src/app/legal/page.tsx"), "utf8");
    expect(page).toMatch(/formatSiren\(SITE_LEGAL\.siret\)/);
    expect(page).toMatch(/Activité \(code APE\)/);
  });
});
