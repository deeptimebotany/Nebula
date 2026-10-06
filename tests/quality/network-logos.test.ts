// Logos officiels des réseaux (06/10/2026) : fichiers d'origine, utilisés
// seulement quand les règles du réseau le permettent à la taille affichée,
// jamais recolorés, jamais sur une page publicitaire.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NetworkBadge, NetworkTargetChip, NetworkTile } from "@/components/ui/network-badge";
import { OFFICIAL_NETWORK_LOGOS, officialNetworkLogo } from "@/components/ui/official-network-logos";
import { NETWORKS, type Network } from "@/lib/types";

const read = (f: string) => readFileSync(f, "utf8");
const tile = (network: Network, size: number, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(NetworkTile, { network, size, ...extra }));

describe("logos officiels des réseaux : fichiers", () => {
  it("chaque fichier existe ; les SVG de Threads sont ceux du kit Meta, intacts et sans script", () => {
    for (const logo of Object.values(OFFICIAL_NETWORK_LOGOS)) {
      expect(existsSync(`public${logo!.light}`), logo!.light).toBe(true);
      if (logo!.dark) expect(existsSync(`public${logo!.dark}`), logo!.dark).toBe(true);
    }
    const hash = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 16);
    // « Threads-Brand-Resource-Center.zip », dossiers 02 Black/Logo et 01 White/Logo.
    expect(hash("public/brands/threads/threads-black.svg")).toBe("82b6bfe6c7f21bec");
    expect(hash("public/brands/threads/threads-white.svg")).toBe("2d569c12fb51499e");
    for (const f of ["threads-black", "threads-white"]) expect(read(`public/brands/threads/${f}.svg`)).not.toMatch(/<script|onload=|javascript:/i);
  });

  it("jamais TikTok ni Pinterest (pas d'autorisation pour une application) ; YouTube garde le dessin (icône obligatoirement cliquable)", () => {
    for (const network of ["TIKTOK", "PINTEREST", "YOUTUBE"] as const) {
      expect(OFFICIAL_NETWORK_LOGOS[network]).toBeUndefined();
      for (const size of [16, 22, 36]) expect(tile(network, size, { roomy: true })).not.toContain("<img");
    }
  });
});

describe("logos officiels des réseaux : tailles et règles", () => {
  it("Facebook, Threads et Bluesky dès 16 px ; LinkedIn à partir de 25 px (21 px de [in]) ; Instagram 29 px avec espace garanti", () => {
    expect(tile("THREADS", 16)).toContain("/brands/threads/threads-black.svg");
    expect(tile("FACEBOOK", 16)).toContain("/brands/facebook/facebook.png");
    expect(tile("BLUESKY", 16)).toContain("/brands/bluesky/bluesky.png");
    expect(tile("LINKEDIN", 22)).not.toContain("<img");
    expect(tile("LINKEDIN", 25)).toContain("/brands/linkedin/linkedin-bug.png");
    expect(tile("INSTAGRAM", 36)).not.toContain("<img");
    expect(tile("INSTAGRAM", 28, { roomy: true })).not.toContain("<img");
    expect(tile("INSTAGRAM", 30, { roomy: true })).toContain("/brands/instagram/instagram-glyph.png");
    expect(officialNetworkLogo("INSTAGRAM", 29, { roomy: true })).not.toBeNull();
  });

  it("Threads et LinkedIn : variante blanche en mode sombre, sans filtre", () => {
    for (const [network, size] of [["THREADS", 20], ["LINKEDIN", 30]] as const) {
      const html = tile(network, size);
      expect(html).toMatch(/class="[^"]*nb-on-light/);
      expect(html).toMatch(/class="nb-on-dark/);
    }
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.nb-on-light \{\s*display: none;/);
    expect(css).toMatch(/\[data-mode="light"\] \.nb-on-dark \{\s*display: none;/);
  });

  it("jamais en gris ni transparent : un réseau « éteint » reprend le dessin", () => {
    for (const network of NETWORKS) {
      const muted = tile(network, 36, { muted: true, roomy: true });
      expect(muted).not.toContain("<img");
      expect(muted).toContain("grayscale");
      const html = tile(network, 36, { roomy: true });
      if (html.includes("<img")) expect(html).not.toMatch(/grayscale|opacity-/);
    }
    expect(renderToStaticMarkup(createElement(NetworkBadge, { network: "THREADS", size: "sm", muted: true }))).not.toContain("<img");
    expect(renderToStaticMarkup(createElement(NetworkTargetChip, { network: "BLUESKY", state: "connect" }))).not.toContain("opacity-");
    expect(read("src/app/(dashboard)/media-kit/page.tsx")).toContain("muted={off}");
  });
});

describe("logos officiels des réseaux : où", () => {
  it("Instagram seulement là où l'espace vide est garanti (comptes, media kit)", () => {
    const accounts = read("src/app/(dashboard)/accounts/page.tsx");
    expect(accounts).toMatch(/gap-4 font-display[^>]*>\s*<NetworkTile network=\{provider\.networks\[0\]\} size=\{30\} roomy \/>/);
    const kit = read("src/components/media-kit/kit-view.tsx");
    expect(kit).toMatch(/gap-\[18px\]">\s*<NetworkTile network=\{account\.network\} size=\{36\} roomy/);
  });

  it("jamais sur une page publicitaire : la page d'accueil et l'exemple de media kit gardent les dessins", () => {
    expect(read("src/app/decouvrir/media-kit/page.tsx")).toContain("<KitView data={EXAMPLE} nested drawnLogos />");
    expect(tile("THREADS", 20, { drawn: true })).not.toContain("<img");
    expect(renderToStaticMarkup(createElement(NetworkBadge, { network: "BLUESKY", size: "sm", drawn: true }))).not.toContain("<img");
    for (const f of ["src/components/marketing/hero.tsx", "src/app/reseaux/page.tsx"]) expect(read(f)).not.toMatch(/<NetworkTile|<NetworkBadge/);
  });
});
