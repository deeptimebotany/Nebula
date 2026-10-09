// 10/10/2026 (demandes de Lucas) : icône « Tuiles et planète », menu sans
// catégories, pastille de marque sur la photo, Apparence sous Paramètres,
// Paramètres dans une fenêtre au milieu de l'écran (site flouté), et plus de
// chevauchement au zoom (130 % et plus).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { readFileSync } from "node:fs";
import { CONTENT_MIN, shellLayout } from "@/components/dashboard/shell-layout";
import { SETTINGS_OPEN_EVENT, SETTINGS_TABS, SETTINGS_TAB_LABELS, openSettings, settingsTabFromHash, takePendingSettings } from "@/components/settings/settings-events";
import { APP_MAP } from "@/lib/ai/assistant-prompts";

const read = (f: string) => readFileSync(f, "utf8");

describe("icône Vue d'ensemble « Tuiles et planète »", () => {
  it("trois tuiles et une planète ronde en haut à droite, pleine sur la page ouverte", () => {
    const icons = read("src/components/dashboard/nav-icons.tsx");
    const dash = icons.slice(icons.indexOf("export function NavIconDashboard"), icons.indexOf("export function NavIconPublish"));
    expect(dash).toContain('<circle cx="17" cy="7" r="3.5" />');
    expect(dash.match(/<rect /g)).toHaveLength(3);
    expect(dash).toContain('fill={filled ? "currentColor" : "none"}');
  });
});

describe("zoom à 130 % et plus : la zone de contenu garde sa place", () => {
  it("assistant posé à côté seulement s'il reste au moins 900 px de contenu ; sinon il flotte", () => {
    expect(CONTENT_MIN).toBe(900);
    // Écran 1 920 px à 130 % : ~1 477 px CSS → assistant posé, menu en icônes.
    expect(shellLayout(1477, true)).toEqual({ docked: true, forcedRail: true });
    // Assistant fermé : la barre latérale peut rester dépliée.
    expect(shellLayout(1477, false)).toEqual({ docked: false, forcedRail: false });
    // Écran 1 536 px à 130 % : ~1 180 px → l'assistant flotte par-dessus la page.
    expect(shellLayout(1180, true)).toEqual({ docked: false, forcedRail: false });
    // Grand écran : tout tient, rien n'est forcé.
    expect(shellLayout(1920, true)).toEqual({ docked: true, forcedRail: false });
  });
  it("barre latérale réduite en icônes d'office quand la place manque (sans toucher au choix mémorisé)", () => {
    expect(shellLayout(1100, false).forcedRail).toBe(true);
    expect(shellLayout(900, false).forcedRail).toBe(true);
    // Téléphone : le tiroir, pas la colonne.
    expect(shellLayout(700, false).forcedRail).toBe(false);
    // Avant le montage (largeur inconnue) : rien de forcé.
    expect(shellLayout(0, true)).toEqual({ docked: false, forcedRail: false });
    for (const vw of [1024, 1100, 1180, 1300, 1400, 1477, 1600, 1920]) {
      for (const open of [true, false]) {
        const { docked, forcedRail } = shellLayout(vw, open);
        const content = vw - (forcedRail ? 72 : 240) - (docked ? 444 : 0);
        // Barre latérale dépliée par choix : jamais moins de 900 px. En icônes : au moins 900 px aussi.
        expect(content, `${vw} px, assistant ${open ? "ouvert" : "fermé"}`).toBeGreaterThanOrEqual(CONTENT_MIN);
      }
    }
  });
  it("« Déplier » ouvre la barre par-dessus la page quand elle est réduite d'office", () => {
    const shell = read("src/components/dashboard/app-shell.tsx");
    expect(shell).toContain("if (forcedRail) setOverlayOpen((v) => !v);");
    expect(shell).toContain('sidebarOverlay && "z-50 shadow-2xl"');
    expect(shell).toContain('window.addEventListener("resize", onResize);');
    expect(shell).toContain('railShown ? "md:pl-[72px]" : "md:pl-60"');
  });
});

