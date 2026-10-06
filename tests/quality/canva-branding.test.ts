// Revue de l'app Canva (06/10/2026) : logo officiel de Canva (jamais un
// glyphe maison), 8 px de marge autour de lui, bouton de connexion avec le
// texte de l'action, compte connecté affiché avec « Déconnecter Canva ».
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportSourceBadge } from "@/components/media-import/import-source-badge";
import { SourceIcon } from "@/components/media-import/source-icon";
import { CANVA_ICON_SRC } from "@/components/media-import/canva-icon";
import { BRAND_LOGOS } from "@/components/media-import/brand-logo";
import { existsSync } from "node:fs";

const read = (f: string) => readFileSync(f, "utf8");

describe("Canva : logo officiel", () => {
  it("le fichier est celui du kit officiel, intact et sans script", () => {
    const svg = readFileSync("public/brands/canva/canva-icon.svg");
    expect(CANVA_ICON_SRC).toBe("/brands/canva/canva-icon.svg");
    // « Canva Icon logo.svg » de https://www.canva.dev/assets/connect/Canva-logos.zip
    expect(createHash("sha256").update(svg).digest("hex").slice(0, 16)).toBe("fbbd91cfb0dcc0f9");
    expect(svg.toString()).not.toMatch(/<script|onload=|javascript:/i);
  });

  it("partout où Canva a une icône, c'est le logo officiel", () => {
    expect(renderToStaticMarkup(createElement(SourceIcon, { id: "canva", className: "h-4 w-4" }))).toContain('src="/brands/canva/canva-icon.svg"');
    expect(read("src/components/media-import/source-icon.tsx")).not.toContain("M15.5 9.5a4 4 0 1 0 0 5");
    // Pastille : 8 px autour du logo ; ligne de texte : le texte seul.
    const pill = renderToStaticMarkup(createElement(ImportSourceBadge, { source: "canva", type: "IMAGE" }));
    expect(pill).toContain("canva-icon.svg");
    expect(pill).toMatch(/py-2 pl-2/);
    const inline = renderToStaticMarkup(createElement(ImportSourceBadge, { source: "canva", type: "IMAGE", variant: "inline" }));
    expect(inline).not.toContain("<img");
    expect(inline).toContain("Canva");
  });

  it("bouton de connexion, barre « Importer depuis » et compte connecté", () => {
    const dialogs = read("src/components/composer/media-import/import-dialogs.tsx");
    expect(dialogs).toMatch(/<CanvaIcon size=\{24\} \/>\s*Connecter mon compte Canva/);
    expect(dialogs).toContain("py-2 pl-2 pr-4");
    expect(dialogs).toContain("Compte Canva connecté");
    expect(dialogs).toContain('"Déconnecter Canva"');
    expect(dialogs).not.toContain("Délier Canva");
    expect(read("src/components/composer/media-import/media-import-bar.tsx")).toContain("gap-2 rounded-full border py-2 pl-2 pr-3");
  });
});

describe("logos officiels des autres sources (06/10/2026)", () => {
  it("Google Drive, Dropbox et Unsplash : fichiers présents, affichés dans l'application seulement", () => {
    for (const logo of Object.values(BRAND_LOGOS)) expect(existsSync(`public${logo.src}`), logo.src).toBe(true);
    for (const id of ["gdrive", "dropbox", "unsplash"] as const) {
      expect(renderToStaticMarkup(createElement(SourceIcon, { id, brand: true }))).toContain(`src="${BRAND_LOGOS[id].src}"`);
      // Sans `brand` (page d'accueil publique) : le dessin, jamais le logo.
      expect(renderToStaticMarkup(createElement(SourceIcon, { id }))).toContain("<svg");
    }
    // Microsoft n'autorise pas ses logos sans licence : OneDrive garde son dessin.
    expect(renderToStaticMarkup(createElement(SourceIcon, { id: "onedrive", brand: true }))).toContain("<svg");
    expect(renderToStaticMarkup(createElement(SourceIcon, { id: "unsplash", brand: true }))).toContain("nb-logo-mono");
    expect(read("src/components/marketing/hero.tsx")).not.toMatch(/<SourceIcon[^>]*\bbrand\b/);
  });

  it("barre « Importer depuis » : logos officiels et infobulle de l'action ; mention « Importé depuis » : logo en pastille, texte seul en ligne", () => {
    const bar = read("src/components/composer/media-import/media-import-bar.tsx");
    expect(bar).toContain("<SourceIcon id={id} brand />");
    expect(bar).toContain("title={`Importer depuis ${LABELS[id]}`}");
    const pill = renderToStaticMarkup(createElement(ImportSourceBadge, { source: "gdrive", type: "VIDEO" }));
    expect(pill).toContain("/brands/google-drive/google-drive.png");
    expect(pill).toContain("Google Drive");
    expect(renderToStaticMarkup(createElement(ImportSourceBadge, { source: "dropbox", type: "IMAGE", variant: "inline" }))).not.toMatch(/<img|<svg/);
  });
});
