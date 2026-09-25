// Audit de présence — score, constats et recommandations. Fonctions PURES
// (aucun réseau, aucune base) : testées dans tests/quality/audit.test.ts.
//
// Règle d'honnêteté (cadrage du 23/09/2026) : aucun chiffre inventé, aucune
// « moyenne du secteur ». Chaque note vient d'une règle affichée dans le
// rapport (« Pourquoi ce score »), avec des repères de bonnes pratiques
// choisis par Nebula, présentés comme tels. Une donnée manquante est dite
// manquante, jamais comptée zéro : un axe sans données est exclu du score
// global, et le rapport dit sur combien d'axes il repose.
import {
  scoreLabel,
  type AuditAxis,
  type AuditCheck,
  type AuditRecommendation,
  type AuditResult,
  type AuditSourceKey,
  type AuditSources,
  type AxisKey,
  type InstagramFacts,
  type YoutubeFacts
} from "./types";

const DAY = 86_400_000;
/** Vidéos de moins de 2 jours : leurs vues montent encore, elles ne comptent pas dans l'engagement. */
const FRESH_MS = 2 * DAY;
export const MIN_POSTS = 3;
export const MIN_FOLLOWERS = 100;
export const SHORT_MAX_SEC = 60;

export const AXES: { key: AxisKey; label: string; weight: number }[] = [
  { key: "profil", label: "Profil", weight: 20 },
  { key: "regularite", label: "Régularité", weight: 25 },
  { key: "engagement", label: "Engagement", weight: 25 },
  { key: "contenu", label: "Contenu", weight: 15 },
  { key: "coherence", label: "Cohérence", weight: 15 }
];

// --- Petits outils -----------------------------------------------------------

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const nf = (n: number, digits = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
/** « 2,4 % » (une décimale sous 10 %). */
export function pct(ratio: number): string {
  const p = ratio * 100;
  return `${nf(p, p < 1 ? 2 : p < 10 ? 1 : 0)} %`;
}
const days = (n: number) => `${nf(n, n < 10 ? 1 : 0)} jour${n >= 2 ? "s" : ""}`;
const plural = (n: number, word: string) => `${nf(n)} ${word}${n >= 2 ? "s" : ""}`;

function step(value: number, thresholds: [number, number][], otherwise: number): number {
  for (const [limit, score] of thresholds) if (value >= limit) return score;
  return otherwise;
}
function stepBelow(value: number, thresholds: [number, number][], otherwise: number): number {
  for (const [limit, score] of thresholds) if (value <= limit) return score;
  return otherwise;
}

function check(label: string, value: number | null, weight: number, detail: string, rule: string): AuditCheck {
  return { label, value: value === null ? null : Math.max(0, Math.min(1, value)), weight, detail, rule };
}

/** Pseudo comparable d'un réseau à l'autre (« Nebula.Studio » ≈ « nebula_studio »). */
export function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase().replace(/[._\-\s]/g, "");
}

/** Pages de liens (« link in bio ») : un profil qui y renvoie renvoie bien vers vos liens. */
const LINK_PAGE_HOSTS = ["linktr.ee", "beacons.ai", "linkin.bio", "lnk.bio", "bio.link", "taplink.cc", "allmylinks.com", "carrd.co", "campsite.bio", "linkfly.to", "solo.to", "hoo.be", "msha.ke", "nebulahub.space"];

