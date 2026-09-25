// Audit de présence (produit n°8) : lecture des liens, du HTML, score par
// règles, recommandations, garde « aucun chiffre inventé » — sans réseau.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { inputKeyText, parseAuditInput, parseInstagram, parseTiktok, parseWebsite, parseYoutube } from "@/lib/audit/parse-input";
import { decodeEntities, parseHtml } from "@/lib/audit/sources/website";
import { buildResult, cadence, computeAxes, globalScore, isLinkPage, normalizeHandle, pct, recommendations, youtubeEngagement } from "@/lib/audit/score";
import { adviceFacts, keepFaithful } from "@/lib/audit/advice";
import { scoreLabel, subjectOf, type AuditSources, type InstagramFacts, type WebsiteFacts, type YoutubeFacts } from "@/lib/audit/types";

const NOW = new Date("2026-09-25T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function yt(over: Partial<YoutubeFacts> = {}, videoDays = [3, 10, 17, 24, 31, 38]): YoutubeFacts {
  return {
    id: "UCx",
    title: "Café Nebula",
    handle: "@cafenebula",
    url: "https://www.youtube.com/@cafenebula",
    description: "Recettes de café maison, une vidéo chaque mardi, des astuces de barista pour la maison et des tests de matériel. Site : https://cafe-nebula.fr",
    avatarUrl: "https://yt3.ggpht.com/a",
    bannerUrl: "https://yt3.googleusercontent.com/b",
    keywords: "café recettes",
    country: "FR",
    createdAt: "2021-01-01T00:00:00Z",
    subscribers: 10_000,
    views: 500_000,
    videoCount: 120,
    videos: videoDays.map((d, i) => ({
      id: `v${i}`,
      title: i === 0 ? "Un titre beaucoup trop long pour être lu en entier dans les résultats de recherche YouTube" : `Vidéo ${i}`,
      descriptionLength: 150,
      tagsCount: 2,
      publishedAt: ago(d),
      durationSec: i % 2 ? 40 : 480,
      views: 2_000 + i * 100,
      likes: 80,
      comments: 10,
      thumbnailUrl: "https://i.ytimg.com/x"
    })),
    ...over
  };
}

function ig(over: Partial<InstagramFacts> = {}): InstagramFacts {
  return {
    username: "cafenebula",
    name: "Café Nebula",
    biography: "Recettes de café maison, une vidéo chaque mardi",
    website: "https://cafe-nebula.fr/",
    followers: 5_000,
    follows: 100,
    mediaCount: 300,
    avatarUrl: "https://scontent/x",
    media: [2, 6, 9, 13, 16].map((d, i) => ({
      type: i < 2 ? "VIDEO" : "IMAGE",
      product: i < 2 ? "REELS" : "FEED",
      timestamp: ago(d),
      likes: 150,
      comments: 10,
      captionLength: 80,
      hashtags: 3,
      permalink: null
    })),
    ...over
  };
}

function web(over: Partial<WebsiteFacts> = {}): WebsiteFacts {
  return {
    url: "https://cafe-nebula.fr/",
    host: "cafe-nebula.fr",
    https: true,
    responseMs: 320,
    title: "Café Nebula — recettes de café",
    description: "Recettes de café maison et astuces de barista, une nouvelle vidéo chaque mardi sur YouTube.",
    ogImage: true,
    viewport: true,
    lang: "fr",
    noindex: false,
    textLength: 2_000,
    socialLinks: { youtube: "cafenebula", instagram: "cafenebula", tiktok: "cafenebula" },
    ...over
  };
}

const full = (): AuditSources => ({
  youtube: { status: "ok", facts: yt() },
  instagram: { status: "ok", facts: ig() },
  tiktok: { status: "ok", facts: { username: "cafenebula", displayName: "Café Nebula", bio: "Recettes", url: "https://www.tiktok.com/@cafenebula" } },
  website: { status: "ok", facts: web() }
});

