// 10/10/2026 (Lucas) : plus de guides dans la Communauté (les questions
// passent par « Demander à Nebula » et ses suggestions), plus de petite
// phrase sous le titre des pages, et plus de barre de défilement à droite
// des rangées d'onglets.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ASSISTANT_CONTEXTS } from "@/lib/ai/assistant-contexts";

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