export function isLinkPage(host: string | null): boolean {
  if (!host) return false;
  return LINK_PAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// --- Régularité ---------------------------------------------------------------

export interface Cadence {
  count: number;
  /** Écart médian entre deux publications, en jours. */
  medianGap: number;
  daysSinceLast: number;
  longestGap: number;
}

/** Rythme d'une liste de dates (de la plus récente à la plus ancienne). */
export function cadence(dates: string[], now: Date): Cadence | null {
  const times = dates.map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
  if (times.length < MIN_POSTS) return null;
  const gaps: number[] = [];
  for (let i = 0; i < times.length - 1; i++) gaps.push((times[i] - times[i + 1]) / DAY);
  return {
    count: times.length,
    medianGap: Math.max(0.1, median(gaps) ?? 0),
    daysSinceLast: Math.max(0, (now.getTime() - times[0]) / DAY),
    longestGap: Math.max(...gaps)
  };
}

function regularityChecks(platform: string, c: Cadence, unit: string): AuditCheck[] {
  const round = (n: number) => Math.round(n * 10) / 10;
  return [
    check(
      `${platform} · Rythme`,
      stepBelow(c.medianGap, [[3.5, 1], [7, 0.8], [14, 0.55], [30, 0.3]], 0.1),
      40,
      `Une ${unit} tous les ${days(round(c.medianGap))} (écart médian sur les ${c.count} dernières).`,
      "Une par semaine au moins ; deux ou plus, c'est encore mieux."
    ),
    check(
      `${platform} · Dernière publication`,
      stepBelow(c.daysSinceLast, [[7, 1], [14, 0.75], [30, 0.45], [60, 0.2]], 0),
      35,
      `Il y a ${days(Math.floor(c.daysSinceLast))}.`,
      "Moins de 7 jours."
    ),
    check(
      `${platform} · Constance`,
      c.longestGap <= Math.max(3 * c.medianGap, 7) ? 1 : c.longestGap <= Math.max(6 * c.medianGap, 14) ? 0.5 : 0,
      25,
      `Plus longue pause : ${days(round(c.longestGap))}.`,
      "Pas de pause de plus de 3 fois votre rythme habituel."
    )
  ];
}

// --- Engagement ---------------------------------------------------------------

export interface YoutubeEngagement {
  videos: number;
  medianViews: number | null;
  viewsPerSub: number | null;
  likesPerView: number | null;
  commentsPerView: number | null;
  shortMedianViews: number | null;
  longMedianViews: number | null;
  shorts: number;
  longs: number;
}

export function youtubeEngagement(yt: YoutubeFacts, now: Date): YoutubeEngagement {
  const settled = yt.videos.filter((v) => now.getTime() - new Date(v.publishedAt).getTime() >= FRESH_MS && v.views !== null);
  const viewed = settled.filter((v) => (v.views ?? 0) > 0);
  const medianViews = median(settled.map((v) => v.views as number));
  const shorts = settled.filter((v) => v.durationSec > 0 && v.durationSec <= SHORT_MAX_SEC);
  const longs = settled.filter((v) => v.durationSec > SHORT_MAX_SEC);
  const likes = viewed.filter((v) => v.likes !== null);
  const comments = viewed.filter((v) => v.comments !== null);
  return {
    videos: settled.length,
    medianViews,
    viewsPerSub: medianViews !== null && yt.subscribers !== null && yt.subscribers >= MIN_FOLLOWERS ? medianViews / yt.subscribers : null,
    likesPerView: likes.length >= MIN_POSTS ? median(likes.map((v) => (v.likes as number) / (v.views as number))) : null,
    commentsPerView: comments.length >= MIN_POSTS ? median(comments.map((v) => (v.comments as number) / (v.views as number))) : null,
    shortMedianViews: shorts.length >= 2 ? median(shorts.map((v) => v.views as number)) : null,
    longMedianViews: longs.length >= 2 ? median(longs.map((v) => v.views as number)) : null,
    shorts: shorts.length,
    longs: longs.length
  };
}

/** Engagement Instagram : moyenne de (j'aime + commentaires) / abonnés, sur les publications dont les j'aime sont visibles. */
export function instagramEngagement(ig: InstagramFacts): { rate: number | null; posts: number } {
  const visible = ig.media.filter((m) => m.likes !== null);
  if (ig.followers === null || ig.followers < MIN_FOLLOWERS || visible.length < MIN_POSTS) return { rate: null, posts: visible.length };
  const rates = visible.map((m) => ((m.likes ?? 0) + (m.comments ?? 0)) / (ig.followers as number));
  return { rate: rates.reduce((a, b) => a + b, 0) / rates.length, posts: visible.length };
}

// --- Axes -----------------------------------------------------------------------

function profileChecks(s: AuditSources): AuditCheck[] {
  const out: AuditCheck[] = [];
  const yt = s.youtube?.facts;
  if (yt) {
    const len = yt.description.trim().length;
    out.push(check("YouTube · Description de la chaîne", len >= 150 ? 1 : len >= 50 ? 0.5 : 0, 30, len ? `${plural(len, "caractère")}.` : "Aucune description.", "150 caractères ou plus."));
    out.push(check("YouTube · Bannière", yt.bannerUrl ? 1 : 0, 20, yt.bannerUrl ? "Présente." : "Absente.", "Une bannière qui dit ce que publie la chaîne."));
    out.push(check("YouTube · Mots-clés de la chaîne", yt.keywords ? 1 : 0, 15, yt.keywords ? "Renseignés." : "Aucun.", "Quelques mots-clés sur vos thèmes."));
    out.push(check("YouTube · Adresse personnalisée", yt.handle ? 1 : 0, 15, yt.handle ? `${yt.handle}.` : "Aucune.", "Un @pseudo court et facile à retenir."));
    out.push(
      check(
        "YouTube · Lien dans la description",
        /(https?:\/\/|www\.)\S+/i.test(yt.description) ? 1 : 0,
        20,
        /(https?:\/\/|www\.)\S+/i.test(yt.description) ? "Présent." : "Aucun lien.",
        "Un lien vers votre site ou votre page de liens."
      )
    );
  }
  const ig = s.instagram?.facts;
  if (ig) {
    const len = ig.biography.trim().length;
    out.push(check("Instagram · Bio", len >= 30 ? 1 : len > 0 ? 0.5 : 0, 35, len ? `${plural(len, "caractère")}.` : "Vide.", "Une phrase qui dit qui vous êtes et ce que vous publiez (30 caractères ou plus)."));
    out.push(check("Instagram · Lien dans la bio", ig.website ? 1 : 0, 35, ig.website ? `${hostOf(ig.website) ?? ig.website}.` : "Aucun.", "Un lien vers votre site ou votre page de liens."));
    out.push(check("Instagram · Nom affiché", ig.name ? 1 : 0, 15, ig.name ? `« ${ig.name} ».` : "Aucun.", "Un nom lisible, pas seulement le pseudo."));
    out.push(check("Instagram · Photo de profil", ig.avatarUrl ? 1 : 0, 15, ig.avatarUrl ? "Présente." : "Absente.", "Une photo ou un logo net."));
  }
  const tt = s.tiktok?.facts;
  if (tt) {
    out.push(check("TikTok · Description du profil", tt.bio ? 1 : 0, 20, tt.bio ? "Renseignée." : "Vide ou non publique.", "Une phrase qui dit ce que vous publiez."));
  }
  const web = s.website?.facts;
  if (web) {
    const tl = web.title?.length ?? 0;
    const dl = web.description?.length ?? 0;
    out.push(check("Site · Titre de la page", tl >= 10 && tl <= 70 ? 1 : tl > 0 ? 0.5 : 0, 25, tl ? `${plural(tl, "caractère")}.` : "Absent.", "Entre 10 et 70 caractères."));
    out.push(check("Site · Description (moteurs de recherche)", dl >= 50 && dl <= 160 ? 1 : dl > 0 ? 0.5 : 0, 25, dl ? `${plural(dl, "caractère")}.` : "Absente.", "Entre 50 et 160 caractères."));
    out.push(check("Site · Image de partage", web.ogImage ? 1 : 0, 15, web.ogImage ? "Présente." : "Absente.", "Une image affichée quand le lien est partagé (og:image)."));
    out.push(check("Site · Adapté au mobile", web.viewport ? 1 : 0, 20, web.viewport ? "Oui (viewport)." : "Pas de réglage mobile (viewport).", "La page s'adapte à l'écran du téléphone."));
    out.push(check("Site · Connexion sécurisée", web.https ? 1 : 0, 15, web.https ? "HTTPS." : "Pas de HTTPS.", "Adresse en https://."));
  }
  return out;
}

function regularityAxisChecks(s: AuditSources, now: Date): AuditCheck[] {
  const out: AuditCheck[] = [];
  const yt = s.youtube?.facts;
  const ytCad = yt ? cadence(yt.videos.map((v) => v.publishedAt), now) : null;
  if (ytCad) out.push(...regularityChecks("YouTube", ytCad, "vidéo"));
  const ig = s.instagram?.facts;
  const igCad = ig ? cadence(ig.media.map((m) => m.timestamp), now) : null;
  if (igCad) out.push(...regularityChecks("Instagram", igCad, "publication"));
  return out;
}

function engagementAxisChecks(s: AuditSources, now: Date): AuditCheck[] {
  const out: AuditCheck[] = [];
  const yt = s.youtube?.facts;
  if (yt) {
    const e = youtubeEngagement(yt, now);
    if (e.videos >= MIN_POSTS) {
      out.push(
        check(
          "YouTube · Vues par rapport aux abonnés",
          e.viewsPerSub === null ? null : step(e.viewsPerSub, [[0.3, 1], [0.1, 0.75], [0.03, 0.45], [0.01, 0.2]], 0.05),
          50,
          e.viewsPerSub === null
            ? yt.subscribers === null
              ? "Nombre d'abonnés masqué par la chaîne : non calculé."
              : `Moins de ${MIN_FOLLOWERS} abonnés : non calculé.`
            : `Vues médianes : ${nf(e.medianViews ?? 0)} pour ${nf(yt.subscribers ?? 0)} abonnés (${pct(e.viewsPerSub)}).`,
          "Repère Nebula : 10 % ou plus, excellent au-delà de 30 %."
        )
      );
      out.push(
        check(
          "YouTube · J'aime par vue",
          e.likesPerView === null ? null : step(e.likesPerView, [[0.04, 1], [0.02, 0.7], [0.01, 0.4]], 0.15),
          25,
          e.likesPerView === null ? "J'aime masqués : non calculé." : `${pct(e.likesPerView)} (médiane).`,
          "Repère Nebula : 2 % ou plus."
        )
      );
      out.push(
        check(
          "YouTube · Commentaires par vue",
          e.commentsPerView === null ? null : step(e.commentsPerView, [[0.005, 1], [0.002, 0.65], [0.0005, 0.35]], 0.1),
          25,
          e.commentsPerView === null ? "Commentaires désactivés : non calculé." : `${pct(e.commentsPerView)} (médiane).`,
          "Repère Nebula : 0,2 % ou plus."
        )
      );
    }
  }
  const ig = s.instagram?.facts;
  if (ig) {
    const e = instagramEngagement(ig);
    if (e.rate !== null) {
      out.push(
        check(
          "Instagram · Engagement moyen",
          step(e.rate, [[0.03, 1], [0.015, 0.75], [0.007, 0.5], [0.003, 0.25]], 0.1),
          100,
          `${pct(e.rate)} : (j'aime + commentaires) / abonnés, moyenne des ${e.posts} dernières publications.`,
          "Repère Nebula : 1,5 % ou plus, excellent au-delà de 3 %."
        )
      );
    }
  }
  return out;
}

function contentAxisChecks(s: AuditSources): AuditCheck[] {
  const out: AuditCheck[] = [];
  const yt = s.youtube?.facts;
  if (yt && yt.videos.length >= MIN_POSTS) {
    const n = yt.videos.length;
    const longTitles = yt.videos.filter((v) => v.title.length > 70).length;
    const shortDesc = yt.videos.filter((v) => v.descriptionLength < 100).length;
    out.push(
      check(
        "YouTube · Titres courts",
        (n - longTitles) / n,
        50,
        longTitles ? `${nf(longTitles)} titre${longTitles > 1 ? "s" : ""} sur ${nf(n)} dépasse${longTitles > 1 ? "nt" : ""} 70 caractères.` : `Les ${nf(n)} titres font 70 caractères ou moins.`,
        "70 caractères au plus : au-delà, le titre est coupé dans les résultats."
      )
    );
    out.push(
      check(
        "YouTube · Descriptions des vidéos",
        (n - shortDesc) / n,
        50,
        shortDesc ? `${nf(shortDesc)} vidéo${shortDesc > 1 ? "s" : ""} sur ${nf(n)} ont moins de 100 caractères de description.` : "Toutes les descriptions font 100 caractères ou plus.",
        "100 caractères ou plus, avec les mots que votre public cherche."
      )
    );
  }
  const ig = s.instagram?.facts;
  if (ig && ig.media.length >= MIN_POSTS) {
    const n = ig.media.length;
    const reels = ig.media.filter((m) => m.product === "REELS" || m.type === "VIDEO").length;
    const written = ig.media.filter((m) => m.captionLength >= 50).length;
    const tagged = ig.media.filter((m) => m.hashtags >= 1 && m.hashtags <= 10).length;
    out.push(check("Instagram · Part de Reels", step(reels / n, [[0.3, 1], [0.1, 0.5]], 0.2), 40, `${nf(reels)} Reel${reels > 1 ? "s" : ""} sur les ${nf(n)} dernières publications.`, "Repère Nebula : au moins 3 publications sur 10 en vidéo."));
    out.push(check("Instagram · Légendes rédigées", written / n, 30, `${nf(written)} légende${written > 1 ? "s" : ""} sur ${nf(n)} font 50 caractères ou plus.`, "Une légende qui donne du contexte (50 caractères ou plus)."));
    out.push(check("Instagram · Hashtags", tagged / n, 30, `${nf(tagged)} publication${tagged > 1 ? "s" : ""} sur ${nf(n)} ont entre 1 et 10 hashtags.`, "Quelques hashtags précis (entre 1 et 10)."));
  }
  return out;
}

function coherenceAxisChecks(s: AuditSources): AuditCheck[] {
  const out: AuditCheck[] = [];
  const handles: { network: string; handle: string }[] = [];
  if (s.youtube?.facts?.handle) handles.push({ network: "YouTube", handle: s.youtube.facts.handle.replace(/^@/, "") });
  if (s.instagram?.facts) handles.push({ network: "Instagram", handle: s.instagram.facts.username });
  if (s.tiktok?.facts) handles.push({ network: "TikTok", handle: s.tiktok.facts.username });
  if (handles.length >= 2) {
    const counts = new Map<string, number>();
    for (const h of handles) counts.set(normalizeHandle(h.handle), (counts.get(normalizeHandle(h.handle)) ?? 0) + 1);
    const best = Math.max(...counts.values());
    out.push(
      check(
        "Même pseudo partout",
        counts.size === 1 ? 1 : best >= 2 ? 0.5 : 0,
        35,
        handles.map((h) => `${h.network} : @${h.handle}`).join(" · ") + ".",
        "Un même pseudo sur chaque réseau (au point ou au tiret près)."
      )
    );
  }
  const web = s.website?.facts;
  if (web) {
    const expected: { key: "youtube" | "instagram" | "tiktok"; label: string; handle: string | null }[] = [];
    if (s.youtube?.facts) expected.push({ key: "youtube", label: "YouTube", handle: s.youtube.facts.handle?.replace(/^@/, "").toLowerCase() ?? null });
    if (s.instagram?.facts) expected.push({ key: "instagram", label: "Instagram", handle: s.instagram.facts.username.toLowerCase() });
    if (s.tiktok?.facts) expected.push({ key: "tiktok", label: "TikTok", handle: s.tiktok.facts.username.toLowerCase() });
    if (expected.length > 0) {
      const linked = expected.filter((e) => {
        const link = web.socialLinks[e.key];
        if (!link) return false;
        // Un lien YouTube peut viser la chaîne par son identifiant (UC…) plutôt que son @pseudo : tout lien vers YouTube compte.
        return link === true || !e.handle || e.key === "youtube" || normalizeHandle(link) === normalizeHandle(e.handle);
      });
      const missing = expected.filter((e) => !linked.includes(e)).map((e) => e.label);
      out.push(
        check(
          "Le site renvoie vers vos réseaux",
          linked.length / expected.length,
          35,
          missing.length ? `Pas de lien vers : ${missing.join(", ")}.` : "Liens présents vers chaque réseau analysé.",
          "Un lien vers chaque réseau (souvent en pied de page)."
        )
      );
    }
    const back: { label: string; ok: boolean }[] = [];
    const descLinks = (d: string) => Array.from(d.matchAll(/(?:https?:\/\/|www\.)[^\s)]+/gi)).map((m) => hostOf(m[0]));
    if (s.youtube?.facts) {
      const hosts = descLinks(s.youtube.facts.description);
      back.push({ label: "YouTube", ok: hosts.some((h) => h === web.host || isLinkPage(h)) || s.youtube.facts.description.toLowerCase().includes(web.host) });
    }
    if (s.instagram?.facts) {
      const h = hostOf(s.instagram.facts.website);
      back.push({ label: "Instagram", ok: h === web.host || isLinkPage(h) });
    }
    if (back.length > 0) {
      const missing = back.filter((b) => !b.ok).map((b) => b.label);
      out.push(
        check(
          "Vos profils renvoient vers le site",
          (back.length - missing.length) / back.length,
          30,
          missing.length ? `Pas de lien vers ${web.host} sur : ${missing.join(", ")}.` : `Chaque profil renvoie vers ${web.host}.`,
          "Le même site (ou la même page de liens) dans chaque profil."
        )
      );
    }
  }
  return out;
}

