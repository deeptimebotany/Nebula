// Comptes Canva / OneDrive reliés pour l'import de médias (lot 3) : lecture,
// enregistrement et renouvellement automatique des jetons.
import { createHash, randomBytes } from "crypto";
import { integrationAccountDb, type IntegrationAccountRow } from "@/lib/prisma-extra";
import { ImportError } from "./errors";

export type IntegrationProvider = "canva" | "onedrive";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
  displayName?: string | null;
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function getIntegration(userId: string, provider: IntegrationProvider): Promise<IntegrationAccountRow | null> {
  return integrationAccountDb.findUnique({ where: { userId_provider: { userId, provider } } }).catch(() => null);
}

export async function saveIntegration(userId: string, provider: IntegrationProvider, tokens: TokenSet): Promise<void> {
  const data = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
    ...(tokens.displayName !== undefined ? { displayName: tokens.displayName } : {})
  };
  await integrationAccountDb.upsert({
    where: { userId_provider: { userId, provider } },
    update: data,
    create: { userId, provider, ...data }
  });
}

export async function deleteIntegration(userId: string, provider: IntegrationProvider): Promise<void> {
  await integrationAccountDb.deleteMany({ where: { userId, provider } });
}

/**
 * Jeton d'accès valide pour cet outil : renouvelé (et enregistré) s'il
 * expire dans moins de 2 minutes. Sans compte relié, ou si le
 * renouvellement échoue, erreur 401 : l'interface propose de reconnecter.
 */
export async function freshIntegrationToken(
  userId: string,
  provider: IntegrationProvider,
  refresh: (refreshToken: string) => Promise<TokenSet>
): Promise<string> {
  const account = await getIntegration(userId, provider);
  if (!account) throw new ImportError("Compte non relié.", 401);
  const expires = account.expiresAt ? new Date(account.expiresAt).getTime() : null;
  if (expires === null || expires - Date.now() > 120_000) return account.accessToken;
  if (!account.refreshToken) throw new ImportError("Connexion expirée : reliez à nouveau votre compte.", 401);
  let next: TokenSet;
  try {
    next = await refresh(account.refreshToken);
  } catch (err) {
    // Lot 8 : seul un REFUS du service (401) signifie un compte à relier ;
    // une panne ou un délai dépassé demande seulement de réessayer.
    if (err instanceof ImportError && err.status !== 401) throw err;
    throw new ImportError("Connexion expirée : reliez à nouveau votre compte.", 401);
  }
  await saveIntegration(userId, provider, { ...next, refreshToken: next.refreshToken ?? account.refreshToken });
  return next.accessToken;
}
