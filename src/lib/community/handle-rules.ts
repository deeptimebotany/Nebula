// Pseudo de la Communauté (10/10/2026, demande de Lucas : « tout le monde
// ne veut pas montrer son nom »). Règles pures, lues par le serveur, la
// fenêtre Paramètres et les tests.
//
//  - unique, en minuscules, 3 à 24 caractères : lettres, chiffres, point et
//    tiret bas ; commence et finit par une lettre ou un chiffre ;
//  - affiché « @pseudo » partout dans la Communauté, à la place du nom ;
//  - attribué tout seul à l'inscription (un mot de l'espace et 4 chiffres,
//    jamais tiré du nom), modifiable dans Paramètres → Compte.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;

/** Mots des pseudos attribués d'office (même liste que la migration SQL). */
export const HANDLE_WORDS = ["comete", "orbite", "nova", "pulsar", "nebuleuse", "astre", "etoile", "galaxie", "aurore", "quasar", "eclipse", "meteore", "zenith", "cosmos", "lune"] as const;

/** Pseudos réservés : pas de faux compte officiel. */
const RESERVED = new Set([
  "admin",
  "administrateur",
  "aide",
  "contact",
  "equipe",
  "help",
  "moderateur",
  "moderation",
  "modo",
  "nebula",
  "nebulahub",
  "officiel",
  "root",
  "staff",
  "support",
  "systeme",
  "system",
  "team"
]);

/** « @Lucas Été » → « lucasete » : sans @, sans accent, en minuscules, seulement les caractères permis. */
export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "");
}

/** Message d'erreur (en français) si le pseudo ne convient pas, sinon null. */
export function handleError(handle: string): string | null {
  if (handle.length < HANDLE_MIN) return `Le pseudo doit faire au moins ${HANDLE_MIN} caractères.`;
  if (handle.length > HANDLE_MAX) return `Le pseudo doit faire au plus ${HANDLE_MAX} caractères.`;
  if (!/^[a-z0-9][a-z0-9._]*[a-z0-9]$/.test(handle)) return "Lettres, chiffres, point ou tiret bas seulement, sans finir par un point ni un tiret bas.";
  if (/[._]{2}/.test(handle)) return "Pas deux points ou tirets bas à la suite.";
  if (RESERVED.has(handle) || handle.startsWith("nebula")) return "Ce pseudo est réservé : choisissez-en un autre.";
  return null;
}

/** Pseudo attribué d'office : un mot de l'espace et des chiffres (« comete4821 »). */
export function randomHandle(digits = 4, rand: () => number = Math.random): string {
  const word = HANDLE_WORDS[Math.floor(rand() * HANDLE_WORDS.length) % HANDLE_WORDS.length];
  const n = Math.floor(rand() * 10 ** digits);
  return `${word}${String(n).padStart(digits, "0")}`;
}

/** « @comete4821 » ; « @membre » le temps que le pseudo soit attribué. */
export function displayHandle(handle: string | null | undefined): string {
  return handle ? `@${handle}` : "@membre";
}