function axisFrom(key: AxisKey, checks: AuditCheck[], missing: string): AuditAxis {
  const meta = AXES.find((a) => a.key === key)!;
  const counted = checks.filter((c) => c.value !== null);
  const total = counted.reduce((n, c) => n + c.weight, 0);
  const score = total > 0 ? Math.round((100 * counted.reduce((n, c) => n + c.weight * (c.value as number), 0)) / total) : null;
  return { key, label: meta.label, weight: meta.weight, score, checks, ...(score === null ? { missing } : {}) };
}

export function computeAxes(s: AuditSources, now: Date): AuditAxis[] {
  return [
    axisFrom("profil", profileChecks(s), "Aucun profil lisible."),
    axisFrom("regularite", regularityAxisChecks(s, now), `Il faut au moins ${MIN_POSTS} publications datées sur YouTube ou sur un compte Instagram professionnel.`),
    axisFrom("engagement", engagementAxisChecks(s, now), `Il faut au moins ${MIN_POSTS} publications avec leurs vues ou leurs j'aime, et ${MIN_FOLLOWERS} abonnés.`),
    axisFrom("contenu", contentAxisChecks(s), `Il faut au moins ${MIN_POSTS} publications YouTube ou Instagram.`),
    axisFrom("coherence", coherenceAxisChecks(s), "Il faut au moins deux sources lisibles (deux réseaux, ou un réseau et un site).")
  ];
}