describe("lecture des liens collés", () => {
  it("YouTube : @pseudo, /channel/UC…, /user/…, adresses de vidéos refusées", () => {
    expect(parseYoutube("https://www.youtube.com/@CafeNebula")).toEqual({ ok: true, value: { kind: "handle", value: "CafeNebula" } });
    expect(parseYoutube("m.youtube.com/@cafe_nebula/videos")).toEqual({ ok: true, value: { kind: "handle", value: "cafe_nebula" } });
    expect(parseYoutube("youtube.com/channel/UCabcdefghijklmnopqrstuv")).toEqual({ ok: true, value: { kind: "id", value: "UCabcdefghijklmnopqrstuv" } });
    expect(parseYoutube("https://youtube.com/user/CafeNebula")).toEqual({ ok: true, value: { kind: "username", value: "CafeNebula" } });
    expect(parseYoutube("@cafenebula")).toEqual({ ok: true, value: { kind: "handle", value: "cafenebula" } });
    expect(parseYoutube("https://youtu.be/abc").ok).toBe(false);
    expect(parseYoutube("https://www.youtube.com/watch?v=abc").ok).toBe(false);
    expect(parseYoutube("https://vimeo.com/@x").ok).toBe(false);
  });

  it("Instagram et TikTok : adresse ou pseudo, en minuscules ; pseudo avec point ≠ adresse", () => {
    expect(parseInstagram("https://www.instagram.com/Cafe.Nebula/")).toEqual({ ok: true, value: "cafe.nebula" });
    expect(parseInstagram("@jean.co")).toEqual({ ok: true, value: "jean.co" });
    expect(parseInstagram("instagram.com/p/AbC123").ok).toBe(false);
    expect(parseInstagram("a..b").ok).toBe(false);
    expect(parseTiktok("https://www.tiktok.com/@Cafe.Nebula?lang=fr")).toEqual({ ok: true, value: "cafe.nebula" });
    expect(parseTiktok("tiktok.com/cafenebula").ok).toBe(false);
  });

  it("site : https ajouté, fragment retiré, adresses locales et réseaux refusés", () => {
    expect(parseWebsite("cafe-nebula.fr")).toEqual({ ok: true, value: "https://cafe-nebula.fr/" });
    expect(parseWebsite("http://exemple.com/page#haut")).toEqual({ ok: true, value: "https://exemple.com/page" });
    expect(parseWebsite("localhost:3000").ok).toBe(false);
    expect(parseWebsite("192.168.1.10").ok).toBe(false);
    expect(parseWebsite("https://www.instagram.com/cafe").ok).toBe(false);
  });

  it("au moins un champ ; erreurs par champ ; clé de cache indépendante de la casse", () => {
    expect(parseAuditInput({})).toMatchObject({ ok: false, message: expect.stringContaining("au moins un") });
    const bad = parseAuditInput({ youtube: "https://youtu.be/x", tiktok: "tiktok.com/x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["tiktok", "youtube"]);
    const a = parseAuditInput({ youtube: "@CafeNebula", website: "Cafe-Nebula.fr/" });
    const b = parseAuditInput({ website: "https://cafe-nebula.fr", youtube: "youtube.com/@cafenebula" });
    expect(a.ok && b.ok && inputKeyText(a.input) === inputKeyText(b.input)).toBe(true);
  });
});

describe("lecture d'une page (HTML)", () => {
  it("titre, description, image de partage, mobile, langue, noindex, liens vers les réseaux", () => {
    const html = `<!doctype html><html lang="fr-FR"><head>
      <title>Caf&eacute; Nebula &#8211; l&#39;atelier</title>
      <meta name="description" content="Recettes &amp; astuces de barista">
      <meta property="og:image" content="/og.png"><meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="robots" content="noindex, follow">
      </head><body><p>Bienvenue</p>
      <a href="https://www.instagram.com/Cafe.Nebula/">IG</a><a href='https://youtube.com/@cafenebula'>YT</a>
      <a href="https://www.tiktok.com/@cafenebula">TT</a><a href="https://facebook.com/cafenebula">FB</a>
      <a href="/contact">Contact</a><script>var x = "<a href='https://x.com/pirate'>"</script></body></html>`;
    const f = parseHtml(html, "https://www.cafe-nebula.fr/");
    expect(f).toMatchObject({ host: "cafe-nebula.fr", https: true, title: "Café Nebula – l'atelier", description: "Recettes & astuces de barista", ogImage: true, viewport: true, lang: "fr-FR", noindex: true });
    expect(f.socialLinks).toMatchObject({ instagram: "cafe.nebula", youtube: "cafenebula", tiktok: "cafenebula", facebook: "cafenebula" });
    expect(f.textLength).toBeGreaterThan(5);
    expect(decodeEntities("A&nbsp;&amp;&#x41;&inconnu;")).toBe("A &A&inconnu;");
  });

  it("page vide : rien d'inventé", () => {
    const f = parseHtml("<html><body></body></html>", "https://exemple.fr/");
    expect(f).toMatchObject({ title: null, description: null, ogImage: false, viewport: false, lang: null, textLength: 0, socialLinks: {} });
  });
});

describe("score par règles", () => {
  it("pourcentages : 2 décimales sous 1 %, 1 sous 10 %, entier au-delà", () => {
    expect(pct(0.0019)).toBe("0,19 %");
    expect(pct(0.047)).toBe("4,7 %");
    expect(pct(0.27)).toBe("27 %");
  });

  it("rythme : écart médian, dernière publication, plus longue pause ; moins de 3 publications → rien", () => {
    const c = cadence([ago(3), ago(10), ago(17), ago(40)], NOW)!;
    expect(c.count).toBe(4);
    expect(c.medianGap).toBeCloseTo(7, 5);
    expect(c.daysSinceLast).toBeCloseTo(3, 5);
    expect(c.longestGap).toBeCloseTo(23, 5);
    expect(cadence([ago(1), ago(2)], NOW)).toBeNull();
  });

  it("toutes les sources : 5 axes calculés, score global pondéré, libellé", () => {
    const axes = computeAxes(full(), NOW);
    expect(axes.map((a) => a.key)).toEqual(["profil", "regularite", "engagement", "contenu", "coherence"]);
    expect(axes.every((a) => a.score !== null)).toBe(true);
    const g = globalScore(axes);
    expect(g.basedOn).toBe(5);
    const expected = Math.round(axes.reduce((n, a) => n + a.weight * (a.score as number), 0) / 100);
    expect(g.global).toBe(expected);
    expect(g.label).toBe(scoreLabel(g.global!));
    // Chaque note a sa règle affichée.
    expect(axes.flatMap((a) => a.checks).every((c) => c.rule.length > 0 && c.detail.length > 0)).toBe(true);
  });

  it("TikTok seul : un seul axe (profil), pas de score global ; les autres axes exclus avec leur raison, jamais comptés zéro", () => {
    const axes = computeAxes({ tiktok: { status: "ok", facts: { username: "x", displayName: null, bio: null, url: "https://www.tiktok.com/@x" } } }, NOW);
    const g = globalScore(axes);
    expect(g).toEqual({ global: null, label: null, basedOn: 1 });
    expect(axes.find((a) => a.key === "profil")!.score).toBe(0);
    expect(axes.filter((a) => a.score === null).every((a) => (a.missing ?? "").length > 0)).toBe(true);
    expect(globalScore(computeAxes({}, NOW))).toEqual({ global: null, label: null, basedOn: 0 });
  });

  it("abonnés masqués : la règle « vues / abonnés » n'est pas comptée ; vidéos de moins de 2 jours ignorées", () => {
    const facts = yt({ subscribers: null }, [0.5, 5, 12, 19]);
    const e = youtubeEngagement(facts, NOW);
    expect(e.videos).toBe(3);
    expect(e.viewsPerSub).toBeNull();
    const axis = computeAxes({ youtube: { status: "ok", facts } }, NOW).find((a) => a.key === "engagement")!;
    const rule = axis.checks.find((c) => c.label.includes("abonnés"))!;
    expect(rule.value).toBeNull();
    expect(rule.detail).toContain("masqué");
    expect(axis.score).not.toBeNull();
  });

  it("cohérence : pseudos différents, lien manquant du site ou vers le site", () => {
    const s = full();
    s.tiktok!.facts!.username = "cafe_nebula_off";
    s.website!.facts = web({ socialLinks: { instagram: "autre.compte" } });
    s.instagram!.facts = ig({ website: "https://autre-boutique.fr" });
    const coh = computeAxes(s, NOW).find((a) => a.key === "coherence")!;
    const byLabel = Object.fromEntries(coh.checks.map((c) => [c.label, c]));
    expect(byLabel["Même pseudo partout"].value).toBe(0.5);
    expect(byLabel["Le site renvoie vers vos réseaux"].value).toBe(0);
    expect(byLabel["Vos profils renvoient vers le site"].value).toBe(0.5);
    expect(normalizeHandle("@Cafe.Nebula")).toBe(normalizeHandle("cafe_nebula"));
    // Une page de liens (Linktree, page bio Nebula…) compte comme un lien vers vos liens.
    s.instagram!.facts = ig({ website: "https://linktr.ee/cafe" });
    const withLinkPage = computeAxes(s, NOW).find((a) => a.key === "coherence")!;
    expect(withLinkPage.checks.find((c) => c.label === "Vos profils renvoient vers le site")!.value).toBe(1);
    expect(isLinkPage("linktr.ee")).toBe(true);
    expect(isLinkPage("cafe-nebula.fr")).toBe(false);
  });
});

describe("recommandations", () => {
  it("dernière vidéo ancienne par rapport au rythme habituel : en tête, avec les chiffres", () => {
    const s: AuditSources = { youtube: { status: "ok", facts: yt({}, [40, 47, 54, 61, 68]) } };
    const recos = recommendations(s, NOW);
    expect(recos[0]).toMatchObject({ key: "YouTube-recence", priority: 3 });
    expect(recos[0].text).toContain("40 jours");
    expect(recos[0].text).toContain("7 jours");
  });

  it("8 au plus, les plus importantes d'abord ; Instagram personnel, site sans https ni mobile", () => {
    const s: AuditSources = {
      youtube: { status: "ok", facts: yt({ description: "Court", bannerUrl: null, subscribers: 100_000 }, [40, 47, 54, 61, 68, 120]) },
      instagram: { status: "private", message: "compte personnel" },
      website: { status: "ok", facts: web({ https: false, viewport: false, description: null, ogImage: false, noindex: true, socialLinks: {} }) }
    };
    const recos = recommendations(s, NOW);
    expect(recos.length).toBe(8);
    const priorities = recos.map((r) => r.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    const keys = recos.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(["ig-pro", "site-https", "site-mobile", "YouTube-recence"]));
  });

  it("rapport complet : version, entrées, notes (jour et heure habituels, TikTok sans statistiques)", () => {
    const r = buildResult({ youtube: { kind: "handle", value: "cafenebula" }, tiktok: "cafenebula" }, full(), NOW);
    expect(r).toMatchObject({ version: 1, analyzedAt: NOW.toISOString() });
    expect(r.notes.some((n) => n.source === "tiktok")).toBe(true);
    expect(r.notes.some((n) => n.source === "youtube" && /heure de Paris/.test(n.text))).toBe(true);
    expect(subjectOf(r)).toBe("Café Nebula");
  });
});

describe("conseils de l'IA : aucun chiffre inventé", () => {
  const result = buildResult({}, full(), NOW);
  const facts = adviceFacts(result);

  it("les faits envoyés reprennent les chiffres du rapport", () => {
    expect(facts).toMatchObject({ score_global: result.score.global, youtube: { abonnes: 10_000 }, instagram: { abonnes: 5_000 } });
  });

  it("un paragraphe qui cite un chiffre absent des faits est écarté ; petits nombres et chiffres des faits acceptés", () => {
    const good = `Votre chaîne compte 10 000 abonnés et publie avec régularité : c'est un vrai atout. Gardez ce rythme et préparez 3 vidéos d'avance pour les semaines chargées, en soignant la miniature.`;
    const invented = `La moyenne du secteur est de 4,7 % d'engagement : vous êtes en dessous. Publiez davantage de vidéos courtes et répondez aux commentaires dans l'heure pour remonter ce chiffre rapidement.`;
    const short = "Trop court.";
    expect(keepFaithful([good, invented, short], facts)).toEqual([good]);
  });
});
