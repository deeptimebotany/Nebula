// Audit de présence — trois paragraphes de conseils écrits par Gemini
// (choix de Lucas : règles + Gemini). Serveur uniquement.
//
// L'IA ne reçoit que les faits CALCULÉS par Nebula (jamais les textes bruts
// des comptes) et doit ne citer que ces chiffres : chaque paragraphe est
// vérifié (garde « aucun chiffre inventé ») et écarté s'il contient un
// nombre absent des faits. Si Gemini ne répond pas, ou si tout est écarté,
// le rapport reste complet avec les recommandations par règles.
import { generateAuditParagraphs, isAiEnabled } from "@/lib/ai/gemini";
import { cadence, instagramEngagement, youtubeEngagement } from "./score";
import type { AuditAdvice, AuditResult } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct1 = (ratio: number | null) => (ratio === null ? null : round1(ratio * 100));

/** Faits compacts envoyés à l'IA (mêmes chiffres que ceux du rapport). */
export function adviceFacts(result: AuditResult): Record<string, unknown> {
  const now = new Date(result.analyzedAt);
  const facts: Record<string, unknown> = {
    score_global: result.score.global,
    niveau: result.score.label,
    axes: Object.fromEntries(result.score.axes.map((a) => [a.label, a.score])),
    recommandations_prioritaires: result.recommendations.slice(0, 5).map((r) => r.text)
  };
  const yt = result.sources.youtube?.facts;
  if (yt) {
    const cad = cadence(yt.videos.map((v) => v.publishedAt), now);
    const e = youtubeEngagement(yt, now);
    facts.youtube = {
      chaine: yt.title,
      abonnes: yt.subscribers,
      videos_analysees: yt.videos.length,
      ecart_median_jours: cad ? round1(cad.medianGap) : null,
      derniere_video_il_y_a_jours: cad ? Math.floor(cad.daysSinceLast) : null,
      plus_longue_pause_jours: cad ? round1(cad.longestGap) : null,
      vues_mediane: e.medianViews,
      vues_par_abonne_pct: pct1(e.viewsPerSub),
      jaime_par_vue_pct: pct1(e.likesPerView),
      commentaires_par_vue_pct: pct1(e.commentsPerView),
      vues_mediane_formats_courts: e.shortMedianViews,
      vues_mediane_formats_longs: e.longMedianViews,
      description_chaine_caracteres: yt.description.trim().length
    };
  }
  const ig = result.sources.instagram?.facts;
  if (ig) {
    const cad = cadence(ig.media.map((m) => m.timestamp), now);
    const e = instagramEngagement(ig);
    facts.instagram = {
      compte: ig.username,
      abonnes: ig.followers,
      publications_analysees: ig.media.length,
      ecart_median_jours: cad ? round1(cad.medianGap) : null,
      derniere_publication_il_y_a_jours: cad ? Math.floor(cad.daysSinceLast) : null,
      engagement_moyen_pct: pct1(e.rate),
      reels: ig.media.filter((m) => m.product === "REELS" || m.type === "VIDEO").length,
      lien_en_bio: Boolean(ig.website)
    };
  } else if (result.sources.instagram?.status === "private") {
    facts.instagram = { lisible: false, raison: "compte personnel ou introuvable" };
  }
  if (result.sources.tiktok?.facts) facts.tiktok = { trouve: true, statistiques_publiques: false };
  const web = result.sources.website?.facts;
  if (web) {
    facts.site = {
      domaine: web.host,
      https: web.https,
      adapte_mobile: web.viewport,
      description: Boolean(web.description),
      image_de_partage: web.ogImage,
      liens_vers: Object.keys(web.socialLinks)
    };
  }
  return facts;
}

const SYSTEM = [
  "Tu es consultant en présence en ligne pour des créateurs de contenu francophones.",
  "À partir des faits calculés (JSON), écris exactement 3 paragraphes de conseils, en français, en vouvoyant.",
  "Chaque paragraphe fait 50 à 110 mots, sans titre, sans liste, sans markdown, sans emoji.",
  "Règles strictes : cite UNIQUEMENT des chiffres présents dans les faits ; n'invente aucune moyenne, aucune statistique de secteur, aucune promesse de résultat ; ne cite aucune marque d'outil.",
  "Paragraphe 1 : le point fort du compte et son principal frein. Paragraphe 2 : un plan concret pour les deux prochaines semaines. Paragraphe 3 : un conseil de format ou de contenu pour la plateforme principale.",
  "Concentre-toi sur les axes aux scores les plus bas et sur les recommandations prioritaires."
].join("\n");

/** Nombres cités (« 1 250 », « 2,4 », « 18 ») sous forme normalisée. */
function numbersIn(text: string): number[] {
  return Array.from(text.matchAll(/\d{1,3}(?:[\s  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g)).map((m) => Number(m[0].replace(/[\s  ]/g, "").replace(",", ".")));
}

function allowedNumbers(facts: unknown): Set<string> {
  const out = new Set<string>();
  const addNum = (n: number) => {
    out.add(String(n));
    out.add(String(Math.round(n)));
    out.add(String(round1(n)));
    out.add(String(Math.floor(n)));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) addNum(v);
    else if (typeof v === "string") numbersIn(v).forEach(addNum);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(facts);
  return out;
}

/**
 * Garde « aucun chiffre inventé » : garde un paragraphe seulement si chaque
 * nombre qu'il cite vient des faits (les petits nombres entiers jusqu'à 10 —
 * « 3 publications », « 2 semaines » — sont libres).
 */
export function keepFaithful(paragraphs: string[], facts: unknown): string[] {
  const allowed = allowedNumbers(facts);
  return paragraphs.filter((p) => {
    if (p.length < 80 || p.length > 1_200) return false;
    return numbersIn(p).every((n) => (Number.isInteger(n) && n <= 10) || allowed.has(String(n)) || allowed.has(String(round1(n))));
  });
}

export async function generateAdvice(result: AuditResult): Promise<AuditAdvice | null> {
  if (!isAiEnabled() || result.score.global === null) return null;
  const facts = adviceFacts(result);
  const paragraphs = keepFaithful(await generateAuditParagraphs(SYSTEM, JSON.stringify(facts)), facts);
  if (paragraphs.length === 0) return null;
  return { paragraphs, generatedAt: new Date().toISOString() };
}
