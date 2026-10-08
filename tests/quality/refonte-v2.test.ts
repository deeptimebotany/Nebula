// Refonte V2 (07/10/2026, maquettes A à E de Lucas) : barre latérale en
// catégories repliables, compte dans le menu du profil, fond uni sans
// cartes, titres de section sans numéro, Publier en document fluide.
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn() }) }));

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ACCOUNT_NAV_ITEMS, ALL_NAV_ITEMS, NAV_GROUPS, OWNER_MENU_FEATURED, OWNER_NAV_ITEMS, navGroupKeyFor } from "@/components/dashboard/navigation";
import { initialsOf } from "@/components/dashboard/profile-menu";
import { formatSlotLabel, nextBestSlot } from "@/components/composer/publish-card";
import { PageHeader } from "@/components/ui/page-header";
import { InShellContext } from "@/components/dashboard/shell-context";
import { UI_PREF_KEYS } from "@/lib/ui-prefs";

const read = (f: string) => readFileSync(f, "utf8");

describe("barre latérale : « Vue d'ensemble » puis cinq catégories repliables", () => {
  it("catégories et pages dans l'ordre des maquettes", () => {
    expect(NAV_GROUPS.map((g) => g.label ?? null)).toEqual([null, "Créer", "Analyser", "Présence", "Clients", "Communauté"]);
    expect(NAV_GROUPS[0].items.map((i) => i.href)).toEqual(["/dashboard"]);
    expect(NAV_GROUPS[1].items.map((i) => i.label)).toEqual(["Publier", "Studio IA", "Publications", "Calendrier"]);
  });
  it("le compte n'est plus dans la barre latérale, mais reste dans la palette et le fil d'Ariane", () => {
    const sidebar = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const item of ACCOUNT_NAV_ITEMS) {
      expect(sidebar).not.toContain(item.href);
      expect(ALL_NAV_ITEMS.map((i) => i.href)).toContain(item.href);
    }
    expect(ACCOUNT_NAV_ITEMS.map((i) => i.label)).toEqual(["Paramètres", "Facturation", "Automatisations", "Soutenir Nebula"]);
    expect(read("src/components/dashboard/command-palette.tsx")).toContain("...ACCOUNT_NAV_ITEMS");
  });
  it("la catégorie de la page ouverte se déplie d'office (pages secondaires comprises)", () => {
    expect(navGroupKeyFor("/composer")).toBe("creer");
    expect(navGroupKeyFor("/posts/abc")).toBe("creer");
    expect(navGroupKeyFor("/tools/taux-engagement")).toBe("analyser");
    expect(navGroupKeyFor("/reussites")).toBe("communaute");
    expect(navGroupKeyFor("/settings")).toBeNull();
  });
  it("mode réduit : icônes avec infobulle, état mémorisé ; catégories ouvertes mémorisées", () => {
    const sidebar = read("src/components/dashboard/sidebar-nav.tsx");
    expect(sidebar).toContain('role="tooltip"');
    expect(sidebar).toContain('"Réduire le menu"');
    expect(sidebar).toContain("aria-expanded={open}");
    expect(UI_PREF_KEYS).toEqual(expect.arrayContaining(["nebula:sidebar-collapsed", "nebula:nav-groups-open", "nebula:composer-preview-hidden"]));
    expect(read("src/components/dashboard/app-shell.tsx")).toMatch(/window\.innerWidth < 1360/);
  });
});

describe("menu du profil (en haut à droite)", () => {
  it("compte, administration mise en avant, marque, déconnexion", () => {
    const menu = read("src/components/dashboard/profile-menu.tsx");
    for (const label of ["Mon profil", "Administration", "Toute l&apos;administration", "Changer de marque", "Changer de compte", "Se déconnecter", "Apparence"]) expect(menu).toContain(label);
    expect(OWNER_MENU_FEATURED.every((href) => OWNER_NAV_ITEMS.some((i) => i.href === href))).toBe(true);
    // Les easter eggs du menu latéral ont suivi : version, mode clair/sombre, double-clic sur l'avatar.
    for (const egg of ["version-click", "theme-toggle-10x", "avatar-double-tap"]) expect(menu).toContain(`"${egg}"`);
  });
  it("initiales de l'avatar", () => {
    expect(initialsOf("Inès Martin")).toBe("IM");
    expect(initialsOf("Camille")).toBe("CA");
    expect(initialsOf("", "lucas@example.com")).toBe("LU");
  });
});