/** Axes calculés nécessaires pour un score global (un seul axe ne dirait rien de la présence). */
export const MIN_AXES = 2;

export function globalScore(axes: AuditAxis[]): { global: number | null; label: string | null; basedOn: number } {
  const counted = axes.filter((a) => a.score !== null);
  if (counted.length < MIN_AXES) return { global: null, label: null, basedOn: counted.length };
  const total = counted.reduce((n, a) => n + a.weight, 0);
  const global = Math.round(counted.reduce((n, a) => n + a.weight * (a.score as number), 0) / total);
  return { global, label: scoreLabel(global), basedOn: counted.length };
}

// --- Recommandations ------------------------------------------------------------

export function recommendations(s: AuditSources, now: Date): AuditRecommendation[] {
  const out: AuditRecommendation[] = [];
  const add = (key: string, axis: AxisKey, priority: 1 | 2 | 3, text: string) => out.push({ key, axis, priority, text });
  const round = (n: number) => Math.round(n * 10) / 10;

  const yt = s.youtube?.facts;
  const ig = s.instagram?.facts;
  const web = s.website?.facts;

  for (const [platform, cad, unit] of [
    ["YouTube", yt ? cadence(yt.videos.map((v) => v.publishedAt), now) : null, "vidéo"],
    ["Instagram", ig ? cadence(ig.media.map((m) => m.timestamp), now) : null, "publication"]
  ] as const) {
    if (!cad) continue;
    const last = Math.floor(cad.daysSinceLast);
    if (cad.daysSinceLast > Math.max(14, 2 * cad.medianGap)) {
      add(
        `${platform}-recence`,
        "regularite",
        3,
        `Votre dernière ${unit} ${platform} date de ${days(last)}, alors que votre rythme habituel est d'une tous les ${days(round(cad.medianGap))}. Programmez la prochaine dès cette semaine : la régularité compte plus que le volume.`
      );
    } else if (cad.medianGap > 7.5) {
      add(`${platform}-rythme`, "regularite", 2, `Sur ${platform}, vous publiez une ${unit} tous les ${days(round(cad.medianGap))} (écart médian). Visez au moins une par semaine, programmée à l'avance.`);
    }
    if (cad.longestGap > Math.max(6 * cad.medianGap, 21)) {
      add(`${platform}-pause`, "regularite", 1, `Votre plus longue pause sur ${platform} a duré ${days(round(cad.longestGap))}. Gardez 2 ou 3 publications d'avance pour les semaines chargées.`);
    }
  }

  if (yt) {
    const len = yt.description.trim().length;
    if (len < 150) add("yt-description", "profil", 2, `La description de votre chaîne fait ${plural(len, "caractère")}. Allongez-la à 150 au moins : ce que vous publiez, à quel rythme, et les mots que votre public cherche.`);
    if (!yt.bannerUrl) add("yt-banniere", "profil", 1, "Ajoutez une bannière à votre chaîne : c'est la première chose vue en arrivant, elle doit dire ce que vous publiez.");
    // Avec un site analysé, la cohérence le dit déjà (« Aucun lien vers … sur YouTube »).
    if (!web && !/(https?:\/\/|www\.)\S+/i.test(yt.description)) add("yt-lien", "profil", 1, "Ajoutez un lien dans la description de la chaîne (votre site ou votre page de liens).");
    const e = youtubeEngagement(yt, now);
    if (e.viewsPerSub !== null && e.viewsPerSub < 0.1) {
      add(
        "yt-vues",
        "engagement",
        3,
        `Vos vidéos font ${nf(e.medianViews ?? 0)} vues (médiane), soit ${pct(e.viewsPerSub)} de vos ${nf(yt.subscribers ?? 0)} abonnés. Travaillez la miniature et les 5 premières secondes : ce sont elles qui décident du clic et de la suite.`
      );
    }
    if (e.commentsPerView !== null && e.commentsPerView < 0.002) {
      add("yt-commentaires", "engagement", 2, `Les commentaires représentent ${pct(e.commentsPerView)} des vues. Terminez vos vidéos par une question précise et épinglez un commentaire qui lance la discussion.`);
    }
    if (e.shortMedianViews !== null && e.longMedianViews !== null) {
      const [better, worse] = e.shortMedianViews >= e.longMedianViews ? ["formats courts", "vidéos longues"] : ["vidéos longues", "formats courts"];
      const ratio = Math.max(e.shortMedianViews, e.longMedianViews) / Math.max(1, Math.min(e.shortMedianViews, e.longMedianViews));
      if (ratio >= 2) add("yt-formats", "contenu", 1, `Vos ${better} font ${nf(round(ratio))} fois plus de vues que vos ${worse} (médianes). Servez-vous-en pour faire découvrir les autres.`);
    }
    const n = yt.videos.length;
    const longTitles = yt.videos.filter((v) => v.title.length > 70).length;
    if (n >= MIN_POSTS && longTitles / n > 0.3) {
      add("yt-titres", "contenu", 2, `${nf(longTitles)} de vos ${nf(n)} derniers titres dépassent 70 caractères et sont coupés dans les résultats. Placez l'idée forte au début.`);
    }
    const shortDesc = yt.videos.filter((v) => v.descriptionLength < 100).length;
    if (n >= MIN_POSTS && shortDesc / n > 0.5) {
      add("yt-descriptions", "contenu", 1, `${nf(shortDesc)} de vos ${nf(n)} dernières vidéos ont une description de moins de 100 caractères. Deux ou trois phrases avec vos mots-clés aident YouTube à les proposer.`);
    }
  }

  if (s.instagram?.status === "private") {
    add("ig-pro", "profil", 3, "Votre compte Instagram n'a pas pu être lu : s'il est personnel, passez-le en compte professionnel Créateur (gratuit). Vous aurez vos statistiques, et votre compte deviendra analysable.");
  }
  if (ig) {
    if (!ig.website) add("ig-lien", "profil", 2, "Ajoutez un lien dans votre bio Instagram : votre site, ou une page qui regroupe vos liens.");
    if (ig.biography.trim().length < 30) add("ig-bio", "profil", 2, "Écrivez une bio Instagram qui dit en une phrase ce que vous publiez et pour qui.");
    const e = instagramEngagement(ig);
    if (e.rate !== null && e.rate < 0.015) {
      add("ig-engagement", "engagement", 2, `Votre engagement moyen sur Instagram est de ${pct(e.rate)}. Posez une question dans la légende et répondez aux premiers commentaires dans l'heure.`);
    }
    const n = ig.media.length;
    const reels = ig.media.filter((m) => m.product === "REELS" || m.type === "VIDEO").length;
    if (n >= MIN_POSTS && reels / n < 0.3) add("ig-reels", "contenu", 2, `${nf(reels)} de vos ${nf(n)} dernières publications Instagram sont des vidéos. Essayez un Reel par semaine : c'est le format le plus montré aux non-abonnés.`);
    const tagged = ig.media.filter((m) => m.hashtags >= 1 && m.hashtags <= 10).length;
    if (n >= MIN_POSTS && tagged / n < 0.5) add("ig-hashtags", "contenu", 1, "Ajoutez 3 à 5 hashtags précis à vos légendes Instagram (votre thème, votre ville, votre communauté).");
  }

  if (web) {
    if (!web.https) add("site-https", "profil", 3, "Votre site n'est pas en HTTPS : les navigateurs l'affichent « non sécurisé ». Activez le certificat gratuit de votre hébergeur.");
    if (!web.viewport) add("site-mobile", "profil", 3, "Votre page n'est pas réglée pour le téléphone (balise viewport absente) : la plupart de vos visiteurs viennent des réseaux, donc du mobile.");
    if (!web.description) add("site-description", "profil", 2, "Ajoutez une description à votre page (balise meta description, 50 à 160 caractères) : c'est le texte affiché sous votre lien dans Google.");
    if (!web.ogImage) add("site-image", "profil", 1, "Ajoutez une image de partage (og:image) : sans elle, votre lien s'affiche sans visuel sur les réseaux et les messageries.");
    if (web.noindex) add("site-noindex", "profil", 2, "Votre page demande aux moteurs de recherche de ne pas l'indexer (noindex). Retirez cette consigne si vous voulez être trouvé sur Google.");
    if (web.textLength < 200) add("site-texte", "contenu", 1, "Votre page contient très peu de texte lisible sans JavaScript : les moteurs de recherche et les aperçus de liens la voient presque vide.");
  }

  for (const c of coherenceAxisChecks(s)) {
    if (c.value === null || c.value >= 1) continue;
    if (c.label === "Même pseudo partout") add("coherence-pseudo", "coherence", 1, `Vos pseudos diffèrent d'un réseau à l'autre (${c.detail.replace(/\.$/, "")}). Un même nom partout aide à vous retrouver.`);
    if (c.label === "Le site renvoie vers vos réseaux") {
      const list = c.detail.replace(/^Pas de lien vers : /, "").replace(/\.$/, "");
      add("coherence-liens-site", "coherence", 2, `Votre site ne renvoie pas vers ${list}. Ajoutez ces liens, par exemple en pied de page.`);
    }
    if (c.label === "Vos profils renvoient vers le site" && web) {
      const list = c.detail.replace(/^Pas de lien vers [^ ]+ sur : /, "").replace(/\.$/, "");
      add("coherence-liens-profils", "coherence", 2, `Aucun lien vers ${web.host} sur ${list}. Mettez le même lien dans chaque profil.`);
    }
  }

  // Les plus importantes d'abord, 8 au plus (l'ordre des règles départage).
  return out.map((r, i) => ({ r, i })).sort((a, b) => b.r.priority - a.r.priority || a.i - b.i).slice(0, 8).map(({ r }) => r);
}

