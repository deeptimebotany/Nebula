// Accueil refait le 29/09/2026 : de vraies captures de l'application, en
// clair et en sombre, présentes pour chaque écran utilisé ; plus aucun
// ancien « faux écran » dessiné à la main.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allScreenFiles } from "@/components/marketing/product-shot";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("captures de l'application", () => {
  it("chaque capture existe en clair et en sombre, aux deux tailles", () => {
    const missing = allScreenFiles().filter((src) => !existsSync(path.join(ROOT, "public", src)));
    expect(missing).toEqual([]);
  });

  it("aucune image orpheline ni trop lourde dans public/screens", () => {
    const expected = new Set(allScreenFiles().map((src) => path.basename(src)));
    const files = readdirSync(path.join(ROOT, "public/screens"));
    expect(files.filter((f) => !expected.has(f))).toEqual([]);
    for (const f of files) {
      const size = readFileSync(path.join(ROOT, "public/screens", f)).length;
      expect(size, f).toBeLessThan(260_000);
    }
  });

  it("l'accueil et les pages « Découvrir » montrent les vraies captures", () => {
    for (const file of ["src/components/marketing/hero.tsx", "src/app/page.tsx", "src/app/decouvrir/page-bio/page.tsx", "src/app/decouvrir/rapports-clients/page.tsx"]) {
      expect(read(file), file).toMatch(/ProductShot|PhoneShot/);
    }
    expect(existsSync(path.join(ROOT, "src/components/marketing/product-visuals.tsx"))).toBe(false);
  });

  it("le compte de démonstration ne s'installe jamais sur une vraie base", async () => {
    const { assertDemoDatabase } = await import("../../scripts/demo/seed-demo");
    expect(() => assertDemoDatabase("postgresql://user:pw@ep-cool-123.eu-central-1.aws.neon.tech/neondb")).toThrow(/Refusé/);
    expect(() => assertDemoDatabase("postgresql://postgres@localhost:5432/nebula")).toThrow(/Refusé/);
    expect(() => assertDemoDatabase("postgresql://postgres@db.example.com:5432/nebula_demo")).toThrow(/Refusé/);
    expect(() => assertDemoDatabase(undefined)).toThrow();
    expect(() => assertDemoDatabase("postgresql://postgres@localhost:5432/nebula_demo")).not.toThrow();
  });
});
