// Attribution d'acquisition — helpers PURS (sans Prisma), importés par
// src/middleware.ts (runtime Edge : aucune base de données ici) et par
// src/lib/growth.ts côté serveur Node. Voir growth.ts pour le contexte.

/** Cookie posé par src/middleware.ts dès qu'une URL porte un paramètre
 *  d'attribution ; lu puis supprimé à l'inscription. */
export const ATTRIBUTION_COOKIE = "nb_attr";
export const ATTRIBUTION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  /** Slug de la marque apporteuse (badge « Propulsé par Nebula »). */
  via?: string;
  /** Code de parrainage. */
  ref?: string;
  /** Chemin de la page d'atterrissage. */
  landing?: string;
  /** Horodatage (ms) du premier contact. */
  ts?: number;
}

const ATTRIBUTION_PARAMS: [keyof Attribution, string][] = [
  ["source", "utm_source"],
  ["medium", "utm_medium"],
  ["campaign", "utm_campaign"],
  ["content", "utm_content"],
  ["via", "via"],
  ["ref", "ref"]
];

function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim().slice(0, 80);
  // Lettres, chiffres, tirets, points, underscores : rien d'autre ne finit
  // dans un cookie ni en base.
  return /^[\w.\-]+$/.test(v) ? v : undefined;
}

/** Attribution portée par l'URL courante (undefined si aucun paramètre). */
export function attributionFromSearchParams(params: URLSearchParams, landing: string): Attribution | null {
  const attr: Attribution = {};
  let any = false;
  for (const [key, param] of ATTRIBUTION_PARAMS) {
    const v = clean(params.get(param));
    if (v) {
      attr[key] = v as never;
      any = true;
    }
  }
  if (!any) return null;
  attr.landing = landing.slice(0, 120);
  attr.ts = Date.now();
  return attr;
}

export function parseAttributionCookie(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Attribution;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeAttribution(attr: Attribution): string {
  return encodeURIComponent(JSON.stringify(attr));
}

/** Champs à écrire sur User à l'inscription. */
export function attributionToUserFields(attr: Attribution | null) {
  if (!attr) return {};
  return {
    acqSource: attr.source ?? null,
    acqMedium: attr.medium ?? null,
    acqCampaign: attr.campaign ?? null,
    acqContent: attr.content ?? null,
    acqVia: attr.via ?? null,
    acqLanding: attr.landing ?? null,
    acqAt: attr.ts ? new Date(attr.ts) : new Date()
  };
}