describe("fenêtre Paramètres (au milieu de l'écran, site flouté)", () => {
  afterEach(() => {
    takePendingSettings();
    vi.unstubAllGlobals();
  });
  it("sept onglets, dans l'ordre", () => {
    expect(SETTINGS_TABS.map((t) => t.value)).toEqual(["marque", "apparence", "focus", "sons", "notifications", "parrainage", "compte"]);
    expect(SETTINGS_TAB_LABELS).toEqual(["Marque", "Apparence", "Focus et réussites", "Sons", "Notifications", "Parrainage", "Compte"]);
  });
  it("ancres /settings#… : anciennes et nouvelles", () => {
    expect(settingsTabFromHash("#apparence")).toBe("apparence");
    expect(settingsTabFromHash("#compte")).toBe("compte");
    expect(settingsTabFromHash("#notifications")).toBe("notifications");
    expect(settingsTabFromHash("")).toBe("marque");
    expect(settingsTabFromHash("#inconnu")).toBe("marque");
  });
  it("openSettings : un événement, et une demande gardée si la fenêtre n'écoute pas encore", () => {
    const target = new EventTarget();
    const seen: unknown[] = [];
    target.addEventListener(SETTINGS_OPEN_EVENT, (e) => seen.push((e as CustomEvent).detail));
    vi.stubGlobal("window", target);
    openSettings("sons");
    expect(seen).toEqual(["sons"]);
    expect(takePendingSettings()).toBe("sons");
    expect(takePendingSettings()).toBeUndefined();
    openSettings();
    expect(takePendingSettings()).toBeNull();
  });
  it("cadre centré, fond flouté, onglets, Échap et clic à côté pour fermer", () => {
    const dialog = read("src/components/settings/settings-dialog.tsx");
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('className="nb-settings-backdrop absolute inset-0" onClick={onClose}');
    expect(dialog).toContain('role="tablist"');
    expect(dialog).toContain('if (e.key === "Escape")');
    expect(dialog).toContain("createPortal(");
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.nb-settings-backdrop \{[^}]*backdrop-filter: blur\(12px\)/);
    // Les réglages d'avant sont tous là.
    for (const label of ["Nom de la marque", "Fuseau horaire de programmation", "Marque blanche", "Thème de couleurs", "Fond d'écran", "Thème étoilé animé", "Mode focus", "Cosmétiques", "Sons de l'interface", "Son des succès", "Son Décollage", "E-mail en cas d'échec", "Conseils par e-mail", "Votre lien d'invitation"]) {
      expect(dialog, label).toContain(label);
    }
    expect(dialog).toContain("<MonthlySummarySettings dialog />");
    expect(dialog).toContain("<AccountPrivacyCard bare beforeDanger={<StatsConsentCard bare />} />");
  });
  it("ouverte depuis le menu du profil, la palette, les notifications et tout lien « /settings »", () => {
    expect(read("src/components/dashboard/profile-menu.tsx")).toContain("openSettings();");
    expect(read("src/components/dashboard/command-palette.tsx")).toContain('item.href === "/settings" ? () => openSettings()');
    expect(read("src/components/dashboard/notification-bell.tsx")).toContain("openSettings(settingsTabFromHash(");
    const host = read("src/components/settings/settings-host.tsx");
    expect(host).toContain('document.addEventListener("click", onClick, true);');
    expect(host).toContain('url.pathname !== "/settings"');
    expect(read("src/app/(dashboard)/layout.tsx")).toContain("<SettingsHost />");
    // L'adresse /settings (e-mails, favoris) ouvre la fenêtre par-dessus la vue d'ensemble.
    const page = read("src/app/(dashboard)/settings/page.tsx");
    expect(page).toContain("openSettings(settingsTabFromHash(window.location.hash));");
    expect(page).toContain('router.replace("/dashboard");');
    expect(read("src/lib/monthly-summary/send.ts")).toContain("/settings#notifications");
  });
  it("l'assistant connaît le nouveau menu et la fenêtre", () => {
    expect(APP_MAP).toContain("onglets principaux → Vue d'ensemble, Calendrier, Publications, Analytics (");
    expect(APP_MAP).toContain("onglets secondaires → Studio IA");
    expect(APP_MAP).toContain("Focus et réussites");
    expect(APP_MAP).toContain("pastille de la marque");
    expect(APP_MAP).not.toContain("Créer →");
  });
});
