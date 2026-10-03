// « Importé depuis Canva » (03/10/2026) : chaque plateforme d'import a sa
// mention, affichée dans Publier, sur la page d'une publication et dans la
// liste des publications ; rien pour un envoi depuis l'appareil ou l'API.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIA_SOURCE_ORDER, importedFromText, mediaImportSource } from "@/lib/media-sources";

const ROOT = path.resolve(__dirname, "../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("origine des médias importés", () => {
  it("une mention par plateforme, rien pour l'appareil ou l'API", () => {
    expect(MEDIA_SOURCE_ORDER.map((s) => importedFromText(s, "IMAGE"))).toEqual([
      "Image importée depuis Google Drive",
      "Image importée depuis Dropbox",
      "Image importée depuis OneDrive",
      "Image importée depuis Canva",
      "Image importée depuis Unsplash"
    ]);
    expect(importedFromText("canva", "VIDEO")).toBe("Vidéo importée depuis Canva");
    expect(importedFromText("dropbox")).toBe("Importé depuis Dropbox");
    expect([mediaImportSource(null), mediaImportSource(undefined), mediaImportSource("api"), mediaImportSource("autre")]).toEqual([null, null, null, null]);
    expect(mediaImportSource("canva")).toBe("canva");
  });

  it("chaque import enregistre sa plateforme (MediaAsset.importSource)", () => {
    const routes = read("src/app/api/media/import/route.ts");
    for (const s of ["gdrive", "dropbox", "onedrive", "unsplash"]) expect(routes).toMatch(new RegExp(`storeDownloadedMedia\\([^;]*"${s}"\\)`));
    expect(read("src/app/api/integrations/canva/import/route.ts")).toMatch(/storeDownloadedMedia\([^;]*"canva"\)/);
  });

  it("mention affichée dans Publier, sur la publication et dans la liste", () => {
    const composer = read("src/app/(dashboard)/composer/page.tsx");
    expect(composer).toContain("<ImportSourceBadge source={a.importSource}");
    expect(composer).toContain("importSource: extra?.source ?? null");
    expect(composer).toContain("importSource: m.mediaAsset.importSource ?? null");
    expect(composer).toContain("importSourceFrom: original.id");
    expect(read("src/app/(dashboard)/posts/[id]/page.tsx")).toContain("<ImportSourceBadge source={thumbAsset.mediaAsset.importSource}");
    expect(read("src/app/(dashboard)/publications/page.tsx")).toContain("<ImportSourceBadge source={first?.importSource}");
  });
});
