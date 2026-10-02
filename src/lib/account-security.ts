// Sécurité des comptes (audit sécurité, lot 1) : confirmation de l'adresse
// e-mail, révocation des sessions, règles de connexion Google/Apple/Meta.
//
// La faille corrigée : un inconnu créait un compte avec l'adresse de
// quelqu'un d'autre (aucune vérification), puis la vraie personne, en
// cliquant « Continuer avec Google », arrivait dans CE compte — dont
// l'inconnu gardait le mot de passe et la session. Désormais :
//  - l'inscription par mot de passe crée un compte « non confirmé » et envoie
//    un lien de confirmation ;
//  - si le vrai propriétaire de l'adresse arrive par Google/Apple (qui
//    garantissent l'adresse), le mot de passe posé sans confirmation est
//    supprimé et toutes les sessions ouvertes sont coupées ;
//  - Meta (Facebook) ne garantit pas l'adresse : on ne relie un compte
//    existant que par l'identifiant Facebook déjà enregistré ;
//  - les adresses réservées (propriétaire, ADMIN_EMAILS) ne peuvent jamais
//    être prises sans preuve ;
//  - les accès offerts en attente (partenaires) ne s'appliquent qu'à une
//    adresse confirmée.
import { createHash, createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, escapeHtml } from "@/lib/email";
import { EMAIL_COLORS, emailButton, emailFrame } from "@/lib/emails/brand";
import { isAdminEmail } from "@/lib/admin-emails";
import { isOwnerEmail } from "@/lib/dev-preview";
import { SITE_URL } from "@/lib/site";
import { deriveKey } from "@/lib/secrets";

export const EMAIL_VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
export { EMAIL_VERIFY_RESEND_COOLDOWN_MS } from "@/lib/email-verify-config";
/** Un lien encore valable au moins aussi longtemps est renvoyé tel quel. */
const EMAIL_VERIFY_REUSE_MIN_MS = 6 * 60 * 60 * 1000;

/** Base des liens envoyés par e-mail : jamais l'en-tête Host de la requête. */
export function publicAppUrl(): string {
  return (process.env.NEXTAUTH_URL || SITE_URL).replace(/\/$/, "");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Adresse dont le compte donne des droits particuliers. */
export function isPrivilegedEmail(email: string | null | undefined): boolean {
  return isOwnerEmail(email) || isAdminEmail(email);
}

/** Le fournisseur garantit-il que l'adresse transmise appartient à la personne ? */
export function providerEmailVerified(provider: string, profile: unknown): boolean {
  const claim = (profile as { email_verified?: unknown } | undefined)?.email_verified;
  if (provider === "google") return claim === true || claim === "true";
  // Apple ne transmet que des adresses vérifiées (y compris les relais
  // « Masquer mon adresse ») ; on refuse seulement un « false » explicite.
  if (provider === "apple") return claim !== false && claim !== "false";
  return false;
}

// ---------------------------------------------------------------------------
// Confirmation de l'adresse
// ---------------------------------------------------------------------------

/**
 * Jeton du lien de confirmation, dérivé de NEXTAUTH_SECRET (clé
 * « email-verify ») et lié au compte, à l'adresse et à la date
 * d'expiration (01/10/2026). Un renvoi pendant la validité du lien
 * recalcule LE MÊME jeton : tous les e-mails reçus gardent un lien qui
 * marche (avant : chaque renvoi annulait les liens précédents, et on
 * cliquait souvent sur un ancien e-mail → « lien invalide »). Seul son
 * hash est en base, comme avant. Sans secret (tests) : jeton aléatoire.
 */
export function emailVerifyToken(userId: string, email: string, expiresAt: Date): string | null {
  try {
    return createHmac("sha256", deriveKey("email-verify")).update(`${userId}\n${email.trim().toLowerCase()}\n${expiresAt.getTime()}`).digest("base64url");
  } catch {
    return null;
  }
}

/** Date lisible (heure de Paris) : « jeudi 3 octobre à 14:32 ». */
function parisDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    .format(date);
}

export async function sendVerificationEmail(
  user: { id: string; email: string; name?: string | null }
): Promise<{ ok: boolean; error?: string; sentAt?: Date; expiresAt?: Date }> {
  const current = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerifyTokenHash: true, emailVerifyTokenExpiresAt: true } });
  let expiresAt = current?.emailVerifyTokenExpiresAt ?? null;
  let raw: string | null = null;
  // Lien encore valable assez longtemps : on renvoie le même.
  if (expiresAt && current?.emailVerifyTokenHash && expiresAt.getTime() - Date.now() > EMAIL_VERIFY_REUSE_MIN_MS) {
    const candidate = emailVerifyToken(user.id, user.email, expiresAt);
    if (candidate && hashToken(candidate) === current.emailVerifyTokenHash) raw = candidate;
  }
  if (!raw) {
    expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    raw = emailVerifyToken(user.id, user.email, expiresAt) ?? randomBytes(32).toString("base64url");
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifyTokenHash: hashToken(raw), emailVerifyTokenExpiresAt: expiresAt } });
  }
  const until = parisDate(expiresAt as Date);
  const url = `${publicAppUrl()}/api/auth/verify-email?token=${raw}`;
  const hello = user.name ? `Bonjour ${escapeHtml(user.name.split(" ")[0])},` : "Bonjour,";
  const result = await sendEmail({
    to: user.email,
    subject: "Confirmez votre adresse e-mail Nebula",
    html: emailFrame(`
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827">Confirmez votre adresse</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55">${hello} merci pour votre inscription sur Nebula. Confirmez que cette adresse est bien la vôtre : le lien est valable jusqu'au ${until} (heure de Paris).</p>
      <p style="margin:22px 0">${emailButton("Confirmer mon adresse", url)}</p>
      <p style="margin:0 0 8px;color:${EMAIL_COLORS.muted};font-size:13px;line-height:1.5">Vous devrez être connecté(e) à votre compte Nebula pour confirmer. Si vous avez demandé plusieurs e-mails, le lien de chacun fonctionne. Si vous n'avez pas créé de compte Nebula, ignorez cet e-mail : personne ne pourra utiliser votre adresse sans ce lien.</p>
    `),
    text: `Confirmez votre adresse Nebula (lien valable jusqu'au ${until}, heure de Paris) : ${url}\n\nSi vous n'avez pas créé de compte Nebula, ignorez cet e-mail.`
  });
  if (!result.ok) {
    console.error("[account-security] e-mail de confirmation non envoyé :", result.error);
    return result;
  }
  const sentAt = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { emailVerifySentAt: sentAt } });
  return { ok: true, sentAt, expiresAt: expiresAt as Date };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

// Version de session par compte, gardée 30 s en mémoire par instance : une
// requête de plus au plus toutes les 30 s par utilisateur actif, et une
// session révoquée est coupée en 30 s au plus.
const SESSION_CACHE_MS = 30_000;
const sessionCache = new Map<string, { version: number | null; at: number }>();

export async function currentSessionVersion(userId: string): Promise<number | null> {
  const cached = sessionCache.get(userId);
  if (cached && Date.now() - cached.at < SESSION_CACHE_MS) return cached.version;
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  const version = row ? row.sessionVersion : null;
  sessionCache.set(userId, { version, at: Date.now() });
  if (sessionCache.size > 5000) sessionCache.clear();
  return version;
}

/** Coupe toutes les sessions ouvertes de ce compte. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  sessionCache.delete(userId);
}

export function forgetSessionCache(userId: string): void {
  sessionCache.delete(userId);
}
