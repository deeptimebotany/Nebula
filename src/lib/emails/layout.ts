// Habillage commun des emails du brief growth (récompenses, cycle de vie) —
// même cadre que les emails historiques de src/lib/email.ts (bandeau logo +
// boutons violets de la nouvelle identité, voir emails/brand.ts), un seul
// appel à l'action, signature « Lucas, Nebula ». Tout le texte passé ici doit
// DÉJÀ être échappé (escapeHtml).
import { EMAIL_COLORS, emailButton, emailFrame } from "./brand";

export interface EmailLayoutInput {
  title: string;
  /** Paragraphes (HTML déjà échappé ; <strong> autorisé). */
  paragraphs: string[];
  cta?: { label: string; url: string } | null;
  /** Lignes secondaires sous le bouton (HTML déjà échappé). */
  footnotes?: string[];
  signature?: boolean;
  /** Lien de désinscription (emails de conseils uniquement). */
  unsubscribeUrl?: string | null;
}

export function emailLayout(input: EmailLayoutInput): string {
  const paragraphs = input.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${EMAIL_COLORS.text}">${p}</p>`).join("");
  const cta = input.cta ? `<p style="margin:22px 0">${emailButton(input.cta.label, input.cta.url)}</p>` : "";
  const footnotes = (input.footnotes ?? []).map((f) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${EMAIL_COLORS.muted}">${f}</p>`).join("");
  const signature = input.signature ? `<p style="margin:22px 0 0;font-size:15px;color:${EMAIL_COLORS.text}">Lucas, Nebula</p>` : "";
  const unsubscribe = input.unsubscribeUrl
    ? `<p style="margin:26px 0 0;font-size:12px;color:#9ca3af">Vous recevez ce conseil parce que vous avez un compte Nebula. <a href="${input.unsubscribeUrl}" style="color:#9ca3af">Ne plus recevoir ces conseils</a>.</p>`
    : "";
  return emailFrame(`<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#111827">${input.title}</h1>
      ${paragraphs}
      ${cta}
      ${footnotes}
      ${signature}
      ${unsubscribe}`);
}

/** Version texte brut d'un email construit avec emailLayout (accessibilité,
 *  clients sans HTML). */
export function emailPlainText(input: EmailLayoutInput): string {
  const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const lines = [strip(input.title), "", ...input.paragraphs.map(strip)];
  if (input.cta) lines.push("", `${strip(input.cta.label)} : ${input.cta.url}`);
  if (input.footnotes?.length) lines.push("", ...input.footnotes.map(strip));
  if (input.signature) lines.push("", "Lucas, Nebula");
  if (input.unsubscribeUrl) lines.push("", `Ne plus recevoir ces conseils : ${input.unsubscribeUrl}`);
  return lines.join("\n");
}
