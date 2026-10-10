// 10/10/2026 (Lucas) : plus de guides dans la Communauté (les questions
// passent par « Demander à Nebula » et ses suggestions), plus de petite
// phrase sous le titre des pages, et plus de barre de défilement à droite
// des rangées d'onglets.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ASSISTANT_CONTEXTS } from "@/lib/ai/assistant-contexts";
import { BACKGROUNDS, resolveBackgroundKey } from "@/lib/backgrounds";
import { REWARDS } from "@/lib/reussites/catalog";
import { findEasterEgg } from "@/lib/easter-eggs-registry";

const read = (f: string) => readFileSync(f, "utf8");

describe("guides de la Communauté retirés", () => {
  it("plus d'onglet Guides ; anciens liens et routes renvoyés ailleurs", () => {
    const page = read("src/app/(dashboard)/community/page.tsx");
    expect(page).not.toContain('"guides"');
    expect(page).not.toContain("/api/community/guides");
    expect(read("src/app/(dashboard)/community/guides/[slug]/page.tsx")).toContain('redirect("/community")');
    expect(read("src/app/api/community/guides/route.ts")).toContain("status: 410");
    expect(read("src/app/api/community/guides/[slug]/route.ts")).toContain("status: 410");
    expect(read("prisma/seed.ts")).not.toContain("guide.upsert");
  });
  it("l'assistant ne renvoie plus vers des guides : il explique lui-même", () => {
    expect(ASSISTANT_CONTEXTS.community.suggestions).toContain("Par où commencer sur Nebula ?");
    expect(ASSISTANT_CONTEXTS.community.suggestions.join(" ")).not.toMatch(/guide/i);
    expect(ASSISTANT_CONTEXTS.community.welcome).not.toMatch(/guide/i);
    expect(read("src/lib/ai/assistant-prompts.ts")).toContain("Il n'y a pas de guides : c'est toi qui expliques pas à pas comment faire dans Nebula.");
    expect(read("src/components/dashboard/navigation.ts")).not.toContain('"/community/guides/"');
  });
});

describe("plus de phrase sous le titre des pages (gagner de la place)", () => {
  it("description masquée dans l'application ; seul le message d'accueil personnalisé (cosmétique) reste", () => {
    const header = read("src/components/ui/page-header.tsx");
    expect(header).toContain("const shownDescription = titleInPage || keepDescription ? description : null;");
    const dash = read("src/app/(dashboard)/dashboard/dashboard-client.tsx");
    expect(dash).toContain('description={cosmetics.has("message-accueil-perso") ? greeting : undefined}');
    expect(dash).not.toContain("Connectez un compte puis synchronisez-le (page Analytics) pour remplir ce tableau de bord.");
  });
});

describe("rangées d'onglets sans barre de défilement à droite", () => {
  it("trait dessiné dans la rangée, onglets sans débordement, défilement en largeur seulement", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.nb-tabrow \{[^}]*overflow-x: auto;[^}]*overflow-y: hidden;[^}]*scrollbar-width: none;[^}]*box-shadow: inset 0 -1px 0 var\(--nb-sep\);/);
    for (const f of ["src/components/ui/tabs.tsx", "src/app/(dashboard)/analytics/analytics-client.tsx", "src/components/interactions/interactions-tabs.tsx", "src/app/(dashboard)/community/page.tsx"]) {
      const src = read(f);
      expect(src, f).toContain("nb-tabrow");
      expect(src, f).not.toContain("-mb-px");
    }
    expect(read("src/components/ui/tabs.tsx")).toContain('"nb-scroll-x rounded-lg border');
  });
});

describe("menu du profil devant l'assistant", () => {
  it("la barre du haut passe devant le tiroir quand un de ses menus est ouvert", () => {
    expect(read("src/app/globals.css")).toMatch(/\.nb-topbar:has\(\[aria-expanded="true"\]\) \{\s*z-index: 60;/);
    expect(read("src/components/dashboard/profile-menu.tsx")).toContain("aria-expanded={open}");
  });
});

describe("Réussites : boutons vers un autre onglet, étoile « 3 shorts »", () => {
  it("« Faire mon bilan » ouvre l'onglet Missions avant de faire défiler", () => {
    expect(read("src/components/reussites/lesson-dialog.tsx")).toContain("goToInReussites(star.href.slice(1))");
    expect(read("src/components/reussites/constellation.tsx")).toContain("onClick={() => goToInReussites(href.slice(1))}");
    const page = read("src/app/(dashboard)/reussites/page.tsx");
    expect(page).toContain("window.addEventListener(REUSSITES_GOTO_EVENT, onGoTo);");
    expect(page).toContain('const MISSIONS_TARGETS = new Set(["missions", "missions-section", "defis", "defi-mois", "coffre", "bilan", "collectif"]);');
  });
  it("« Vertical natif » : 3 shorts", () => {
    const skills = read("src/lib/reussites/skills.ts");
    expect(skills).toContain('description: "Mettre en ligne 3 shorts."');
    expect(skills).toContain('unit: "shorts"');
    expect(skills).not.toContain("3 vidéos verticales");
  });
});

describe("fonds d'écran : le fond uni et les deux fonds de Réussites (10/10/2026)", () => {
  it("seulement Uni, Constellation et Galaxie spirale ; les autres mènent au fond uni", () => {
    expect(BACKGROUNDS.map((b) => b.key)).toEqual(["mesh", "constellation-reussite", "galaxie-spirale"]);
    expect(BACKGROUNDS.find((b) => b.key === "constellation-reussite")?.requiresEgg).toBe("ach:bg-constellation");
    expect(BACKGROUNDS.find((b) => b.key === "galaxie-spirale")?.requiresEgg).toBe("ach:bg-galaxie-spirale");
    for (const old of ["solstice", "nebuleuse", "aurore-boreale-animee", "premiere-lumiere", "pluie-meteores-animee", "constellation", "maree-nocturne", "inconnu"]) {
      expect(resolveBackgroundKey(old), old).toBe("mesh");
    }
    expect(resolveBackgroundKey("galaxie-spirale")).toBe("galaxie-spirale");
  });
  it("plus de récompense « fond » retirée : Première lumière et Pluie de météores", () => {
    expect(REWARDS.filter((r) => r.kind === "background").map((r) => r.key)).toEqual(["ach:bg-constellation", "ach:bg-galaxie-spirale"]);
    expect(findEasterEgg("meteor-shower-unlock")?.reward).toBeUndefined();
    expect(read("src/lib/reussites/catalog.ts")).not.toContain("Première lumière »\",");
  });
  it("les flèches du carrousel n'apparaissent que si les fonds ne tiennent pas tous", () => {
    const carousel = read("src/components/settings/background-carousel.tsx");
    expect(carousel).toContain("setOverflow(el.scrollWidth > el.clientWidth + 1)");
    expect(carousel.match(/\{overflow && \(/g)).toHaveLength(2);
  });
});

describe("Facturation sans le bloc des quotas d'IA (10/10/2026)", () => {
  it("le tableau « IA : ce qu'il vous reste » n'est plus affiché", () => {
    const billing = read("src/app/(dashboard)/billing/page.tsx");
    expect(billing).not.toContain("<AiQuotaCard");
    expect(read("src/app/tarifs/page.tsx")).not.toContain("la page Abonnement affiche ce qu'il vous reste");
  });
});
