// Réseaux réellement proposés dans l'application (25/09/2026). Les réseaux
// historiques restent toujours visibles (comportement d'origine : sans clé,
// le bouton « Connecter » affiche une erreur explicite). Ceux du lot 2
// n'apparaissent qu'une fois leurs clés développeur renseignées sur Vercel,
// pour ne pas proposer un bouton qui ne mène nulle part pendant que la
// plateforme valide l'application. Côté serveur uniquement (process.env).
import { NETWORKS, type Network } from "@/lib/types";
import { envValue } from "@/lib/env-value";

const REQUIRED_ENV: Partial<Record<Network, string[]>> = {
  THREADS: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
  PINTEREST: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
  LINKEDIN: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]
};

export function isNetworkConfigured(network: Network): boolean {
  const required = REQUIRED_ENV[network];
  return !required || required.every((name) => Boolean(envValue(name)));
}

export function availableNetworks(): Network[] {
  return NETWORKS.filter(isNetworkConfigured);
}

/** Adresse de retour OAuth : variable dédiée, sinon <NEXTAUTH_URL>/api/connections/<fournisseur>/callback. */
export function oauthRedirectUri(provider: string, envName: string): string {
  const explicit = envValue(envName);
  if (explicit) return explicit;
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/connections/${provider}/callback`;
}
