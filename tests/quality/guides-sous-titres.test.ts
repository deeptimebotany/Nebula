// 10/10/2026 (Lucas) : les guides de la Communauté sont dans le code (plus
// besoin de commande sur chaque base) et à jour de l'interface V2 ; plus de
// petite phrase sous le titre des pages de l'application.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { builtInGuides, guideBodyHtml, mergeGuides } from "@/lib/community/guides";
import { PLAN_LIMITS } from "@/lib/plans";

describe("guides de la Communauté", () => {
  const guides = builtInGuides();
  it("trois guides écrits par l'équipe Nebula, dans l'ordre", () => {
    expect(guides.map((g) => g.slug)).toEqual(["demarrer-avec-nebula", "choisir-sa-formule", "partager-une-video-communaute"]);
  });
  it("à jour de l'interface V2 (plus de « Composer », de « + » à côté de la marque…)", () => {
    const all = guides.map((g) => g.body).join("\n");
    for (const old of ["Composer", "composer", "petit \"+\"", "en haut de l'écran", "Ctrl+Entrée"]) expect(all).not.toContain(old);
    expect(all).toContain("Cliquez sur « Publier », en haut à droite.");
    expect(all).toContain("« Programmer » ouvre un calendrier");
    expect(all).toContain("ouvrez « Comptes connectés »");
  });
  it("formules : chiffres lus dans plans.ts (jamais recopiés), sans prix", () => {
    const plan = guides.find((g) => g.slug === "choisir-sa-formule")!.body;
    const pro = PLAN_LIMITS.PRO.tiers.map((t) => t.maxBrands);
    expect(plan).toContain(`de ${pro[0]} à ${pro[pro.length - 1]} marques`);
    expect(plan).toContain(`${PLAN_LIMITS.FREE.maxConnections} comptes connectés par marque`);
    expect(plan).toContain(`${PLAN_LIMITS.FREE.maxPostsPerMonth} publications programmées par mois`);
    expect(plan).not.toMatch(/€|\beuros?\b/);
  });
  it("un guide ajouté en base s'affiche en plus ; à identifiant égal, le code l'emporte", () => {
    const merged = mergeGuides([
      { id: "db1", slug: "demarrer-avec-nebula", title: "Ancien", summary: "", body: "", order: 0 },
      { id: "db2", slug: "astuce-tiktok", title: "Astuce TikTok", summary: "", body: "", order: 5 }
    ]);
    expect(merged.map((g) => g.title)).toEqual(["Nebula pour les débutants absolus", "Quelle formule choisir : Gratuit, Pro ou Agence ?", "Partager une vidéo dans la Communauté", "Astuce TikTok"]);
  });
  it("le texte sous un titre reste un paragraphe (il s'affichait en titre)", () => {
    expect(guideBodyHtml("## Étape 1\nConnectez vos comptes.")).toBe("<h2>Étape 1</h2><p>Connectez vos comptes.</p>");
    expect(guideBodyHtml("Intro\n\n## Astuces\n- un\n- deux")).toBe("<p>Intro</p><h2>Astuces</h2><ul><li>un</li><li>deux</li></ul>");
    expect(guideBodyHtml("a <b>")).toBe("<p>a &lt;b&gt;</p>");
  });
  it("les routes servent les guides du code, la commande de remplissage ne crée plus rien", () => {
    expect(readFileSync("src/app/api/community/guides/route.ts", "utf8")).toContain("mergeGuides(fromDb)");
    expect(readFileSync("src/app/api/community/guides/[slug]/route.ts", "utf8")).toContain("builtInGuides().find((g) => g.slug === params.slug)");
    expect(readFileSync("prisma/seed.ts", "utf8")).not.toContain("guide.upsert");
  });
});

describe("plus de phrase sous le titre des pages (gagner de la place)", () => {
  it("description masquée dans l'application ; seul le message d'accueil personnalisé (cosmétique) reste", () => {
    const header = readFileSync("src/components/ui/page-header.tsx", "utf8");
    expect(header).toContain("const shownDescription = titleInPage || keepDescription ? description : null;");
    const dash = readFileSync("src/app/(dashboard)/dashboard/dashboard-client.tsx", "utf8");
    expect(dash).toContain('description={cosmetics.has("message-accueil-perso") ? greeting : undefined}');
    expect(dash).not.toContain("Connectez un compte puis synchronisez-le (page Analytics) pour remplir ce tableau de bord.");
  });
});
