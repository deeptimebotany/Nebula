// Graduations compactes des axes de valeurs (30/09/2026) : voir
// src/lib/chart-format.ts.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { axisTick } from "@/lib/chart-format";

const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("graduations des axes", () => {
  it("abrège les grands nombres, garde les petits", () => {
    expect(norm(axisTick(0))).toBe("0");
    expect(norm(axisTick(850))).toBe("850");
    expect(norm(axisTick(20000))).toBe("20 k");
    expect(norm(axisTick(12500))).toBe("12,5 k");
    expect(norm(axisTick(1_250_000))).toBe("1,3 M");
    expect(axisTick("abc")).toBe("abc");
  });

  it("les courbes d'abonnés l'utilisent (plus de chiffres coupés sur mobile)", () => {
    for (const file of ["src/components/charts/growth-chart-impl.tsx", "src/components/charts/followers-area-chart.tsx"]) {
      expect(readFileSync(path.join(process.cwd(), file), "utf8"), file).toMatch(/<YAxis[^>]*tickFormatter=\{axisTick\}/);
    }
  });
});
