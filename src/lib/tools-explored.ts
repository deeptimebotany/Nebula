// Badge « Explorateur » (Réussites v2, lot C ; choix de Lucas :
// petit cookie technique). Un visiteur qui essaie 2 outils gratuits de
// /outils avant de s'inscrire reçoit le badge à la création de son compte.
//
// Cookie « nb_tools » (30 jours, première partie, SameSite=Lax) : SEULEMENT
// les noms des outils essayés (« legendes.hashtags »), rien d'autre — ni
// identifiant, ni adresse, ni tiers. Lu à l'inscription (e-mail ou
// connexion rapide) pour remplir User.toolsExplored. Décrit dans les
// mentions légales (section Cookies). Importable client et serveur.

export const TOOLS_COOKIE = "nb_tools";
export const TOOLS_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
/** Outils gratuits reconnus (dossiers de src/app/outils). */
export const TOOL_IDS = ["legendes", "miniatures", "hashtags", "bio-instagram", "titre-youtube", "meilleur-moment", "taux-engagement", "audit"] as const;
export type ToolId = (typeof TOOL_IDS)[number];
/** Outils à essayer pour le badge. */
export const EXPLORER_TARGET = 2;
export const TOOLS_EXPLORED_EVENT = "nebula:tool-explored";

/** Outils reconnus d'une valeur de cookie (sans doublon, jamais autre chose). */
export function parseToolsCookie(value: string | null | undefined): ToolId[] {
  if (!value) return [];
  const out: ToolId[] = [];
  for (const raw of decodeURIComponent(value).split(".")) {
    const id = raw.trim() as ToolId;
    if ((TOOL_IDS as readonly string[]).includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Nombre d'outils essayés (pour User.toolsExplored). */
export function toolsExploredCount(value: string | null | undefined): number {
  return parseToolsCookie(value).length;
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${TOOLS_COOKIE}=`));
  return hit ? hit.slice(TOOLS_COOKIE.length + 1) : null;
}

/** Outils essayés dans ce navigateur (côté client). */
export function exploredTools(): ToolId[] {
  return parseToolsCookie(readCookie());
}

/**
 * Note l'outil de la page courante (/outils/<outil>) comme essayé, après un
 * vrai résultat (texte généré, calcul fait…). Côté client uniquement.
 */
export function markToolExplored(tool?: ToolId): void {
  if (typeof window === "undefined") return;
  const id = tool ?? (window.location.pathname.split("/")[2] as ToolId | undefined);
  if (!id || !(TOOL_IDS as readonly string[]).includes(id)) return;
  const current = exploredTools();
  if (current.includes(id)) return;
  const next = [...current, id].join(".");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOOLS_COOKIE}=${next}; Max-Age=${TOOLS_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(TOOLS_EXPLORED_EVENT));
}
