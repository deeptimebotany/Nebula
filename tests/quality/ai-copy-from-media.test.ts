import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// « Rédiger avec l'IA » dans Publier (09/10/2026, demande de Lucas) : l'IA
// analyse d'abord le média (la vidéo entière, image et son ; ou l'image),
// puis écrit le titre ou la description à partir de ce qu'elle a vu ; sans
// média, un message demande d'importer une image ou une vidéo.
const read = (p: string) => readFileSync(p, "utf8");

describe("Rédiger avec l'IA à partir du média", () => {
  const composer = read("src/app/(dashboard)/composer/page.tsx");
  it("sans média : message, boutons désactivés, aucun appel à l'IA", () => {
    expect(composer).toContain("Importez d'abord une image ou une vidéo : l'IA l'analyse pour trouver le titre et la description.");
    expect(composer).toContain('data-testid="ai-needs-media"');
    expect(composer).toContain("disabled={generatingAll || assets.length === 0}");
    expect(composer).toMatch(/if \(assets\.length === 0\) \{\s*toast\.info\(AI_NEEDS_MEDIA\);\s*return "";/);
  });
  it("vidéo : analysée une fois (titre et description partagent l'analyse), résumé joint à la rédaction", () => {
    expect(composer).toContain("/api/media/${asset.id}/copy-analysis");
    expect(composer).toContain("if (videoBriefRef.current?.assetId === videoAsset.id) return videoBriefRef.current.promise;");
    expect(composer).toContain("mediaBrief: brief ?? undefined");
    expect(composer).toContain('analyzingMedia ? "Analyse de la vidéo…"');
    expect(read("src/app/api/ai/generate-copy/route.ts")).toContain("mediaBrief: z.string().max(3_000).optional()");
  });
  it("route d'analyse : propriétaire du média, vidéo seulement, porte de l'IA sans réservation, rafale bornée", () => {
    const route = read("src/app/api/media/[id]/copy-analysis/route.ts");
    expect(route).toContain("brand: ownedBy(userId)");
    expect(route).toContain('if (asset.type !== "VIDEO")');
    expect(route).toContain('gateAppAi({ userId, brandId: asset.brandId, kind: "text" })');
    expect(route).toContain("await gate.allowance.release();");
    expect(route).toContain('consumeRateLimit("copy-analyze", userId, ANALYZE_LIMIT, ANALYZE_WINDOW_MINUTES)');
    expect(route).toContain("export const maxDuration = 300;");
  });
});
