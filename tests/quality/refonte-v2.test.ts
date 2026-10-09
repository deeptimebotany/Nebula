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

describe("ajustements V2 du 08/10/2026 (retours de Lucas sur le site de test)", () => {
  it("aperçu de Publier : le logo de chaque réseau dans les onglets, le nom pour les lecteurs d'écran", () => {
    const preview = read("src/components/composer/composer-preview.tsx");
    expect(preview).toContain('import { NetworkTile } from "@/components/ui/network-badge"');
    expect(preview).toContain('className={clsx("nb-preview-tab", active && "nb-preview-tab-active")}');
    expect(preview).toContain("aria-label={NETWORK_META[n].label}");
    expect(preview).toMatch(/nb-preview-tab-active"\)\}\s*>\s*<NetworkTile network=\{n\} size=\{22\} \/>/);
    expect(read("src/app/globals.css")).toContain(".nb-preview-tab-active::after { transform: scaleX(1); }");
  });
  it("zone d'import : tout le cadre ouvre le choix du fichier, sauf les boutons d'import", () => {
    const composer = read("src/app/(dashboard)/composer/page.tsx");
    expect(composer).toContain('data-testid="composer-dropzone"');
    expect(composer).toContain("if (!e.currentTarget.contains(target)) return;");
    expect(composer).toContain(`if (target.closest("button, a, input, label, select, textarea, [role='menu'], [role='dialog']")) return;`);
    expect(composer).toContain('dropActive && "nb-dropzone-active"');
  });
  it("menus déroulants : ouverture animée, survol violet, listes de choix aux couleurs de Nebula", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("@keyframes nb-pop-in");
    expect(css).toMatch(/\.nb-menu-item:hover,\s*\.nb-menu-item:focus-visible \{\s*background-color: rgb\(var\(--c-aurora-500\) \/ 0\.13\);/);
    expect(css).toContain("@supports (appearance: base-select)");
    expect(css).toContain("select.nb-select::picker-icon { display: none; }");
    expect(read("src/components/ui/input.tsx")).toContain('"nb-select appearance-none pr-9"');
    // Plus de liste noire à texte blanc imposée (illisible avec le mode clair).
    for (const f of ["src/components/ui/input.tsx", "src/components/ui/date-time-picker.tsx", "src/components/composer/tiktok-options.tsx", "src/app/(dashboard)/composer/page.tsx"]) {
      expect(read(f), f).not.toMatch(/\[&>option\]:bg-void|<option[^>]*bg-void/);
    }
    for (const f of ["src/components/dashboard/profile-menu.tsx", "src/components/dashboard/brand-switcher.tsx", "src/components/dashboard/account-switcher.tsx", "src/app/(dashboard)/composer/page.tsx"]) {
      expect(read(f), f).toContain("nb-menu-item");
    }
  });
  it("Réussites : la Voûte céleste couvre toute la largeur de la zone de contenu", () => {
    const overlay = read("src/components/cosmetics/decor-overlay.tsx");
    expect(overlay).toContain('document.getElementById("contenu")');
    expect(overlay).toContain("createPortal(");
    expect(overlay).toContain("absolute inset-0 z-[-1] overflow-hidden");
    expect(overlay).not.toContain("rounded-2xl");
    expect(read("src/components/dashboard/app-shell.tsx")).toContain('<main id="contenu"');
  });
  it("menu du profil : « Paramètres » en bas, entre « Changer de marque » et « Se déconnecter »", () => {
    const menu = read("src/components/dashboard/profile-menu.tsx");
    expect(menu).toContain("ACCOUNT_NAV_ITEMS.filter((item) => item.href !== SETTINGS_HREF).map(accountRow)");
    const brand = menu.indexOf("Changer de marque</span>");
    const settings = menu.indexOf("{settingsItem && accountRow(settingsItem)}");
    const logout = menu.indexOf("Se déconnecter</span>");
    expect(brand).toBeGreaterThan(0);
    expect(settings).toBeGreaterThan(brand);
    expect(logout).toBeGreaterThan(settings);
  });
});

describe("Son Pulsar des notifications (08/10/2026)", () => {
  it("joue le son fourni par Lucas, servi depuis le site, sans passer par le middleware", () => {
    const audio = read("src/lib/cosmic-audio.ts");
    expect(audio).toContain('export const PULSAR_SOUND_URL = "/sounds/notification-pulsar.mp3";');
    expect(audio).toContain("pulsarAudio.cloneNode(true)");
    expect(readFileSync("public/sounds/notification-pulsar.mp3").length).toBeGreaterThan(10_000);
    expect(read("src/middleware.ts")).toContain("webmanifest|mp3)$");
    expect(read("src/components/dashboard/toast.tsx")).toContain('hasCosmetic.current("son-pulsar")');
  });
});

describe("page bio : thème « Aube » refait en paysage « Crêtes » (08/10/2026)", () => {
  it("décor propre à Aube sur la vraie page et dans l'aperçu, couleurs à part", async () => {
    const { bioLook } = await import("@/lib/bio-look");
    expect(bioLook("aube")?.scenery).toBe("cretes");
    expect(bioLook("or-imperial")).toBeNull();
    expect(bioLook(null)).toBeNull();
    const pub = read("src/app/l/[slug]/link-in-bio-client.tsx");
    expect(pub).toContain('{look?.scenery === "cretes" && <AubeScenery className="fixed inset-0" style={{ zIndex: -1 }} />}');
    expect(pub).toContain("style={look?.name}");
    const editor = read("src/app/(dashboard)/link-in-bio/page.tsx");
    expect(editor).toContain('<AubeScenery className="bf-layer inset-0" style={{ zIndex: -1, borderRadius: "inherit" }} />');
    expect(editor).toContain('context="bio"');
    const scenery = read("src/components/link-in-bio/aube-scenery.tsx");
    expect((scenery.match(/<path /g) ?? []).length).toBe(4);
    expect(scenery).toContain('className="aube-bird aube-bird-2"');
    const css = read("src/app/globals.css");
    expect(css).toContain("@keyframes aube-fly");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.aube-sun, \.aube-ridge, \.aube-bird \{ animation: none; \}/);
    expect(read("src/components/settings/theme-card.tsx")).toContain('const bioCretes = context === "bio" && theme.key === "aube";');
  });
});

