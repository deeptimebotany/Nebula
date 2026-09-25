// Audit de présence : lecture de ce que le visiteur colle (adresse complète,
// « @pseudo » ou pseudo seul) — importable navigateur et serveur, sans
// réseau. Chaque champ renvoie une valeur normalisée ou un message d'erreur
// en français, affiché sous le champ.
import type { AuditInput, YoutubeRef } from "./types";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const clean = (raw: string) => raw.trim().replace(/^<|>$/g, "");

/** Adresse d'un réseau (avec ou sans https://) ; un pseudo seul n'en est pas une (« jean.co » est un pseudo Instagram valide). */
function asUrl(raw: string): URL | null {
  const text = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : /^(www\.|m\.|mobile\.)?(youtube\.com|youtu\.be|instagram\.com|instagr\.am|tiktok\.com)(\/|$)/i.test(raw)
      ? `https://${raw}`
      : null;
  if (!text) return null;
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function hostIs(url: URL, domains: string[]): boolean {
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
  return domains.includes(host);
}

const YT_HANDLE = /^[A-Za-z0-9._-]{3,30}$/;
const YT_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/** Chaîne YouTube : youtube.com/@pseudo, /channel/UC…, /user/nom, /c/nom, « @pseudo ». */
export function parseYoutube(raw: string): Parsed<YoutubeRef> {
  const text = clean(raw);
  const url = asUrl(text);
  if (url) {
    if (!hostIs(url, ["youtube.com", "youtu.be"])) return { ok: false, error: "Collez l'adresse de la chaîne (youtube.com/@…) ou son @pseudo." };
    if (hostIs(url, ["youtu.be"]) || url.pathname.startsWith("/watch") || url.pathname.startsWith("/shorts/")) {
      return { ok: false, error: "C'est l'adresse d'une vidéo : collez celle de la chaîne (youtube.com/@…)." };
    }
    const [first, second] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (first?.startsWith("@") && YT_HANDLE.test(first.slice(1))) return { ok: true, value: { kind: "handle", value: first.slice(1) } };
    if (first === "channel" && second && YT_CHANNEL_ID.test(second)) return { ok: true, value: { kind: "id", value: second } };
    if (first === "user" && second && /^[A-Za-z0-9]{1,40}$/.test(second)) return { ok: true, value: { kind: "username", value: second } };
    // Anciennes adresses personnalisées (/c/nom) : YouTube les a converties en @pseudo le plus souvent.
    if (first === "c" && second && YT_HANDLE.test(second)) return { ok: true, value: { kind: "handle", value: second } };
    return { ok: false, error: "Adresse de chaîne non reconnue : essayez youtube.com/@pseudo." };
  }
  const handle = text.replace(/^@/, "");
  if (YT_CHANNEL_ID.test(handle)) return { ok: true, value: { kind: "id", value: handle } };
  if (YT_HANDLE.test(handle)) return { ok: true, value: { kind: "handle", value: handle } };
  return { ok: false, error: "Pseudo YouTube invalide (3 à 30 lettres, chiffres, points, tirets)." };
}

const IG_USER = /^(?!.*\.\.)[A-Za-z0-9._]{1,30}$/;

/** Compte Instagram : instagram.com/pseudo, « @pseudo » ou pseudo. */
export function parseInstagram(raw: string): Parsed<string> {
  const text = clean(raw);
  const url = asUrl(text);
  let user = text.replace(/^@/, "");
  if (url) {
    if (!hostIs(url, ["instagram.com", "instagr.am"])) return { ok: false, error: "Collez l'adresse du compte (instagram.com/…) ou son @pseudo." };
    const [first] = url.pathname.split("/").filter(Boolean);
    if (!first || ["p", "reel", "reels", "stories", "explore", "tv"].includes(first)) {
      return { ok: false, error: "C'est l'adresse d'une publication : collez celle du compte (instagram.com/pseudo)." };
    }
    user = first;
  }
  user = user.replace(/\/$/, "");
  if (!IG_USER.test(user)) return { ok: false, error: "Pseudo Instagram invalide (lettres, chiffres, points et _)." };
  return { ok: true, value: user.toLowerCase() };
}

const TT_USER = /^[A-Za-z0-9._]{2,24}$/;

/** Compte TikTok : tiktok.com/@pseudo, « @pseudo » ou pseudo. */
export function parseTiktok(raw: string): Parsed<string> {
  const text = clean(raw);
  const url = asUrl(text);
  let user = text.replace(/^@/, "");
  if (url) {
    if (!hostIs(url, ["tiktok.com"])) return { ok: false, error: "Collez l'adresse du compte (tiktok.com/@…) ou son @pseudo." };
    const [first] = url.pathname.split("/").filter(Boolean);
    if (!first?.startsWith("@")) return { ok: false, error: "Adresse de compte non reconnue : essayez tiktok.com/@pseudo." };
    user = first.slice(1);
  }
  if (!TT_USER.test(user)) return { ok: false, error: "Pseudo TikTok invalide (lettres, chiffres, points et _)." };
  return { ok: true, value: user.toLowerCase() };
}

/** Site ou page bio : toujours analysé en https (un site sans https le dira). */
export function parseWebsite(raw: string): Parsed<string> {
  const text = clean(raw);
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "Adresse de site invalide." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Adresse de site invalide (http ou https)." };
  if (url.username || url.password) return { ok: false, error: "L'adresse ne doit pas contenir d'identifiants." };
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".localhost") || /^[\d.]+$/.test(host) || host.includes(":")) {
    return { ok: false, error: "Adresse de site invalide : un nom de domaine public est attendu (exemple.fr)." };
  }
  if (["youtube.com", "www.youtube.com", "instagram.com", "www.instagram.com", "tiktok.com", "www.tiktok.com"].includes(host)) {
    return { ok: false, error: "Ce champ attend votre site ou votre page de liens : les réseaux ont leur propre champ." };
  }
  url.protocol = "https:";
  url.hash = "";
  return { ok: true, value: url.toString() };
}

