// Format de la publication (07/10/2026) : choisi dans Publier, vérifié,
// envoyé, et montré tel quel dans l'aperçu.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { FORMAT_NETWORKS, formatOptions } from "@/lib/social/post-format";

const read = (p: string) => readFileSync(path.join(__dirname, "../..", p), "utf8");

describe("format de la publication", () => {
  it("Instagram et Facebook proposent Publication, Reel et Story ; les autres réseaux n'ont pas de choix", () => {
    expect([...FORMAT_NETWORKS].sort()).toEqual(["FACEBOOK", "INSTAGRAM"]);
    for (const n of ["INSTAGRAM", "FACEBOOK"] as const) expect(formatOptions(n, { type: "VIDEO", count: 1 }).map((o) => o.label)).toEqual(["Publication", "Reel", "Story"]);
    for (const n of ["TIKTOK", "YOUTUBE", "PINTEREST", "THREADS", "LINKEDIN", "BLUESKY"] as const) expect(formatOptions(n, { type: "VIDEO", count: 1 })).toEqual([]);
  });

  it("Publier : sélecteur dans chaque réseau, format envoyé, publication bloquée si impossible, aperçu au format choisi", () => {
    const composer = read("src/app/(dashboard)/composer/page.tsx");
    expect(composer).toContain("<FormatPicker");
    expect(composer).toMatch(/format: formatFor\(network\)/);
    expect(composer).toMatch(/const publishBlocked = tiktokBlocked \?\? formatBlocked/);
    expect(composer).toMatch(/formatFor=\{assets\.length > 0 \? formatFor : undefined\}/);
    // Le format est lu au moment de l'envoi (dépendance du useCallback).
    expect(composer).toMatch(/\/\/ Format choisi \(07\/10\/2026\)\.\n\s+formatFor,/);
    const preview = read("src/components/composer/preview-network-ui.tsx");
    expect(preview).toContain('data-preview-format="story"');
    expect(preview).toContain('data-preview-format="reel"');
  });

  it("la création vérifie le format, et la duplication le garde", () => {
    expect(read("src/lib/posts/create-post.ts")).toMatch(/reason: "post_format"/);
    expect(read("src/app/api/posts/[id]/route.ts")).toMatch(/metadata: t\.metadata \?\? undefined/);
  });
});