describe("logo Nebula selon le thème de palier (09/10/2026)", () => {
  it("Or Impérial : blanc et or ; Éclipse totale : négatif noir et blanc", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\[data-theme="or-imperial"\] \.nb-logo,\s*\[data-theme="or-imperial"\] \.nb-word \{\s*--nb-logo-1: #fffaf0;/);
    expect(css).toContain('[data-theme="eclipse-totale"] .nb-logo .nb-logo-star { fill: #050506; }');
    expect(css).toContain('[data-mode="light"][data-theme="eclipse-totale"] .nb-logo:not(.nb-logo--on-dark) .nb-logo-star { fill: #ffffff; }');
    // Le thème et le mode sont posés sur <html> : les deux attributs se combinent.
    expect(read("src/components/theme-provider.tsx")).toContain("root.dataset.theme = theme.key;");
    expect(read("src/components/mode-provider.tsx")).toContain("document.documentElement.dataset.mode = mode;");
  });
});

describe("assistant « Demander à Nebula » (09/10/2026)", () => {
  it("la conversation repart de zéro à chaque page et marque, rien n'est gardé dans le navigateur", () => {
    const chat = read("src/components/dashboard/ai-assistant.tsx");
    expect(chat).not.toContain("sessionStorage.setItem");
    expect(chat).toContain("forgetLegacyConversations();");
    expect(chat).toMatch(/const place = `\$\{brandId \?\? ""\}\|\$\{pathname\}`;\s*if \(placeRef\.current !== null && placeRef\.current !== place\) \{\s*setMessages\(\[\]\);/);
  });
  it("tiroir sous la barre du haut, aux coins arrondis : seul le contenu se décale, pas la barre du haut", () => {
    expect(read("src/components/dashboard/ai-assistant.tsx")).toContain('className="glass-panel-solid nb-assistant-window fixed z-50 flex flex-col"');
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.nb-assistant-window \{\s*inset: auto;\s*top: 77px;\s*right: 12px;\s*bottom: 12px;\s*width: 420px;/);
    expect(css).toContain("border-radius: 28px;");
    expect(css).toMatch(/html\.nebula-assistant-docked,\s*html\.nebula-assistant-docked body \{\s*overflow: hidden;/);
    expect(css).toMatch(/html\.nebula-assistant-gutter \{\s*scrollbar-gutter: stable;/);
    expect(css).toMatch(/html\.nebula-assistant-docked \{\s*--nb-topbar-offset: 0px;/);
    const shell = read("src/components/dashboard/app-shell.tsx");
    expect(shell).toContain("const ASSISTANT_SPACE = ASSISTANT_WIDTH + 2 * ASSISTANT_GAP;");
    // La marge est sur la zone sous la barre du haut, pas sur la colonne
    // qui contient la barre du haut.
    expect(shell).toMatch(/<AppHeader oauth=\{oauth\} isOwner=\{isOwner\} \/>[\s\S]*ref=\{bodyRef\}[\s\S]*marginRight: ASSISTANT_SPACE[\s\S]*<main id="contenu"/);
    expect(shell).not.toMatch(/style=\{assistantDocked \? \{ marginRight: ASSISTANT_SPACE \} : undefined\}\s*>\s*<AppHeader/);
    // Blocs collés en haut : décalés de la hauteur de la barre du haut seulement quand elle est au-dessus de la zone qui défile.
    expect(read("src/app/(dashboard)/composer/page.tsx")).toContain("sticky top-[calc(var(--nb-topbar-offset)_+_24px)]");
  });
});
