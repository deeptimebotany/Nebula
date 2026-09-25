// Chiffrement des secrets stockés en base (jetons OAuth des réseaux, des
// intégrations et des comptes publicitaires, secrets de webhooks).
//
// Algorithme : AES-256-GCM (chiffrement authentifié), IV aléatoire de 12
// octets par valeur. La donnée additionnelle authentifiée (AAD) est le nom
// du champ : une valeur chiffrée copiée d'un champ vers un autre (ex. un
// refreshToken collé dans accessToken) est refusée au déchiffrement.
//
// Format stocké : enc:v1:<id de clé>:<iv>:<texte chiffré>:<tag>
// (base64url). L'id de clé (8 caractères, dérivé de la clé) permet de
// changer de clé sans tout casser :
//   1. TOKEN_ENCRYPTION_KEY = nouvelle clé,
//   2. TOKEN_ENCRYPTION_KEY_PREVIOUS = ancienne clé (plusieurs possibles,
//      séparées par des virgules),
//   3. le cron re-chiffre les valeurs avec la nouvelle clé (voir
//      backfillSecretFields), puis on retire l'ancienne.
//
// Sans TOKEN_ENCRYPTION_KEY, rien n'est chiffré (les valeurs restent lisibles
// comme avant) : le site fonctionne, un avertissement est journalisé une fois.
// Les valeurs déjà en clair en base sont relues telles quelles, puis chiffrées
// en tâche de fond dès que la clé est configurée.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const SECRET_PREFIX = "enc:v1:";

export class SecretKeyError extends Error {}

interface SecretKey {
  id: string;
  key: Buffer;
}

function parseKey(raw: string, name: string): SecretKey {
  const trimmed = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new SecretKeyError(`${name} invalide : il faut une clé de 32 octets (générez-la avec : openssl rand -base64 32).`);
  }
  return { id: createHash("sha256").update(key).digest("hex").slice(0, 8), key };
}

let keyring: { current: SecretKey | null; all: SecretKey[] } | null = null;

function keys(): { current: SecretKey | null; all: SecretKey[] } {
  if (keyring) return keyring;
  const currentRaw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  const current = currentRaw ? parseKey(currentRaw, "TOKEN_ENCRYPTION_KEY") : null;
  const previous = (process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseKey(s, "TOKEN_ENCRYPTION_KEY_PREVIOUS"));
  keyring = { current, all: current ? [current, ...previous] : previous };
  return keyring;
}

/** Pour les tests : relit les variables d'environnement. */
export function resetSecretKeysForTests(): void {
  keyring = null;
}

let warned = false;

export function secretEncryptionEnabled(): boolean {
  return keys().current !== null;
}

/** Préfixe des valeurs chiffrées avec la clé ACTUELLE (les autres sont à re-chiffrer). */
export function currentSecretPrefix(): string | null {
  const current = keys().current;
  return current ? `${SECRET_PREFIX}${current.id}:` : null;
}

export function isSealed(value: string): boolean {
  return value.startsWith(SECRET_PREFIX);
}

/** Chiffre une valeur (inchangée si déjà chiffrée, ou si aucune clé n'est configurée). */
export function sealSecret(plain: string, field: string): string {
  if (isSealed(plain)) return plain;
  const current = keys().current;
  if (!current) {
    if (!warned && process.env.NODE_ENV === "production") {
      warned = true;
      console.warn("[secrets] TOKEN_ENCRYPTION_KEY absente : les jetons sont enregistrés en clair. Ajoutez-la dans Vercel (voir .env.example).");
    }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.key, iv);
  cipher.setAAD(Buffer.from(field, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${SECRET_PREFIX}${current.id}:${iv.toString("base64url")}:${ciphertext.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}`;
}

/** Déchiffre une valeur (renvoyée telle quelle si elle n'a jamais été chiffrée). */
export function openSecret(value: string, field: string): string {
  if (!isSealed(value)) return value;
  const parts = value.slice(SECRET_PREFIX.length).split(":");
  if (parts.length !== 4) throw new SecretKeyError(`Valeur chiffrée illisible (${field}).`);
  const [keyId, iv, ciphertext, tag] = parts;
  const key = keys().all.find((k) => k.id === keyId);
  if (!key) {
    throw new SecretKeyError(
      `Impossible de déchiffrer ${field} : la clé ${keyId} n'est pas configurée (TOKEN_ENCRYPTION_KEY ou TOKEN_ENCRYPTION_KEY_PREVIOUS).`
    );
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(field, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretKeyError(`Impossible de déchiffrer ${field} : valeur altérée ou mauvaise clé.`);
  }
}
