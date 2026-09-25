// Habillage de marque des e-mails (nouvelle identité, logo R4, 24/09/2026) :
// bandeau sombre avec le logo en haut, corps blanc, boutons au violet de la
// marque. Partagé par emailLayout (emails du brief growth, cycle de vie,
// partenaires) et par les gabarits historiques de src/lib/email.ts.
//
// Le logo est une image PNG hébergée sur le site (public/email/nebula-logo.png,
// 390 × 108 px affichée en 130 × 36 pour les écrans haute densité) : Gmail et
// Outlook n'affichent pas le SVG. Son fond est le même noir que le bandeau
// (#0e0e10), pour rester correct même si un client mail ignore la couleur de
// fond du bandeau.
import { SITE_URL } from "@/lib/site";

export const EMAIL_COLORS = {
  /** Boutons : texte blanc 4,9:1. */
  button: "#8646ff",
  /** Liens dans le texte, sur blanc : 6,8:1. */
  link: "#6a2fe0",
  banner: "#0e0e10",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb"
} as const;

export function emailLogoUrl(): string {
  return `${SITE_URL}/email/nebula-logo.png`;
}

/**
 * Adresse d'un lien d'e-mail, sûre à placer dans href="…" (audit sécurité,
 * lot 1) : http(s) ou mailto uniquement, guillemets et chevrons échappés.
 * Avant, une adresse construite avec une valeur envoyée par un visiteur
 * pouvait fermer l'attribut et injecter ses propres liens dans un e-mail
 * parti de Nebula. Une adresse refusée devient le site Nebula.
 */
export function safeEmailHref(url: string): string {
  let ok = false;
  try {
    const parsed = new URL(url);
    ok = parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
  } catch {
    ok = false;
  }
  const value = ok ? url : SITE_URL;
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bouton d'appel à l'action (libellé déjà échappé). */
export function emailButton(label: string, url: string): string {
  return `<a href="${safeEmailHref(url)}" style="display:inline-block;background:${EMAIL_COLORS.button};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px">${label}</a>`;
}

/** Lien dans le texte, à la couleur de la marque. */
export function emailLink(label: string, url: string): string {
  return `<a href="${safeEmailHref(url)}" style="color:${EMAIL_COLORS.link}">${label}</a>`;
}

/**
 * Cadre complet d'un e-mail : bandeau logo + contenu (HTML déjà échappé).
 * Largeur 480 px comme les e-mails historiques.
 */
export function emailFrame(inner: string): string {
  return `<div style="background:#f4f4f7;padding:24px 12px">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;color:${EMAIL_COLORS.text}">
    <div style="background:${EMAIL_COLORS.banner};border-radius:14px 14px 0 0;padding:18px 24px">
      <a href="${SITE_URL}" style="text-decoration:none"><img src="${emailLogoUrl()}" width="130" height="36" alt="Nebula" style="display:block;border:0;outline:none;width:130px;height:36px"></a>
    </div>
    <div style="background:#ffffff;border:1px solid ${EMAIL_COLORS.border};border-top:0;border-radius:0 0 14px 14px;padding:26px 24px 24px">
      ${inner}
    </div>
  </div>
</div>`;
}
