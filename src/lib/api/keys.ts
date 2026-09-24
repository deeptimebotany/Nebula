// Format des clés d'API Nebula (lot 4) : « nbk_ » + 40 caractères
// aléatoires. Seule l'empreinte SHA-256 est stockée ; le début de la clé
// (prefix) sert à la reconnaître dans la liste.
import { createHash, randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const bytes = randomBytes(40);
  let body = "";
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  const key = `nbk_${body}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function looksLikeApiKey(value: string): boolean {
  return /^nbk_[A-Za-z0-9]{40}$/.test(value);
}

/** Secret de signature des webhooks : « whsec_ » + 32 octets en base64url. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}
