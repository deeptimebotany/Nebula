import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EASTER_EGGS, ORIGINAL_TWENTY_KEYS, findEasterEgg, isNumberedEgg } from "@/lib/easter-eggs-registry";
import { COLLECTION_EGG_KEYS, LINKED_EGG_KEYS, RANKS } from "@/lib/reussites/catalog";

// 10/10/2026, demandes de Lucas : cinq easter eggs retirés, numéros sans
// trou, « Centenaire » = 100ᵉ publication (pas un « post »), onglet
// Concurrence d'Analytics retiré.
const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const REMOVED = ["ai-identity", "inbox-zero", "banana-word", "ai-answer-42", "support-thanks"];

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("numéros sans trou", () => {
  it("registre : 1, 2, 3… dans l'ordre, sans trou ni doublon, clés uniques", () => {
    expect(EASTER_EGGS.map((e) => e.number)).toEqual(range(EASTER_EGGS.length));
    expect(new Set(EASTER_EGGS.map((e) => e.key)).size).toBe(EASTER_EGGS.length);
    // Le numéro est calculé, jamais écrit à la main.
    expect(read("src/lib/easter-eggs-registry.ts")).not.toMatch(/number: \d/);
  });
  it("trois blocs dans l'ordre : grille numérotée, puis à récompense, puis accomplissements de Réussites", () => {
    const blockOf = (e: (typeof EASTER_EGGS)[number]) => (LINKED_EGG_KEYS.includes(e.key) ? 3 : isNumberedEgg(e) ? 1 : 2);
    const blocks = EASTER_EGGS.map(blockOf);
    expect(blocks).toEqual([...blocks].sort((a, b) => a - b));
    // La grille de la collection (ce que voit la personne) se suit donc : 1, 2, 3…
    const grid = EASTER_EGGS.filter((e) => blockOf(e) === 1).map((e) => e.number);
    expect(grid).toEqual(range(grid.length));
    expect(EASTER_EGGS.filter((e) => blockOf(e) === 3).map((e) => e.key).sort()).toEqual([...LINKED_EGG_KEYS].sort());
    expect(COLLECTION_EGG_KEYS).toHaveLength(EASTER_EGGS.length - LINKED_EGG_KEYS.length);
  });
  it("collection : chaque easter egg garde sa place (un secret trouvé ne quitte pas la grille)", () => {
    const api = read("src/app/api/easter-eggs/route.ts");
    expect(api.match(/numbered: isNumberedEgg\(e\)/g)).toHaveLength(3);
    expect(read("src/components/reussites/succes-section.tsx")).toContain("const numbered = (e: EggStatus) => e.numbered ?? !e.reward;");
  });
  it("plus aucun ancien numéro d'easter egg dans le code (on les nomme)", () => {
    for (const f of ["src/components/easter-eggs.tsx", "src/lib/easter-eggs/statue.ts", "src/app/api/easter-eggs/route.ts", "src/lib/publish.ts", "src/app/(dashboard)/analytics/analytics-client.tsx"]) {
      expect(read(f), f).not.toMatch(/(easter egg|Easter egg|"[^"]+") \(?#\d+/);
    }
  });
  it("accueil du site : nombres calculés (easter eggs de la collection, rangs)", () => {
    const home = read("src/app/page.tsx");
    expect(home).toContain("title: `${COLLECTION_EGG_KEYS.length} easter eggs à trouver`");
    expect(home).toContain("title: `${RANKS.length} rangs, de ${RANKS[0].name} à ${RANKS[RANKS.length - 1].name}`");
    expect(RANKS.map((r) => r.rank)).toEqual(range(RANKS.length));
  });
  it("README : éléments de la section 4 numérotés 1, 2, 3… sans trou", () => {
    const readme = read("README.md");
    const section = readme.slice(readme.indexOf("## 4."), readme.indexOf("## 5."));
    const items = Array.from(section.matchAll(/^(\d+)\. \*\*/gm)).map((m) => Number(m[1]));
    expect(items).toEqual(range(items.length));
  });
});

describe("easter eggs retirés (Qui es-tu ?, Inbox zero, Banane, Le sens de la vie, Merci beaucoup)", () => {
  it("absents du registre et de la collection", () => {
    for (const key of REMOVED) {
      expect(findEasterEgg(key), key).toBeUndefined();
      expect(COLLECTION_EGG_KEYS).not.toContain(key);
    }
    expect(findEasterEgg("posts-100")?.title).toBe("Centenaire");
  });
  it("plus aucun déclencheur : assistant IA, commentaires, pluie de bananes", () => {
    const chat = read("src/app/api/ai/chat/route.ts");
    for (const t of ["matchIdentityEasterEgg", "matchMathEasterEgg", "matchThanksEasterEgg", "markEasterEggFound"]) expect(chat).not.toContain(t);
    expect(read("src/components/interactions/comments-view.tsx")).not.toContain("inbox-zero");
    const eggs = read("src/components/easter-eggs.tsx");
    expect(eggs).not.toMatch(/banana/i);
    expect(eggs).not.toContain("🍌");
  });
  it("Chasseur d'étoiles : les 18 easter eggs d'origine restants", () => {
    expect(ORIGINAL_TWENTY_KEYS).toHaveLength(18);
    for (const key of ORIGINAL_TWENTY_KEYS) expect(findEasterEgg(key), key).toBeDefined();
    expect(findEasterEgg("original-20-found")?.hint).toContain("18 easter eggs");
    expect(read("src/app/api/easter-eggs/route.ts")).toContain("await checkMetaAchievements(userId)");
  });
  it("compteurs, profil et XP ne comptent que les easter eggs de la collection", () => {
    for (const f of ["src/lib/me.ts", "src/lib/reussites/engine.ts", "src/lib/community/member-profile.ts"]) {
      const src = read(f);
      expect(src, f).toContain("key: { in: COLLECTION_EGG_KEYS }");
      expect(src, f).not.toContain("notIn: LINKED_EGG_KEYS");
    }
  });
});

describe("Centenaire = 100ᵉ publication", () => {
  it("indices des easter eggs : « publication », jamais « post »", () => {
    expect(findEasterEgg("posts-100")?.hint).toContain("100ᵉ publication");
    for (const e of EASTER_EGGS) expect(e.hint, e.key).not.toMatch(/\bposts?\b/i);
  });
  it("compte les publications en ligne sur au moins un réseau, à partir de 100, partielles comprises", () => {
    const publish = read("src/lib/publish.ts");
    expect(publish).toContain('prisma.post.count({ where: { createdById: userId, targets: { some: { status: "PUBLISHED" } } } })');
    expect(publish).toContain("return total >= PERSONAL_PUBLISH_MILESTONE;");
    expect(publish).toContain('(finalStatus === "PUBLISHED" || finalStatus === "PARTIAL") && (await checkPersonalPublishMilestone(post.createdById))');
  });
});

describe("onglet Concurrence retiré d'Analytics", () => {
  it("plus d'onglet, plus d'appel à l'API, plus de mention dans le menu, l'assistant et l'accueil", () => {
    const a = read("src/app/(dashboard)/analytics/analytics-client.tsx");
    expect(a).toContain('const ANALYTICS_TABS: readonly AnalyticsTab[] = ["overview", "retention", "ads"];');
    expect(a).not.toContain("/api/competitors");
    expect(read("src/components/dashboard/navigation.ts")).not.toMatch(/concurrence/i);
    expect(read("src/lib/ai/assistant-prompts.ts")).not.toContain("Concurrence");
    expect(read("src/app/page.tsx")).not.toContain("Suivi de vos concurrents");
  });
});