// --- Constats non notés ------------------------------------------------------------

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function parisParts(date: string): { day: number; hour: number } | null {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return day < 0 ? null : { day, hour };
}

function mode(values: number[]): { value: number; count: number } | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { value: number; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best;
}

function habitNote(platform: string, dates: string[]): string | null {
  const parts = dates.map(parisParts).filter((p): p is { day: number; hour: number } => p !== null);
  if (parts.length < MIN_POSTS + 2) return null;
  const day = mode(parts.map((p) => p.day));
  const hour = mode(parts.map((p) => p.hour));
  if (!day || !hour || day.count < 2) return null;
  return `${platform} : vous publiez surtout le ${WEEKDAYS[day.value]} (${day.count} sur ${parts.length}), le plus souvent vers ${hour.value} h (heure de Paris).`;
}

export function notes(s: AuditSources, now: Date): AuditResult["notes"] {
  const out: AuditResult["notes"] = [];
  const yt = s.youtube?.facts;
  if (yt) {
    const habit = habitNote("YouTube", yt.videos.map((v) => v.publishedAt));
    if (habit) out.push({ source: "youtube", text: habit });
    const e = youtubeEngagement(yt, now);
    if (e.shortMedianViews !== null && e.longMedianViews !== null) {
      out.push({ source: "youtube", text: `Vues médianes : ${nf(e.shortMedianViews)} pour les formats courts (1 min ou moins, ${e.shorts} vidéos), ${nf(e.longMedianViews)} pour les plus longues (${e.longs} vidéos).` });
    }
  }
  const ig = s.instagram?.facts;
  if (ig) {
    const habit = habitNote("Instagram", ig.media.map((m) => m.timestamp));
    if (habit) out.push({ source: "instagram", text: habit });
  }
  if (s.tiktok?.status === "ok") {
    out.push({ source: "tiktok", text: "TikTok ne rend publiques ni les vues ni les abonnés : ils ne comptent pas dans ce score. Connectez le compte à Nebula pour les suivre." });
  }
  return out;
}

// --- Rapport complet -----------------------------------------------------------------

export function buildResult(input: AuditResult["input"], sources: AuditSources, now: Date): AuditResult {
  const axes = computeAxes(sources, now);
  return {
    version: 1,
    analyzedAt: now.toISOString(),
    input,
    sources,
    score: { ...globalScore(axes), axes },
    recommendations: recommendations(sources, now),
    notes: notes(sources, now)
  };
}

/** Sources lues avec succès. */
export function readableSources(sources: AuditSources): AuditSourceKey[] {
  return (Object.keys(sources) as AuditSourceKey[]).filter((k) => sources[k]?.status === "ok");
}
