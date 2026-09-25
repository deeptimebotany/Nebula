// Studio IA (produit n°9) : faits calculés sans IA, lecture des réponses de
// l'IA (contrats), repères de rétention placés d'après les vraies courbes,
// quota par palier, reprise dans Publier.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computeStudioFacts, crossing, factsForPrompt, watchAt, type MetricRow, type StudioFacts } from "@/lib/studio/facts";
import { annotateScript, ideasPrompt, parseIdeas, parseScript, scriptPrompt, startOfParisDay, studioLimitFor } from "@/lib/studio/generate";
import { composerDraftFrom, generationTitle } from "@/lib/studio/types";
import { PLAN_LIMITS } from "@/lib/plans";

const NOW = new Date("2026-09-25T12:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

function metric(over: Partial<MetricRow>): MetricRow {
  return { network: "YOUTUBE", title: "Vidéo", permalink: null, thumbnailUrl: null, publishedAt: ago(10), views: 1000, likes: 50, comments: 5, shares: null, ...over };
}

const baseMetrics: MetricRow[] = [
  metric({ title: "Le cappuccino parfait", views: 9000, publishedAt: ago(5) }),
  metric({ title: "Latte art", views: 1000, publishedAt: ago(12) }),
  metric({ title: "Moka", views: 1200, publishedAt: ago(19) }),
  metric({ title: "Cold brew", views: 800, publishedAt: ago(26) }),
  metric({ title: "Trop récente", views: 50_000, publishedAt: ago(1) }),
  metric({ title: "Trop ancienne", views: 90_000, publishedAt: ago(200) }),
  metric({ network: "FACEBOOK", title: "Post Facebook A", views: null, likes: 20, comments: 5, shares: 5, publishedAt: ago(6) }),
  metric({ network: "FACEBOOK", title: "Post Facebook B", views: null, likes: 5, comments: 1, shares: 0, publishedAt: ago(9) }),
  metric({ network: "FACEBOOK", title: "Post Facebook C", views: null, likes: 6, comments: 0, shares: 0, publishedAt: ago(15) })
];

function facts(over: Partial<Parameters<typeof computeStudioFacts>[0]> = {}): StudioFacts {
  return computeStudioFacts({
    metrics: baseMetrics,
    retention: [
      { curve: [{ timeRatio: 0, watchRatio: 1 }, { timeRatio: 0.1, watchRatio: 0.65 }, { timeRatio: 0.4, watchRatio: 0.5 }, { timeRatio: 1, watchRatio: 0.2 }], notes: ["Accroche trop lente"], createdAt: ago(3) },
      { curve: [{ timeRatio: 0, watchRatio: 1 }, { timeRatio: 0.1, watchRatio: 0.7 }, { timeRatio: 0.3, watchRatio: 0.5 }, { timeRatio: 1, watchRatio: 0.25 }], notes: ["Accroche trop lente", "Chapitres utiles"], createdAt: ago(8) }
    ],
    bestSlots: [{ network: "YOUTUBE", hour: 18 }],
    publishedDates: [ago(1), ago(4), ago(8), ago(11), ago(40)],
    connectedNetworks: ["YOUTUBE", "FACEBOOK", "YOUTUBE"],
    now: NOW,
    ...over
  });
}

describe("faits « ce qui marche chez vous » (sans IA)", () => {
  it("meilleures publications rapportées aux habitudes de chaque réseau ; trop récentes et trop anciennes exclues", () => {
    const f = facts();
    expect(f.networks).toEqual(["YOUTUBE", "FACEBOOK"]);
    expect(f.measured).toBe(7);
    expect(f.topPosts[0]).toMatchObject({ ref: 1, title: "Le cappuccino parfait", metric: "views", value: 9000 });
    expect(f.topPosts[0].vsUsual).toBeCloseTo(8.2, 1); // médiane YouTube : 1 100
    expect(f.topPosts.find((p) => p.network === "FACEBOOK")).toMatchObject({ title: "Post Facebook A", metric: "interactions", value: 30, vsUsual: 5 });
    expect(f.topPosts.some((p) => p.title === "Trop récente" || p.title === "Trop ancienne")).toBe(false);
    expect(f.usual).toEqual(expect.arrayContaining([{ network: "YOUTUBE", metric: "views", median: 1100, posts: 4 }]));
    expect(f.enough).toBe(true);
  });

  it("rétention : moment où la moitié du public est partie, perte au début, observations sans doublon", () => {
    const f = facts();
    expect(f.retention).toMatchObject({ analyses: 2, halfAudienceAt: 0.35, earlyLoss: 0.33 });
    expect(f.retention!.notes).toEqual(["Accroche trop lente", "Chapitres utiles"]);
    expect(crossing([{ timeRatio: 0, watchRatio: 1 }, { timeRatio: 1, watchRatio: 0.6 }], 0.5)).toBeNull();
    expect(watchAt([{ timeRatio: 0, watchRatio: 1 }, { timeRatio: 0.2, watchRatio: 0.6 }], 0.1)).toBeCloseTo(0.8, 5);
  });

  it("rythme et cas vides : rien d'inventé", () => {
    const f = facts();
    expect(f.rhythm).toEqual({ postsLast30Days: 4, medianGapDays: 3.5 });
    const empty = computeStudioFacts({ metrics: [], retention: [], bestSlots: [], publishedDates: [], connectedNetworks: [], now: NOW });
    expect(empty).toMatchObject({ measured: 0, topPosts: [], retention: null, enough: false, rhythm: { postsLast30Days: 0, medianGapDays: null } });
  });

  it("faits envoyés à l'IA : les chiffres des faits, les numéros de référence", () => {
    const p = factsForPrompt(facts(), "Café Nebula") as { publications_qui_ont_le_mieux_marche: { ref: number; vues?: number }[]; retention: { moitie_du_public_partie_a_pourcent_de_la_video: number } };
    expect(p.publications_qui_ont_le_mieux_marche[0]).toMatchObject({ ref: 1, vues: 9000 });
    expect(p.retention.moitie_du_public_partie_a_pourcent_de_la_video).toBe(35);
  });
});

describe("réponses de l'IA : contrats", () => {
  const f = facts();

  it("idées : références vérifiées, réseau reconnu, accroches bornées, 5 au plus", () => {
    const raw = JSON.stringify({
      ideas: [
        { title: "« Le flat white expliqué »", angle: "Montrer la différence avec le latte.", format: "short", network: "youtube", basedOn: 1, hooks: ["Vous faites sûrement cette erreur avec votre lait", "Deux cafés, une seule différence", "x"] },
        { title: "Coulisses de la torréfaction", angle: "Suivre un grain.", format: "long", network: "TikTok", basedOn: 42, hooks: ["Ce grain vert va devenir votre café du matin"] },
        { title: "Sans accroche", angle: "…", format: "court", network: null, basedOn: null, hooks: [] },
        ...Array.from({ length: 6 }, (_, i) => ({ title: `Idée ${i}`, angle: "a", format: "court", network: "Facebook", basedOn: "2", hooks: ["Une accroche assez longue"] }))
      ]
    });
    const ideas = parseIdeas(raw, f);
    expect(ideas).toHaveLength(5);
    expect(ideas[0]).toMatchObject({ title: "Le flat white expliqué", format: "court", network: "YOUTUBE", basedOn: 1, hooks: ["Vous faites sûrement cette erreur avec votre lait", "Deux cafés, une seule différence"] });
    expect(ideas[1]).toMatchObject({ network: null, basedOn: null, format: "long" }); // TikTok non connecté, référence inconnue
    expect(ideas[2]).toMatchObject({ network: "FACEBOOK", basedOn: 2 });
    expect(() => parseIdeas("pas du JSON", f)).toThrow();
    expect(() => parseIdeas(JSON.stringify({ ideas: [] }), f)).toThrow();
  });

  it("script : sections bornées, hashtags nettoyés", () => {
    const script = parseScript(
      JSON.stringify({
        title: "Le café amer, c'est fini",
        hook: "Votre café est amer ? Ce n'est pas le grain.",
        sections: Array.from({ length: 10 }, (_, i) => ({ label: `Partie ${i + 1}`, content: "Contenu ".repeat(10) })),
        cta: "Abonnez-vous",
        description: "Trois réglages.",
        hashtags: ["#café", "barista", "deux mots", "##latte", "café", "!!"]
      }),
      "long"
    );
    expect(script.sections).toHaveLength(8);
    expect(script.hashtags).toEqual(["#café", "#barista", "#deuxmots", "#latte"]);
    expect(script.sections.every((s) => s.retentionNote === null)).toBe(true);
  });

  it("repères de rétention placés d'après les vraies courbes (jamais par l'IA)", () => {
    const script = parseScript(
      JSON.stringify({ title: "T", hook: "Accroche", sections: [0, 1, 2, 3].map((i) => ({ label: `S${i}`, content: "x".repeat(100) })), cta: "c", description: "d", hashtags: [] }),
      "long"
    );
    const annotated = annotateScript(script, f);
    expect(annotated.sections[0].retentionNote).toContain("33 %"); // perte au début ≥ 25 %
    // Moitié du public partie vers 35 % : fin de la 2e section (50 %) → relance sur la 1re.
    expect(annotated.sections[0].retentionNote).toContain("35 %");
    expect(annotated.sections.slice(1).every((s) => s.retentionNote === null)).toBe(true);
    expect(annotateScript(script, { ...f, retention: null })).toEqual(script);
  });

  it("consignes : faits en JSON, interdiction d'inventer des chiffres, réseau et thème", () => {
    const i = ideasPrompt(f, "Café Nebula", { network: "YOUTUBE", theme: "matériel" });
    expect(i.system).toContain("N'invente AUCUN chiffre");
    expect(i.prompt).toContain('"marque":"Café Nebula"');
    expect(i.prompt).toContain("Réseau visé : YouTube.");
    expect(i.prompt).toContain("Thème souhaité : matériel");
    const s = scriptPrompt(f, "Café Nebula", { subject: "Le café amer", format: "court", network: null });
    expect(s.system).toContain("courte (60 secondes au plus)");
    expect(s.prompt).toContain("Sujet de la vidéo : Le café amer");
  });
});

describe("quota et reprise dans Publier", () => {
  it("générations par jour selon le palier ; essai IA = comme Pro", () => {
    expect(studioLimitFor({ limits: PLAN_LIMITS.FREE })).toBe(0);
    expect(studioLimitFor({ limits: PLAN_LIMITS.PRO })).toBe(15);
    expect(studioLimitFor({ limits: PLAN_LIMITS.AGENCY })).toBe(40);
    expect(studioLimitFor({ limits: { ...PLAN_LIMITS.FREE, aiEnabled: true } })).toBe(15);
  });

  it("le jour recommence à minuit, heure de Paris", () => {
    expect(startOfParisDay(new Date("2026-09-25T12:00:00Z")).toISOString()).toBe("2026-09-24T22:00:00.000Z");
    expect(startOfParisDay(new Date("2026-09-24T22:30:00Z")).toISOString()).toBe("2026-09-24T22:00:00.000Z");
    expect(startOfParisDay(new Date("2026-12-10T08:00:00Z")).toISOString()).toBe("2026-12-09T23:00:00.000Z");
  });

  it("Utiliser dans Publier : titre + accroche pour une idée, titre + description + hashtags pour un script", () => {
    const ideas = { kind: "ideas" as const, ideas: [{ title: "Idée", angle: "Pour le créateur", format: "court" as const, network: "TIKTOK" as const, basedOn: null, hooks: ["Accroche 1", "Accroche 2"] }] };
    expect(composerDraftFrom(ideas, 0)).toEqual({ title: "Idée", caption: "Accroche 1", network: "TIKTOK" });
    expect(composerDraftFrom(ideas, 3)).toBeNull();
    const script = { kind: "script" as const, script: { title: "Script", format: "long" as const, hook: "h", sections: [], cta: "c", description: "Desc.", hashtags: ["#a", "#b"] } };
    expect(composerDraftFrom(script)).toEqual({ title: "Script", caption: "Desc.\n\n#a #b", network: null });
    expect(generationTitle(ideas)).toBe("Idée");
    expect(generationTitle(script)).toBe("Script");
  });
});
