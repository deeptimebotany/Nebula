// Bilan du mois (03/10/2026) : l'e-mail (HTML + texte). Fichier PUR, testé
// seul. Mise en page en tableaux et styles en ligne (Gmail, Outlook, Apple
// Mail), largeur 600 px, lisible sur téléphone ; graphiques en barres HTML
// (aucune image à part le logo et les miniatures) ; moins de 102 Ko (au-delà,
// Gmail coupe le message).
import { NETWORK_NAMES, frNumber, pctText, signed } from "./build";
import { dayLabel, ofMonth } from "./period";
import { boldSegments, plainText, type MonthlySummaryData } from "./types";

export interface SummaryLinks {
  logoUrl: string;
  bilanUrl: string;
  calendarUrl: string;
  engagementsUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
  billingUrl: string;
}

const INK = "#111827";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const BORDER = "#e5e7eb";
const VIOLET = "#8646ff";
const VIOLET_DARK = "#5b21b6";
const VIOLET_SOFT = "#f3eeff";
const LINK = "#6a2fe0";
const UP = "#047857";
const DOWN = "#b91c1c";
const LOSS = "#c4c4cc";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** Pastille de réseau sur fond blanc (TikTok et Threads : noir, leur cyan ou gris clair ne se verrait pas). */
const DOT: Record<string, string> = {
  INSTAGRAM: "#E1306C",
  FACEBOOK: "#1877F2",
  TIKTOK: "#111111",
  YOUTUBE: "#FF0000",
  BLUESKY: "#1185FE",
  THREADS: "#111111",
  PINTEREST: "#E60023",
  LINKEDIN: "#0A66C2"
};

