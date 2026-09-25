// Contrats des réseaux (lot 7) : ce que Nebula attend de chaque réponse.
//
// Avant, une réponse de réseau était « castée » dans un type TypeScript sans
// jamais être vérifiée. Si Instagram renommait un champ, le code lisait
// `undefined` : un TypeError au milieu d'une publication (classé « erreur
// inconnue », publication peut-être en ligne mais marquée en échec), ou pire,
// un 0 ou un lien faux enregistré en silence.
//
// Maintenant, chaque réponse lue par un client réseau passe par un schéma
// zod (voir fetchJson(..., { schema }) et checkShape dans base.ts) :
//  - champs INDISPENSABLES (identifiant d'une publication, liste renvoyée,
//    jeton…) : stricts. S'ils manquent, l'appel échoue avec la catégorie
//    UNEXPECTED_RESPONSE, un message qui nomme le champ et l'adresse, et une
//    alerte au propriétaire ;
//  - champs SECONDAIRES (compteurs, miniature, lien…) : tolérants (`soft`).
//    Un type inattendu devient « absent » (affiché « — »), jamais une
//    fausse valeur.
// Les champs inconnus sont ignorés : un réseau peut AJOUTER des champs sans
// rien casser.
//
// Tests : tests/contracts (une réponse type par appel, d'après la
// documentation officielle de chaque réseau).
import { z, type ZodIssue, type ZodTypeAny } from "zod";

export { z };

/**
 * Identifiant : texte non vide. Un nombre est accepté et converti en texte
 * (les grands entiers, comme les identifiants de vidéos TikTok, arrivent
 * déjà en texte grâce à parseProviderJson : jamais arrondis).
 */
export const idSchema = z.union([z.string().min(1), z.number().int().nonnegative()]).transform((v) => String(v));

/** Champ facultatif : absent ou null → undefined. Un type inattendu reste une erreur. */
export function opt<T extends ZodTypeAny>(schema: T) {
  return schema.nullish().transform((v): z.output<T> | undefined => (v === null ? undefined : v));
}

/**
 * Champ secondaire tolérant : absent, null OU d'un type inattendu →
 * undefined. À réserver à ce qui peut manquer sans fausser un résultat
 * (compteurs affichés « — », miniatures, liens).
 */
export function soft<T extends ZodTypeAny>(schema: T) {
  return schema
    .nullish()
    .catch(undefined)
    .transform((v): z.output<T> | undefined => (v === null ? undefined : v));
}

/** Compteur : nombre, ou texte chiffré (YouTube renvoie « "1234" »). Tolérant. */
export const countSchema = soft(z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]));

/** Texte secondaire, tolérant. */
export const textSchema = soft(z.string());

/** Liste Graph API de Meta ou de Threads : `data` obligatoire, pagination facultative. */
export function graphList<T extends ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), paging: soft(z.object({ next: soft(z.string()) })) });
}

/**
 * Date renvoyée par un réseau. Sans fuseau (Pinterest : « 2026-09-24T10:00:00 »),
 * elle est lue en UTC, comme le précisent ces API — JavaScript la lirait
 * sinon à l'heure locale du serveur. Invalide → undefined.
 */
export function toDate(value: string | number | undefined | null, unit: "ms" | "s" = "ms"): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  let date: Date;
  if (typeof value === "number") {
    date = new Date(unit === "s" ? value * 1000 : value);
  } else {
    const noZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value);
    date = new Date(noZone ? `${value}Z` : value);
  }
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// --- Description d'un écart, sans aucune donnée -----------------------------

const TYPE_LABEL: Record<string, string> = {
  string: "texte",
  number: "nombre",
  integer: "nombre entier",
  boolean: "booléen",
  object: "objet",
  array: "liste",
  null: "null",
  undefined: "rien",
  nan: "NaN",
  date: "date"
};

/** Écart lisible : « champ « data.0.id » absent », « champ « x » : nombre attendu, texte reçu ». */
export function describeIssue(issue: ZodIssue | undefined): string {
  if (!issue) return "réponse illisible";
  const path = issue.path.length > 0 ? issue.path.join(".") : "";
  if (issue.code === "invalid_type") {
    if (!path) return issue.received === "undefined" ? "réponse vide ou non JSON" : `${TYPE_LABEL[issue.expected] ?? issue.expected} attendu, ${TYPE_LABEL[issue.received] ?? issue.received} reçu`;
    if (issue.received === "undefined" || issue.received === "null") return `champ « ${path} » absent`;
    return `champ « ${path} » : ${TYPE_LABEL[issue.expected] ?? issue.expected} attendu, ${TYPE_LABEL[issue.received] ?? issue.received} reçu`;
  }
  if (issue.code === "invalid_union") {
    // Plusieurs formes acceptées (identifiant texte OU nombre…) : on décrit ce qui a été reçu.
    const inner = issue.unionErrors.map((e) => e.issues[0]).filter((i): i is ZodIssue => Boolean(i));
    const first = inner[0];
    if (first?.code === "invalid_type") {
      if (first.received === "undefined" || first.received === "null") return `champ « ${path || "réponse"} » absent`;
      return `champ « ${path || "réponse"} » : type inattendu (${TYPE_LABEL[first.received] ?? first.received} reçu)`;
    }
    return describeIssue(first);
  }
  if (issue.code === "too_small" && issue.type === "string") return `champ « ${path || "réponse"} » vide`;
  if (issue.code === "too_small" && issue.type === "array") return `liste « ${path || "réponse"} » vide`;
  return `champ « ${path || "réponse"} » : ${issue.message}`;
}

/**
 * Forme d'une réponse (noms des champs et types), SANS aucune valeur : de
 * quoi mettre à jour un contrat d'après les journaux, sans jamais y écrire
 * une légende, un nom ou un jeton.
 */
export function shapeOf(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? [] : [shapeOf(value[0], depth + 1)];
  if (typeof value === "object") {
    if (depth >= 5) return "objet";
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) out[key.slice(0, 60)] = shapeOf(v, depth + 1);
    return out;
  }
  return typeof value;
}

/**
 * Adresse d'un appel, sans paramètres (le jeton y est parfois) et avec les
 * identifiants remplacés par {id} : « POST graph.facebook.com/v25.0/{id}/media ».
 */
export function endpointLabel(method: string, url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname
      .split("/")
      .map((seg) => (/^\d{3,}$/.test(seg) || /%3A|^urn:|^did:/i.test(seg) || (/^[A-Za-z0-9_-]{20,}$/.test(seg) && /\d/.test(seg)) ? "{id}" : seg))
      .join("/");
    return `${method.toUpperCase()} ${u.host}${path}`;
  } catch {
    return method.toUpperCase();
  }
}
