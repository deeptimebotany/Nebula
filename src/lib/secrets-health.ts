// Chiffrement des jetons : vérification par le cron (06/10/2026).
//
// Le chiffrement des jetons OAuth (TikTok, YouTube, Meta…, voir
// db/secret-fields.ts) ne s'active qu'avec TOKEN_ENCRYPTION_KEY. Sans elle,
// les jetons restaient en clair sans que personne ne le voie (un simple
// avertissement dans les journaux). Maintenant :
//  - en production, si la clé manque alors que des jetons existent : une
//    alerte au propriétaire (cloche + e-mail), une seule fois ;
//  - si le cron n'arrive pas à chiffrer ou relire des jetons (clé changée
//    sans TOKEN_ENCRYPTION_KEY_PREVIOUS) : une alerte par jour ;
//  - l'état exact est affiché sur la page Réseaux du propriétaire.
// Jamais bloquant.
import { secretsStatus } from "@/lib/prisma";
import { secretEncryptionEnabled } from "@/lib/crypto/secret-box";
import { alertOwnerWithEmail, alreadyAlerted } from "@/lib/api-watch/notify";

export const SECRETS_HREF = "/admin/reseaux";
const MISSING_KEY = "secrets:cle-absente";

const EMAIL = {
  actionLabel: "Voir l'état",
  button: "Ouvrir la page Réseaux",
  footer: "E-mail réservé au propriétaire de Nebula : protection des jetons des comptes connectés."
};

export function missingKeyAlert(plain: number): { title: string; body: string } {
  return {
    title: "Jetons des comptes connectés enregistrés en clair",
    body:
      `TOKEN_ENCRYPTION_KEY n'est pas configurée sur Vercel : ${plain} jeton${plain > 1 ? "s" : ""} (TikTok, YouTube, Meta, intégrations…) ${plain > 1 ? "sont" : "est"} enregistré${plain > 1 ? "s" : ""} en clair dans la base. ` +
      "Générez une clé de 32 octets sur votre ordinateur, ajoutez-la dans Vercel (Settings → Environment Variables, type Secret), puis redéployez : le cron chiffre tous les jetons existants en quelques minutes. Gardez la clé en lieu sûr : sans elle, les comptes devraient être reconnectés."
  };
}

export function failedAlert(failed: number): { title: string; body: string } {
  return {
    title: "Des jetons n'ont pas pu être chiffrés",
    body:
      `Le cron n'a pas réussi à chiffrer ou relire ${failed} jeton${failed > 1 ? "s" : ""}. Cause la plus probable : TOKEN_ENCRYPTION_KEY a changé sans que l'ancienne clé soit placée dans TOKEN_ENCRYPTION_KEY_PREVIOUS. ` +
      "Remettez l'ancienne clé dans TOKEN_ENCRYPTION_KEY_PREVIOUS (Vercel), redéployez ; détail dans les journaux Vercel (ligne « [secrets] »)."
  };
}

/** Appelé après chaque passage du rattrapage (cron). */
export async function checkSecretsHealth(
  backfill: { sealed: number; failed: number } | null,
  opts: { now?: Date; production?: boolean } = {}
): Promise<"missing-key" | "failed" | "ok" | "skipped"> {
  const now = opts.now ?? new Date();
  const production = opts.production ?? process.env.NODE_ENV === "production";
  try {
    if (!secretEncryptionEnabled()) {
      if (!production || (await alreadyAlerted(MISSING_KEY))) return "skipped";
      const status = await secretsStatus();
      if (status.plain === 0) return "ok";
      await alertOwnerWithEmail({ ...missingKeyAlert(status.plain), dedupeKey: MISSING_KEY, href: SECRETS_HREF, subject: "Nebula — jetons des comptes connectés en clair", ...EMAIL });
      return "missing-key";
    }
    if (backfill && backfill.failed > 0) {
      const text = failedAlert(backfill.failed);
      await alertOwnerWithEmail({ ...text, dedupeKey: `secrets:echec:${now.toISOString().slice(0, 10)}`, href: SECRETS_HREF, subject: `Nebula — ${text.title}`, ...EMAIL });
      return "failed";
    }
    return "ok";
  } catch (err) {
    console.error("[secrets] vérification :", (err as Error).message);
    return "skipped";
  }
}
