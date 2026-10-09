import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Réorganisation du menu (09/10/2026, demande de Lucas) : Commentaires et
// Engagements réunis en « Interactions » ; Rétention IA devient un onglet
// d'Analytics. Les anciennes adresses redirigent, filtres gardés.
import { NAV_GROUPS, resolveNav } from "@/components/dashboard/navigation";
import { resolveAssistantContext } from "@/lib/ai/assistant-contexts";

const read = (p: string) => readFileSync(p, "utf8");
const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

describe("Interactions et Rétention IA", () => {
  it("menu : Interactions à la place de Commentaires et Engagements ; plus de Rétention IA à part", () => {
    expect(hrefs).toContain("/interactions");
    for (const gone of ["/comments", "/engagements", "/retention"]) expect(hrefs).not.toContain(gone);
    expect(resolveNav("/interactions").item?.label).toBe("Interactions");
    expect(resolveAssistantContext("/interactions")).toBe("comments");
  });
  it("page Interactions : deux onglets, l'onglet Engagement garde son contexte d'assistant", () => {
    const page = read("src/app/(dashboard)/interactions/page.tsx");
    expect(page).toContain('useSearchParams().get("vue") === "engagement"');
    expect(page).toContain('setOverride?.(view === "engagement" ? "engagements" : null);');
    expect(read("src/components/interactions/interactions-tabs.tsx")).toContain('{ id: "engagement", label: "Engagement", href: "/interactions?vue=engagement" }');
    expect(read("src/components/interactions/comments-view.tsx")).toContain('title="Interactions"');
    expect(read("src/components/interactions/engagements-view.tsx")).toContain('title="Interactions"');
  });
  it("anciennes adresses : redirections, filtres gardés", () => {
    expect(read("src/app/(dashboard)/comments/page.tsx")).toContain('for (const key of ["connectionId", "post"])');
    expect(read("src/app/(dashboard)/engagements/page.tsx")).toContain('new URLSearchParams({ vue: "engagement" })');
    expect(read("src/app/(dashboard)/retention/page.tsx")).toContain('new URLSearchParams({ tab: "retention" })');
    expect(read("next.config.js")).not.toContain('destination: "/comments"');
  });
  it("Analytics : onglet Rétention IA (chargé à l'ouverture), gardé dans l'adresse, retour de Stripe au bon endroit", () => {
    const a = read("src/app/(dashboard)/analytics/analytics-client.tsx");
    expect(a).toContain('["retention", "Rétention IA"]');
    expect(a).toContain("<RetentionTool embedded />");
    expect(a).toContain('import("@/components/retention/retention-tool")');
    expect(a).toContain('setAssistantOverride?.(tab === "retention" ? "retention" : null);');
    const pack = read("src/app/api/billing/retention-pack/route.ts");
    expect(pack).toContain('"/analytics?tab=retention&"');
    expect(pack).toContain("success_url: `${appUrl}${back}recharge=success`");
  });
  it("l'assistant garde l'override posé par un onglet (attaché à la page)", () => {
    const p = read("src/components/dashboard/ai-assistant-context.tsx");
    expect(p).toContain("const override = overrideState && overrideState.path === pathname ? overrideState.key : null;");
    expect(p).not.toMatch(/useEffect\(\(\) => \{\s*setOverride\(null\);\s*\}, \[pathname\]\);/);
  });
});