describe("fond uni, blocs sans cadre, titres sans numéro", () => {
  const css = read("src/app/globals.css");
  it("gris très clair #F9FAFB en clair, noir neutre en sombre, fond par défaut vraiment uni", () => {
    expect(css).toContain("--l-page: #f9fafb;");
    expect(css).toMatch(/:root \{\n {2}--nb-page: #0e0e10;/);
    expect(read("src/lib/backgrounds.ts")).toContain('def("mesh", "Uni (défaut)", ({ i }) => i.BASE)');
  });
  it("les blocs du contenu perdent cadre et ombre, un trait fin les sépare", () => {
    expect(css).toMatch(/\.nb-main \.glass-panel:not\(:where\([^)]*\)\) \{\n {2}background: transparent;\n {2}border: 0;\n {2}border-top: 1px solid var\(--nb-sep\);/);
    expect(css).toMatch(/text-transform: uppercase;/);
    expect(read("src/components/dashboard/app-shell.tsx")).toContain('className="nb-main noise-grid');
  });
  it("Publier : plus d'étapes numérotées", () => {
    const composer = read("src/app/(dashboard)/composer/page.tsx");
    expect(composer).not.toMatch(/>[1-5]\. (Média|Titre|Description|Réseaux|Publication)</);
    for (const label of ["Média", "Texte", "Publier sur"]) expect(composer).toContain(`\n              ${label}\n`);
    expect(read("src/components/composer/publish-card.tsx")).toContain("Quand");
  });
});

describe("titre de la page dans la barre du haut", () => {
  it("dans l'application, jamais dans la page (pas de saut à l'hydratation)", () => {
    const html = renderToStaticMarkup(createElement(InShellContext.Provider, { value: true }, createElement(PageHeader, { title: "Analytics", description: "Vos chiffres" })));
    expect(html).not.toContain("<h1");
    expect(html).toContain("Vos chiffres");
  });
  it("hors de l'application : titre dans la page, comme avant", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { title: "Analytics" }));
    expect(html).toMatch(/<h1[^>]*>.*Analytics/);
  });
});

describe("Publier : « Quand »", () => {
  it("date lisible : « Vendredi 9 octobre, 18 h 30 »", () => {
    expect(formatSlotLabel("2026-10-09T18:30")).toBe("Vendredi 9 octobre, 18 h 30");
    expect(formatSlotLabel("2026-10-11T09:00")).toBe("Dimanche 11 octobre, 9 h");
  });
  it("meilleur créneau : aujourd'hui s'il reste au moins 30 min, sinon demain, dans le fuseau de la marque", () => {
    // 07/10/2026 à 14 h à Paris (12 h UTC).
    const now = new Date("2026-10-07T12:00:00Z");
    expect(nextBestSlot(18, "Europe/Paris", now)).toBe("2026-10-07T18:00");
    expect(nextBestSlot(14, "Europe/Paris", now)).toBe("2026-10-08T14:00");
    // Montréal : il est 8 h.
    expect(nextBestSlot(9, "America/Montreal", now)).toBe("2026-10-07T09:00");
  });
});

describe("site public : même langage que l'application (08/10/2026)", () => {
  const css = read("src/app/globals.css");
  it("les pages publiques portent .nb-site, qui aplatit les blocs comme .nb-main", () => {
    for (const f of ["src/app/page.tsx", "src/components/marketing/public-shell.tsx", "src/components/auth/auth-shell.tsx", "src/app/outils/page.tsx", "src/components/tools/tool-page.tsx", "src/app/audit/[token]/page.tsx"]) {
      expect(read(f), f).toMatch(/<main id="contenu" className="nb-site /);
    }
    expect(css).toMatch(/\.nb-site \.glass-panel:not\(:where\([^)]*\.nb-own-design \*\)\),\n\.nb-main \.glass-panel/);
    expect(css).toContain(".nb-eyebrow {");
  });
  it("plus d'étoiles, de halos ni de dégradé animé sur le site", () => {
    for (const f of ["src/app/page.tsx", "src/components/marketing/hero.tsx", "src/components/marketing/public-shell.tsx", "src/components/auth/auth-shell.tsx", "src/app/outils/page.tsx", "src/components/tools/tool-page.tsx", "src/app/bientot/page.tsx"]) {
      expect(read(f), f).not.toMatch(/hero-orb|hero-stars|bg-nebula-mesh|text-gradient-live/);
    }
  });
  it("les pages partagées avec des tiers gardent leur dessin", () => {
    expect(read("src/app/kit/[slug]/page.tsx")).not.toContain("nb-site");
    expect(read("src/app/rapport/[token]/rapport-client.tsx")).not.toContain("nb-site");
    expect(read("src/app/decouvrir/media-kit/page.tsx")).toContain("nb-own-design");
  });
  it("captures du site : la nouvelle page Publier, sans messages passagers", () => {
    const script = read("scripts/demo/capture-screens.mjs");
    expect(script).toContain("textarea[aria-label^='Titre de la publication']");
    expect(script).toContain(".nb-toasts { display: none !important; }");
    expect(read("src/components/dashboard/toast.tsx")).toContain('className="nb-toasts ');
  });
});

describe("accueil : la V2 en vedette (08/10/2026)", () => {
  it("Publier en grand, l'application sur téléphone, et une capture mobile en clair et en sombre", () => {
    const hero = read("src/components/marketing/hero.tsx");
    expect(hero).toContain('name="publier"');
    expect(hero).toContain('name="tableau-de-bord-mobile"');
    expect(hero).toContain("Une interface entièrement repensée");
    expect(read("scripts/demo/capture-screens.mjs")).toContain('name: "tableau-de-bord-mobile"');
  });
  it("la zone d'import ne promet pas de carrousel : un nouveau fichier remplace le précédent", () => {
    const composer = read("src/app/(dashboard)/composer/page.tsx");
    expect(composer).not.toContain("plusieurs images font un carrousel");
    expect(composer).toContain('"Changer de média"');
  });
});