export interface RawAuditInput {
  youtube?: string;
  instagram?: string;
  tiktok?: string;
  website?: string;
}

export type InputErrors = Partial<Record<keyof RawAuditInput, string>>;

/** Lit tous les champs : entrées normalisées, ou erreurs par champ. Au moins un champ est requis. */
export function parseAuditInput(raw: RawAuditInput): { ok: true; input: AuditInput } | { ok: false; errors: InputErrors; message: string } {
  const errors: InputErrors = {};
  const input: AuditInput = {};
  const filled = (v?: string) => typeof v === "string" && v.trim().length > 0;
  if (filled(raw.youtube)) {
    const r = parseYoutube(raw.youtube!);
    if (r.ok) input.youtube = r.value;
    else errors.youtube = r.error;
  }
  if (filled(raw.instagram)) {
    const r = parseInstagram(raw.instagram!);
    if (r.ok) input.instagram = r.value;
    else errors.instagram = r.error;
  }
  if (filled(raw.tiktok)) {
    const r = parseTiktok(raw.tiktok!);
    if (r.ok) input.tiktok = r.value;
    else errors.tiktok = r.error;
  }
  if (filled(raw.website)) {
    const r = parseWebsite(raw.website!);
    if (r.ok) input.website = r.value;
    else errors.website = r.error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors, message: "Vérifiez les champs signalés." };
  if (Object.keys(input).length === 0) return { ok: false, errors: {}, message: "Renseignez au moins un compte ou un site." };
  return { ok: true, input };
}

/** Clé stable des entrées (cache de 24 h) : mêmes comptes → même clé, quel que soit l'ordre de saisie. */
export function inputKeyText(input: AuditInput): string {
  return JSON.stringify({
    youtube: input.youtube ? `${input.youtube.kind}:${input.youtube.kind === "id" ? input.youtube.value : input.youtube.value.toLowerCase()}` : null,
    instagram: input.instagram ?? null,
    tiktok: input.tiktok ?? null,
    website: input.website ? input.website.toLowerCase().replace(/\/$/, "") : null
  });
}
