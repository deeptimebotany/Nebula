// Valeur « propre » d'une variable d'environnement (30/09/2026, erreur
// « client_key » sur la page de connexion TikTok). Une clé développeur
// collée dans Vercel avec un espace, un retour à la ligne ou des guillemets
// autour est refusée par la plateforme sans autre explication : on retire
// les espaces autour de la valeur et une paire de guillemets qui l'entoure.
// Côté serveur uniquement.

export function cleanEnvValue(raw: string | undefined | null): string {
  if (!raw) return "";
  let value = raw.trim();
  const quoted = value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  if (quoted) value = value.slice(1, -1).trim();
  return value;
}

/** Variable d'environnement nettoyée ("" si absente). */
export function envValue(name: string): string {
  return cleanEnvValue(process.env[name]);
}
