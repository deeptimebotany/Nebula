// Accueil, 02/10/2026 : Pinterest ouvert (connexion officielle), import
// direct des médias (seulement les sources réellement ouvertes) et page
// « Soutenir Nebula » allégée.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LAUNCHED_NETWORKS, OAUTH_LAUNCHED_NETWORKS, networksSentence } from "@/lib/types";
import { UPCOMING_NETWORKS } from "@/data/competitors";
import { configuredMediaSources } from "@/lib/integrations/config";
import { DEMO_LEGENDES_BY_NETWORK } from "@/lib/tools/demo";
import { SITE_DESCRIPTION } from "@/lib/site";

const ROOT = path.resolve(__dirname, "../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const KEYS = ["GOOGLE_PICKER_API_KEY", "GOOGLE_PICKER_CLIENT_ID", "GOOGLE_PICKER_APP_ID", "GOOGLE_CLIENT_ID", "DROPBOX_APP_KEY", "ONEDRIVE_CLIENT_ID", "ONEDRIVE_CLIENT_SECRET", "UNSPLASH_ACCESS_KEY", "CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"];
const saved: Record<string, string | undefined> = {};

describe("Pinterest, connexion officielle", () => {
  it("ouvert partout, plus en liste d'attente, ancienne page redirigée", async () => {
    expect(LAUNCHED_NETWORKS).toContain("PINTEREST");
    expect(OAUTH_LAUNCHED_NETWORKS).toContain("PINTEREST");
    expect(OAUTH_LAUNCHED_NETWORKS).not.toContain("BLUESKY");
    expect(UPCOMING_NETWORKS.map((n) => n.slug)).not.toContain("pinterest");
    const config = createRequire(import.meta.url)(path.join(ROOT, "next.config.js")) as { redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]> };
    expect((await config.redirects()).find((r) => r.source === "/reseaux/pinterest")).toMatchObject({ destination: "/reseaux", permanent: true });
    expect(DEMO_LEGENDES_BY_NETWORK.PINTEREST.description.length).toBeLessThanOrEqual(500);
  });

  it("les listes de réseaux viennent de LAUNCHED_NETWORKS, jamais écrites à la main", () => {
    expect(networksSentence()).toBe("Instagram, Facebook, TikTok, YouTube, Bluesky et Pinterest");
    expect(networksSentence(OAUTH_LAUNCHED_NETWORKS, "ou")).toBe("Instagram, Facebook, TikTok, YouTube ou Pinterest");
    expect(SITE_DESCRIPTION).toContain("Pinterest");
    for (const f of ["src/components/marketing/hero.tsx", "src/app/page.tsx", "src/lib/site.ts", "src/lib/seo.ts", "src/lib/seo-pages.ts", "src/app/securite/page.tsx", "src/app/legal/page.tsx", "src/app/decouvrir/media-kit/page.tsx"]) {
      expect(read(f), f).not.toMatch(/Instagram, (TikTok|Facebook), (YouTube|TikTok), (Facebook|YouTube) (et|ou) (Bluesky|YouTube)/);
    }
  });
});

describe("import direct des médias sur l'accueil", () => {
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("seulement les sources dont les clés sont renseignées, dans l'ordre d'affichage", () => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    expect(configuredMediaSources()).toEqual([]);
    process.env.UNSPLASH_ACCESS_KEY = "u";
    process.env.DROPBOX_APP_KEY = "d";
    expect(configuredMediaSources()).toEqual(["dropbox", "unsplash"]);
    Object.assign(process.env, { GOOGLE_PICKER_API_KEY: "k", GOOGLE_PICKER_CLIENT_ID: "c", GOOGLE_PICKER_APP_ID: "1", CANVA_CLIENT_ID: "c", CANVA_CLIENT_SECRET: "s", ONEDRIVE_CLIENT_ID: "o", ONEDRIVE_CLIENT_SECRET: "s" });
    expect(configuredMediaSources()).toEqual(["gdrive", "dropbox", "onedrive", "canva", "unsplash"]);
  });

  it("le bandeau est sur l'accueil et Google Photos n'est pas promis", () => {
    const hero = read("src/components/marketing/hero.tsx");
    expect(hero).toContain("<MediaSourcesStrip />");
    expect(hero).toContain("Importez vos photos et vidéos directement depuis");
    expect(hero).not.toMatch(/Google Photos/);
  });
});

describe("Soutenir Nebula", () => {
  it("les quatre éléments retirés n'y sont plus", () => {
    const page = read("src/app/(dashboard)/support/page.tsx");
    for (const t of ["Sous-titres automatiques des vidéos", "Un site plus rapide partout dans le monde", "Des serveurs plus puissants", "Plus d'espace pour vos vidéos"]) {
      expect(page).not.toContain(`title: "${t}"`);
    }
    expect(page).toContain('title: "Moins de bugs"');
  });
});
