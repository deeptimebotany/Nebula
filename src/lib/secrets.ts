// Secrets de l'application (audit sécurité, lot 1).
//
// - appSecret() : NEXTAUTH_SECRET, refusé s'il est vide ou resté à la valeur
//   d'exemple de .env.example (« générez avec : openssl rand… »), qui
//   permettrait à n'importe qui de forger des sessions.
// - deriveKey(usage) : une clé DIFFÉRENTE par usage (état OAuth, lien de
//   désinscription, confirmation d'e-mail…), dérivée de NEXTAUTH_SECRET par
//   HKDF-SHA256. Une signature valable pour un usage ne l'est jamais pour un
//   autre.
// - safeEqual() : comparaison en temps constant (secret du cron, signatures).
import { createHash, hkdfSync, timingSafeEqual } from "crypto";

/** Valeurs d'exemple de .env.example : jamais acceptées comme secret. */
export function isPlaceholderSecret(value: string | undefined | null): boolean {
  const v = value?.trim().toLowerCase() ?? "";
  if (!v) return true;
  return v.startsWith("générez") || v.startsWith("generez") || v.includes("openssl rand");
}

export function appSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret || isPlaceholderSecret(secret)) {
    throw new Error(
      "NEXTAUTH_SECRET manquant ou resté à la valeur d'exemple : générez-en un avec « openssl rand -base64 32 » et ajoutez-le dans les variables d'environnement Vercel."
    );
  }
  return secret;
}

export type KeyPurpose = "oauth-state" | "unsubscribe" | "email-verify" | "lead-confirm";

const derived = new Map<string, Buffer>();

export function deriveKey(purpose: KeyPurpose): Buffer {
  const secret = appSecret();
  const cacheKey = `${purpose}:${createHash("sha256").update(secret).digest("hex")}`;
  let key = derived.get(cacheKey);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", secret, "nebula/v1", purpose, 32));
    derived.set(cacheKey, key);
  }
  return key;
}

/** Comparaison en temps constant, y compris quand les longueurs diffèrent. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

let checked = false;

/**
 * Contrôle au démarrage (appelé par src/lib/auth.ts). En production, un
 * NEXTAUTH_SECRET resté à la valeur d'exemple bloque le build ou le
 * démarrage avec un message clair, plutôt que de laisser le site tourner
 * avec des sessions falsifiables. Un secret court est seulement signalé.
 */
export function assertSecretConfig(): void {
  if (checked || process.env.NODE_ENV !== "production") return;
  checked = true;
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (secret && isPlaceholderSecret(secret)) appSecret();
  if (secret && secret.length < 32) {
    console.warn("[secrets] NEXTAUTH_SECRET fait moins de 32 caractères : remplacez-le par « openssl rand -base64 32 » (les utilisateurs devront se reconnecter).");
  }
  const cron = process.env.CRON_SECRET?.trim();
  if (cron && isPlaceholderSecret(cron)) {
    console.error("[secrets] CRON_SECRET est resté à la valeur d'exemple : /api/cron refusera tous les appels tant qu'il n'est pas remplacé.");
  }
}