function esc(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function href(url: string): string {
  return /^(https?:|mailto:)/.test(url) ? esc(url) : "#";
}

/** Phrase avec **gras** → HTML échappé. */
function rich(text: string): string {
  return boldSegments(text)
    .map((s) => (s.bold ? `<strong style="color:${INK}">${esc(s.text)}</strong>` : esc(s.text)))
    .join("");
}

function netName(n: string): string {
  return NETWORK_NAMES[n] ?? n;
}

function chip(network: string, label?: string): string {
  return `<span style="white-space:nowrap;font-size:12px;color:${TEXT}"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${DOT[network] ?? "#6b7280"};margin-right:6px;vertical-align:1px"></span>${esc(label ?? netName(network))}</span>`;
}

/** Compte d'un tableau : réseau sur une ligne, nom du compte dessous (peut passer à la ligne sur téléphone). */
function accountCell(network: string, name: string): string {
  return `${chip(network)}<br><span style="font-size:12px;color:${FAINT};word-break:break-word">${esc(name)}</span>`;
}

/** ▲ +22 % vs août (couleur doublée d'une flèche et d'un signe : jamais la couleur seule). */
function delta(p: number | null, note = ""): string {
  if (p === null || !Number.isFinite(p)) return note ? `<span style="color:${FAINT}">${esc(note)}</span>` : "";
  const good = p >= 0;
  return `<span style="color:${good ? UP : DOWN};font-weight:600">${good ? "▲" : "▼"} ${esc(pctText(p))}</span>${note ? ` <span style="color:${FAINT}">${esc(note)}</span>` : ""}`;
}

function deltaCount(diff: number | null, unit: string, note: string): string {
  if (diff === null) return "";
  if (diff === 0) return `<span style="color:${MUTED}">= autant</span> <span style="color:${FAINT}">${esc(note)}</span>`;
  const good = diff > 0;
  return `<span style="color:${good ? UP : DOWN};font-weight:600">${good ? "▲" : "▼"} ${esc(`${frNumber(Math.abs(diff))} ${unit}${Math.abs(diff) > 1 ? "s" : ""} de ${good ? "plus" : "moins"}`)}</span> <span style="color:${FAINT}">${esc(note)}</span>`;
}

function section(kicker: string, title: string, body: string): string {
  return `<tr><td style="padding:28px 28px 0">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${LINK};font-weight:700">${esc(kicker)}</p>
<h2 style="margin:0 0 14px;font-size:19px;line-height:1.3;color:${INK}">${esc(title)}</h2>
${body}
</td></tr>`;
}

/** Barres par jour : gains au-dessus de la ligne de base, pertes en gris en dessous. */
function bars(values: number[], month: string, height: number, highlight: number | null): string {
  const pos = Math.max(0, ...values);
  const neg = Math.max(0, ...values.map((v) => -v));
  const total = pos + neg || 1;
  const upH = Math.max(1, Math.round((height * pos) / total));
  const downH = neg > 0 ? height - upH : 0;
  const up = values
    .map((v, i) => {
      const h = v > 0 && pos ? Math.max(2, Math.round((upH * v) / pos)) : 0;
      const color = i === highlight ? VIOLET_DARK : VIOLET;
      return `<td valign="bottom" style="padding:0 1px;height:${upH}px">${h ? `<div style="height:${h}px;line-height:${h}px;font-size:0;background:${color};border-radius:2px 2px 0 0">&nbsp;</div>` : ""}</td>`;
    })
    .join("");
  const down = downH
    ? `<tr>${values
        .map((v) => {
          const h = v < 0 ? Math.max(2, Math.round((downH * -v) / neg)) : 0;
          return `<td valign="top" style="padding:0 1px;height:${downH}px">${h ? `<div style="height:${h}px;line-height:${h}px;font-size:0;background:${LOSS};border-radius:0 0 2px 2px">&nbsp;</div>` : ""}</td>`;
        })
        .join("")}</tr>`
    : "";
  const n = values.length;
  const axis = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:4px"><tr>
<td style="font-size:10px;color:${FAINT}">${esc(dayLabel(month, 0))}</td>
<td align="center" style="font-size:10px;color:${FAINT}">${esc(dayLabel(month, 14))}</td>
<td align="right" style="font-size:10px;color:${FAINT}">${esc(dayLabel(month, n - 1))}</td></tr></table>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed"><tr>${up}</tr><tr><td colspan="${n}" style="height:1px;line-height:1px;font-size:0;background:${BORDER}">&nbsp;</td></tr>${down}</table>${axis}`;
}

function kpi(label: string, value: string, sub: string, deltaHtml: string): string {
  return `<td width="50%" valign="top" style="padding:6px"><div style="border:1px solid ${BORDER};border-radius:12px;padding:14px 14px 12px">
<p style="margin:0;font-size:12px;color:${MUTED}">${esc(label)}</p>
<p style="margin:4px 0 2px;font-size:26px;line-height:1.15;font-weight:700;color:${INK};white-space:nowrap">${esc(value)}</p>
<p style="margin:0 0 6px;font-size:12px;color:${TEXT}">${esc(sub)}</p>
<p style="margin:0;font-size:12px">${deltaHtml || "&nbsp;"}</p></div></td>`;
}

function table(head: string[], rows: string[][]): string {
  const h = head.map((t, i) => `<td align="${i === 0 ? "left" : "right"}" style="padding:0 0 6px;font-size:11px;color:${FAINT}">${esc(t)}</td>`).join("");
  const body = rows
    .map((cells, r) => {
      const border = r === rows.length - 1 ? "" : `border-bottom:1px solid ${BORDER};`;
      return `<tr>${cells.map((c, i) => `<td align="${i === 0 ? "left" : "right"}" style="padding:9px 0 9px ${i === 0 ? 0 : 8}px;${border}font-size:13px;color:${i === 1 ? INK : TEXT};${i === 1 ? "font-weight:600;" : ""}${i === 0 ? "" : "white-space:nowrap"}">${c}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px"><tr>${h}</tr>${body}</table>`;
}

function rate(p: number | null): string {
  return p === null ? "—" : `${(Math.round(p * 10) / 10).toLocaleString("fr-FR")} %`;
}

function compact(n: number | null): string {
  return n === null ? "—" : frNumber(n);
}

/** Objet de l'e-mail : la marque, le mois et le chiffre qui parle le plus. */
export function summarySubject(d: MonthlySummaryData): string {
  const headline =
    d.followers.gain !== null && d.followers.gain > 0
      ? `${signed(d.followers.gain)} abonné${d.followers.gain > 1 ? "s" : ""}`
      : d.views.total !== null && d.views.total > 0
        ? `${frNumber(d.views.total)} vues`
        : d.publications.count > 0
          ? `${d.publications.count} publication${d.publications.count > 1 ? "s" : ""}`
          : "vos chiffres";
  return `${d.brand.name} · votre bilan ${ofMonth(d.month)} : ${headline}`;
}

export function renderSummaryEmail(d: MonthlySummaryData, links: SummaryLinks): { subject: string; html: string; text: string } {
  const prev = d.previousName;
  const vs = d.firstReport ? "" : `vs ${prev}`;
  const networks = Array.from(new Set(d.accounts.map((a) => netName(a.network)))).join(", ");
  const preheader = plainText(d.essentials[0] ?? `Vos chiffres ${ofMonth(d.month)}`);
  const parts: string[] = [];

  // En-tête
  parts.push(`<tr><td style="background:#0e0e10;border-radius:16px 16px 0 0;padding:22px 28px 26px">
<img src="${href(links.logoUrl)}" width="130" height="36" alt="Nebula" style="display:block;border:0;outline:none;width:130px;height:36px">
<p style="margin:22px 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c4b2ff;font-weight:700">Votre bilan du mois</p>
<h1 style="margin:0;font-size:28px;line-height:1.2;color:#ffffff">${esc(d.monthTitle)}</h1>
<p style="margin:8px 0 0;font-size:14px;color:#c9c9d1">${esc(d.brand.name)}${networks ? ` · ${esc(networks)}` : ""}${d.firstReport ? "" : ` · comparé à ${esc(prev)}`}</p>
</td></tr>`);

  // L'essentiel
  if (d.essentials.length) {
    parts.push(`<tr><td style="padding:24px 28px 0"><div style="background:${VIOLET_SOFT};border-radius:12px;padding:16px 18px">
<p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${LINK};letter-spacing:.06em;text-transform:uppercase">L'essentiel</p>
<p style="margin:0;font-size:15px;line-height:1.55;color:${TEXT}">${d.essentials.map(rich).join(" ")}</p></div></td></tr>`);
  }

  // 4 chiffres clés
  const f = d.followers;
  const v = d.views;
  const it = d.interactions;
  const pub = d.publications;
  const gainPct = f.gain !== null && f.prevGain !== null && f.prevGain > 0 && f.gain > 0 ? ((f.gain - f.prevGain) / f.prevGain) * 100 : null;
  parts.push(`<tr><td style="padding:16px 22px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
${kpi("Abonnés", compact(f.total), f.gain !== null ? `${signed(f.gain)} ce mois` : "pas encore de relevé", gainPct !== null ? delta(gainPct, `de gain ${vs}`) : "")}
${kpi("Vues", compact(v.total), v.total !== null ? `${v.rows.filter((r) => r.total !== null).length} compte${v.rows.filter((r) => r.total !== null).length > 1 ? "s" : ""}` : "non communiquées", delta(v.pct, vs))}
</tr><tr>
${kpi("Interactions", compact(it.total), "j'aime, commentaires, partages, enregistrements", delta(it.pct, vs))}
${kpi("Publications", String(pub.count), `${pub.online} mise${pub.online > 1 ? "s" : ""} en ligne · ${pub.activeDays.length} jour${pub.activeDays.length > 1 ? "s" : ""} actif${pub.activeDays.length > 1 ? "s" : ""}`, pub.prevCount !== null ? deltaCount(pub.count - pub.prevCount, "publication", vs) : "")}
</tr></table></td></tr>`);

  // Abonnés
  if (f.rows.length) {
    const intro = `Gagnés chaque jour${f.daily && f.daily.some((x) => x < 0) ? " (en gris : jours de pertes)" : ""}.${f.bestDay ? ` Meilleur jour : <strong style="color:${INK}">${esc(f.bestDay.label)}, ${esc(signed(f.bestDay.gain))}</strong>.` : ""}`;
    parts.push(
      section(
        "Abonnés",
        `${f.gain !== null ? signed(f.gain) : compact(f.total)} abonné${Math.abs(f.gain ?? 2) > 1 ? "s" : ""}`,
        `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${MUTED}">${intro}</p>
${f.daily ? bars(f.daily, d.month, 70, f.bestDay?.dayIndex ?? null) : ""}
${table(
  ["Compte", "Abonnés", "Gagnés", "Évolution"],
  f.rows.map((r) => [accountCell(r.network, r.name), esc(frNumber(r.total)), esc(r.gain !== null ? signed(r.gain) : "—"), delta(r.pct)])
)}`
      )
    );
  }

  // Vues
  if (v.total !== null) {
    const dailyNote = v.daily ? `Vues par jour sur ${v.dailyNetworks.map(netName).join(", ")}. ` : "";
    parts.push(
      section(
        "Vues",
        `${frNumber(v.total)} vues`,
        `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${MUTED}">${esc(dailyNote + v.notes.join(" "))}</p>
${v.daily ? bars(v.daily, d.month, 60, null) : ""}
${table(
  ["Compte", "Vues", "Part", "Évolution"],
  v.rows.map((r) => [accountCell(r.network, r.name), esc(compact(r.total)), esc(r.share !== null ? `${Math.round(r.share)} %` : "—"), delta(r.pct)])
)}`
      )
    );
  }

  // Engagement
  if (it.total !== null) {
    const tiles = [
      [it.likes, "J'aime"],
      [it.comments, "Commentaires"],
      [it.shares, "Partages"],
      [it.saves, "Enregistrements"]
    ] as const;
    const cells = tiles
      .map(
        ([value, label], i) =>
          `<td width="50%" style="padding:0 ${i % 2 === 0 ? 4 : 0}px 8px ${i % 2 === 0 ? 0 : 4}px"><div style="border:1px solid ${BORDER};border-radius:10px;padding:10px 12px 9px"><p style="margin:0;font-size:18px;font-weight:700;color:${INK};white-space:nowrap">${esc(compact(value))}</p><p style="margin:2px 0 0;font-size:11px;color:${MUTED}">${esc(label)}</p></div></td>${i === 1 ? "</tr><tr>" : ""}`
      )
      .join("");
    parts.push(
      section(
        "Engagement",
        `${frNumber(it.total)} interactions`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells}</tr></table>
${it.note ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:${TEXT}">${rich(it.note)}</p>` : ""}
<p style="margin:8px 0 0;font-size:12px;color:${FAINT}">Sur les publications mises en ligne ${esc(ofMonth(d.month))}, telles que les réseaux les donnent.</p>`
      )
    );
  }

  // Publications
  if (pub.online > 0) {
    const active = new Set(pub.activeDays);
    const strip = Array.from({ length: d.days }, (_, i) => `<td style="padding:1px"><div style="height:16px;line-height:16px;font-size:0;border-radius:3px;background:${active.has(i) ? VIOLET : "#f1f1f4"}">&nbsp;</div></td>`).join("");
    const kinds = [pub.videos ? `**${pub.videos} vidéo${pub.videos > 1 ? "s" : ""}**` : "", pub.photos ? `**${pub.photos} photo${pub.photos > 1 ? "s" : ""}**` : "", pub.others ? `${pub.others} autre${pub.others > 1 ? "s" : ""}` : ""].filter(Boolean);
    const perNet = pub.perNetwork.map((x) => `${netName(x.network)} ${x.count}`).join(", ");
    parts.push(
      section(
        "Publications",
        `${pub.count} publication${pub.count > 1 ? "s" : ""}`,
        `<p style="margin:0 0 8px;font-size:13px;color:${MUTED}">Vos jours de publication : <strong style="color:${INK}">${pub.activeDays.length} jour${pub.activeDays.length > 1 ? "s" : ""} sur ${d.days}</strong>${pub.prevActiveDays !== null ? ` (${pub.prevActiveDays} en ${esc(prev)})` : ""}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed"><tr>${strip}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:4px"><tr><td style="font-size:10px;color:${FAINT}">${esc(dayLabel(d.month, 0))}</td><td align="right" style="font-size:10px;color:${FAINT}">${esc(dayLabel(d.month, d.days - 1))}</td></tr></table>
<p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:${TEXT}">${rich(`${kinds.join(" et ")}${kinds.length ? ", " : ""}mises en ligne ${pub.online} fois : ${perNet}.`)}${pub.online > pub.count ? " Une publication sur plusieurs réseaux compte une fois." : ""}</p>`
      )
    );
  }

  // Top 3
  if (d.top.length) {
    const rows = d.top
      .map((t, i) => {
        const thumb = t.thumbnailUrl
          ? `<img src="${href(t.thumbnailUrl)}" width="56" height="56" alt="" style="display:block;border-radius:10px;width:56px;height:56px;object-fit:cover">`
          : `<div style="width:56px;height:56px;line-height:56px;border-radius:10px;background:#f1f1f4;text-align:center;font-size:20px;font-weight:700;color:${DOT[t.network] ?? MUTED}">${esc((netName(t.network)[0] ?? "?").toUpperCase())}</div>`;
        const stats = [t.views !== null ? `<strong>${esc(frNumber(t.views))}</strong> vues` : "", t.interactions !== null ? `<strong>${esc(frNumber(t.interactions))}</strong> interactions` : "", t.rate !== null ? `${esc(rate(t.rate))} d'engagement` : ""].filter(Boolean).join(" &nbsp;·&nbsp; ");
        return `<tr><td style="padding:10px 0;${i < d.top.length - 1 ? `border-bottom:1px solid ${BORDER};` : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
<td width="22" valign="top" style="font-size:20px;font-weight:700;color:${VIOLET};padding-top:14px">${i + 1}</td>
<td width="66" valign="top">${thumb}</td>
<td valign="top" style="padding-left:4px"><p style="margin:0 0 3px;font-size:14px;line-height:1.35;font-weight:600;color:${INK}">${esc(t.title)}</p>
<p style="margin:0 0 6px;font-size:12px;color:${MUTED}">${chip(t.network)} &nbsp;·&nbsp; ${esc(t.dayLabel)}</p>
<p style="margin:0;font-size:12px;color:${TEXT}">${stats}${t.url ? ` &nbsp;<a href="${href(t.url)}" style="color:${LINK}">Voir</a>` : ""}</p></td></tr></table></td></tr>`;
      })
      .join("");
    parts.push(
      section(
        "Top du mois",
        d.top.length > 1 ? `Vos ${d.top.length} meilleures publications` : "Votre meilleure publication",
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
<p style="margin:10px 0 0;font-size:12px;color:${MUTED}">Publications du mois classées par vues, comptées depuis leur mise en ligne. Toutes vos publications sont dans <a href="${href(links.engagementsUrl)}" style="color:${LINK}">Engagements</a>.</p>`
      )
    );
  }

  // Ce qui a marché
  if (d.insights.length) {
    parts.push(
      section(
        "À retenir",
        "Ce qui a marché",
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${d.insights
          .map((t, i) => `<tr><td width="22" valign="top" style="padding:9px 0;font-size:12px;color:${VIOLET}">${i + 1}.</td><td style="padding:8px 0;font-size:14px;line-height:1.5;color:${TEXT}">${rich(t)}</td></tr>`)
          .join("")}</table>`
      )
    );
  }

  // Communauté et page bio
  if (d.community || d.bio) {
    const boxes: string[] = [];
    if (d.community) {
      boxes.push(`<div style="border:1px solid ${BORDER};border-radius:12px;padding:14px"><p style="margin:0;font-size:22px;font-weight:700;color:${INK}">${esc(frNumber(d.community.comments))}</p>
<p style="margin:2px 0 6px;font-size:12px;color:${MUTED}">commentaire${d.community.comments > 1 ? "s" : ""} reçu${d.community.comments > 1 ? "s" : ""} dans Nebula</p>
<p style="margin:0;font-size:12px;color:${TEXT}">${d.community.replies > 0 ? `${esc(frNumber(d.community.replies))} réponse${d.community.replies > 1 ? "s" : ""} de votre part${d.community.comments > 0 ? ` (${Math.round((d.community.replies / d.community.comments) * 100)} %)` : ""}` : "Répondez-leur depuis la page Commentaires."}</p></div>`);
    }
    if (d.bio) {
      boxes.push(`<div style="border:1px solid ${BORDER};border-radius:12px;padding:14px"><p style="margin:0;font-size:22px;font-weight:700;color:${INK}">${esc(frNumber(d.bio.delta ?? d.bio.total))}</p>
<p style="margin:2px 0 6px;font-size:12px;color:${MUTED}">clic${(d.bio.delta ?? d.bio.total) > 1 ? "s" : ""} sur votre page bio</p>
<p style="margin:0;font-size:12px;color:${TEXT}">${d.bio.delta !== null ? `depuis le dernier bilan · ${esc(frNumber(d.bio.total))} au total` : "au total, depuis sa création"}</p></div>`);
    }
    const cells = boxes.map((b, i) => `<td width="${boxes.length > 1 ? "50%" : "100%"}" valign="top" style="padding:0 ${i === 0 && boxes.length > 1 ? 6 : 0}px 0 ${i === 1 ? 6 : 0}px">${b}</td>`).join("");
    parts.push(section("Autour de vos publications", d.community && d.bio ? "Communauté et page bio" : d.community ? "Communauté" : "Page bio", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells}</tr></table>`));
  }

  // Réussites
  if (d.reussites) {
    const r = d.reussites;
    const bits = [`**+${frNumber(r.xp)} XP**`, r.missions ? `**${r.missions} mission${r.missions > 1 ? "s" : ""}** réussie${r.missions > 1 ? "s" : ""}` : "", r.badges.length ? `nouveau${r.badges.length > 1 ? "x" : ""} badge${r.badges.length > 1 ? "s" : ""} ${r.badges.map((b) => `**« ${b} »**`).join(", ")}` : ""].filter(Boolean);
    const next = r.nextRank && r.xpToNext !== null && r.xpToNext > 0 ? ` Encore **${frNumber(r.xpToNext)} XP** pour passer **${r.nextRank}**.` : "";
    parts.push(section("Progression", "Vos Réussites", `<p style="margin:0;font-size:14px;line-height:1.6;color:${TEXT}">${rich(`${bits.join(" · ")}.${next}`)}</p>`));
  }

  // Mois suivant
  const nm = d.nextMonth;
  const rhythm =
    nm.missing > 0
      ? `Pour garder votre rythme ${ofMonth(d.month)} (${pub.activeDays.length} jour${pub.activeDays.length > 1 ? "s" : ""} de publication), il manque ${nm.missing} jour${nm.missing > 1 ? "s" : ""}${nm.suggestion ? `, ${nm.suggestion}` : ""}.`
      : pub.activeDays.length > 0
        ? "Votre rythme est déjà tenu : bravo."
        : "Programmez quelques publications pour bien démarrer le mois.";
  parts.push(`<tr><td style="padding:28px 28px 0"><div style="border:1px solid #d9ccff;border-radius:14px;padding:18px 18px 20px">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${LINK};font-weight:700">${esc(nm.title)}</p>
<p style="margin:0 0 6px;font-size:17px;font-weight:700;color:${INK}">${nm.scheduled ? `${nm.scheduled} publication${nm.scheduled > 1 ? "s" : ""} déjà programmée${nm.scheduled > 1 ? "s" : ""}` : "Rien de programmé pour l'instant"}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${TEXT}">${nm.scheduled ? `${nm.days} jour${nm.days > 1 ? "s" : ""} couvert${nm.days > 1 ? "s" : ""} sur ${nm.daysInMonth}. ` : ""}${esc(rhythm)}</p>
<a href="${href(links.calendarUrl)}" style="display:inline-block;background:${VIOLET};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px">Planifier mon mois ${esc(ofMonth(nm.key))}</a>
<p style="margin:12px 0 0;font-size:13px"><a href="${href(links.bilanUrl)}" style="color:${LINK}">Voir le bilan complet dans Nebula</a></p>
</div></td></tr>`);

  // Encart Pro (Gratuit)
  if (d.upsell) {
    parts.push(`<tr><td style="padding:20px 28px 0"><div style="background:#0e0e10;border-radius:14px;padding:18px 18px 20px">
<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#ffffff">Allez plus loin avec Pro</p>
<p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:#c9c9d1">Plusieurs marques, 8 comptes par marque, l'assistant IA, l'analyse de rétention de vos vidéos, les rapports clients automatiques et un calendrier client à partager.</p>
<a href="${href(links.billingUrl)}" style="display:inline-block;background:#ffffff;color:${INK};text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600;font-size:14px">Voir les paliers</a>
</div></td></tr>`);
  }

  // Pied de page
  parts.push(`<tr><td style="padding:24px 28px 26px">
<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${FAINT}">Chiffres relevés chaque jour par les API officielles des réseaux. YouTube corrige parfois ses chiffres pendant 2 à 3 jours : votre bilan part donc le 3 du mois.</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${FAINT}">Vous recevez ce bilan parce que vous l'avez activé. <a href="${href(links.unsubscribeUrl)}" style="color:${FAINT}">Ne plus le recevoir</a> · <a href="${href(links.settingsUrl)}" style="color:${FAINT}">Réglages</a></p>
</td></tr>`);

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(summarySubject(d))}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<div style="background:#f4f4f7;padding:24px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:separate;font-family:${FONT};background:#ffffff;border-radius:16px;border:1px solid ${BORDER}">
${parts.join("\n")}
</table></div></body></html>`;

  return { subject: summarySubject(d), html, text: renderSummaryText(d, links) };
}

/** Version texte (clients sans HTML, accessibilité). */
export function renderSummaryText(d: MonthlySummaryData, links: SummaryLinks): string {
  const lines: string[] = [`Votre bilan du mois : ${d.monthTitle} · ${d.brand.name}`, ""];
  for (const e of d.essentials) lines.push(plainText(e));
  lines.push("");
  const f = d.followers;
  lines.push(`Abonnés : ${compact(f.total)}${f.gain !== null ? ` (${signed(f.gain)} ce mois)` : ""}`);
  lines.push(`Vues : ${compact(d.views.total)}${d.views.pct !== null ? ` (${pctText(d.views.pct)} vs ${d.previousName})` : ""}`);
  lines.push(`Interactions : ${compact(d.interactions.total)}${d.interactions.pct !== null ? ` (${pctText(d.interactions.pct)})` : ""}`);
  lines.push(`Publications : ${d.publications.count} (${d.publications.online} mises en ligne, ${d.publications.activeDays.length} jours actifs)`);
  if (f.rows.length) {
    lines.push("", "Abonnés par compte :");
    for (const r of f.rows) lines.push(`- ${netName(r.network)} ${r.name} : ${frNumber(r.total)} (${r.gain !== null ? signed(r.gain) : "—"})`);
  }
  if (d.views.total !== null) {
    lines.push("", "Vues par compte :");
    for (const r of d.views.rows) lines.push(`- ${netName(r.network)} ${r.name} : ${compact(r.total)}`);
    for (const n of d.views.notes) lines.push(n);
  }
  if (d.top.length) {
    lines.push("", "Vos meilleures publications :");
    d.top.forEach((t, i) => lines.push(`${i + 1}. ${t.title} (${netName(t.network)}, ${t.dayLabel}) : ${compact(t.views)} vues${t.url ? ` · ${t.url}` : ""}`));
  }
  if (d.insights.length) {
    lines.push("", "Ce qui a marché :");
    for (const t of d.insights) lines.push(`- ${plainText(t)}`);
  }
  if (d.community) lines.push("", `Commentaires reçus : ${d.community.comments} (${d.community.replies} réponses)`);
  if (d.bio) lines.push(`Clics sur la page bio : ${d.bio.delta ?? d.bio.total}`);
  lines.push("", `${d.nextMonth.title} : ${d.nextMonth.scheduled ? `${d.nextMonth.scheduled} publication${d.nextMonth.scheduled > 1 ? "s" : ""} déjà programmée${d.nextMonth.scheduled > 1 ? "s" : ""}` : "rien de programmé pour l'instant"}.`, `Planifier : ${links.calendarUrl}`);
  lines.push("", `Bilan complet : ${links.bilanUrl}`, `Ne plus recevoir ce bilan : ${links.unsubscribeUrl}`);
  return lines.join("\n");
}
