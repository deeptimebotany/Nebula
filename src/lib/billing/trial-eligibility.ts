// Anti-abus de l'essai (lot E3, brief « Essai 14 jours », 29/09/2026).
// Une même personne ne doit pas enchaîner les essais. Un refus ne bloque
// JAMAIS l'inscription : le compte est créé en Gratuit, sans essai
// (User.trialDeniedAt / trialDeniedReason), et la page Facturation le dit.
//
//   1. adresse d'un domaine jetable connu (src/data/disposable-domains.ts) ;
//   2. un essai par adresse email CANONIQUE, même après suppression du
//      compte : registre TrialGrant, qui ne garde qu'un HMAC de l'adresse
//      canonique (clé dérivée de NEXTAUTH_SECRET) et survit à la
//      suppression du compte ; conservé 12 mois, purgé par le cron ;
//   3. au plus 2 essais par empreinte d'adresse IP sur 30 jours (pas 1 : les
//      réseaux mobiles et les bureaux partagent souvent une même IP).
// L'adresse canonique ne sert qu'ici : jamais à la connexion ni à l'affichage.
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { deriveKey } from "@/lib/secrets";
import { ipHashFromHeaders } from "@/lib/public-tools-limit";
import { isDisposableDomain } from "@/data/disposable-domains";
import { trialEndDate } from "@/lib/trial";

export const TRIAL_GRANTS_PER_IP = 2;
export const TRIAL_IP_WINDOW_DAYS = 30;
export const TRIAL_GRANT_RETENTION_DAYS = 365;

export type TrialDeniedReason = "disposable" | "email_used" | "ip_limit";

export { TRIAL_DENIED_MESSAGE } from "@/lib/billing/trial-copy";

const DAY = 86_400_000;

/**
 * Adresse canonique (fonction pure) : minuscules, espaces retirés ; partie
 * « +… » retirée pour tous les domaines ; points retirés pour gmail.com et
 * googlemail.com ; googlemail.com devient gmail.com.
 */
export function canonicalEmail(email: string): string {
  const clean = email.replace(/\s+/g, "").toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at <= 0) return clean;
  let local = clean.slice(0, at);
  let domain = clean.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** Empreinte de l'adresse canonique pour le registre (jamais l'adresse en clair). */
export function trialEmailHash(email: string): string {
  return createHmac("sha256", deriveKey("trial-grant")).update(canonicalEmail(email)).digest("hex");
}

export function emailDomain(email: string): string {
  const clean = email.trim().toLowerCase();
  return clean.slice(clean.lastIndexOf("@") + 1);
}

export type TrialDecision = { granted: true; trialEndsAt: Date } | { granted: false; reason: TrialDeniedReason };

/**
 * Décide et, si l'essai est accordé, l'INSCRIT au registre (la contrainte
 * d'unicité sur l'empreinte de l'adresse tranche entre deux inscriptions
 * simultanées). À appeler juste avant de créer le compte.
 */
export async function decideTrial(params: { email: string; headers?: Headers | null; referred: boolean; now?: Date }): Promise<TrialDecision> {
  const now = params.now ?? new Date();
  if (isDisposableDomain(emailDomain(params.email))) return { granted: false, reason: "disposable" };
  const emailHash = trialEmailHash(params.email);
  const ipHash = params.headers ? ipHashFromHeaders(params.headers) : null;
  if (await prisma.trialGrant.findUnique({ where: { emailHash }, select: { id: true } })) return { granted: false, reason: "email_used" };
  if (ipHash) {
    const recent = await prisma.trialGrant.count({ where: { ipHash, grantedAt: { gte: new Date(now.getTime() - TRIAL_IP_WINDOW_DAYS * DAY) } } });
    if (recent >= TRIAL_GRANTS_PER_IP) return { granted: false, reason: "ip_limit" };
  }
  try {
    await prisma.trialGrant.create({ data: { emailHash, ipHash, grantedAt: now } });
  } catch (err) {
    // Contrainte d'unicité (P2002) : une inscription simultanée a pris l'essai.
    if ((err as { code?: string } | null)?.code === "P2002") return { granted: false, reason: "email_used" };
    throw err;
  }
  return { granted: true, trialEndsAt: trialEndDate(params.referred, now) };
}

/** Inscrit une adresse au registre (sans effet si elle y est déjà). */
export async function recordTrialGrant(email: string, ipHash: string | null = null, now: Date = new Date()): Promise<void> {
  const emailHash = trialEmailHash(email);
  await prisma.trialGrant.upsert({ where: { emailHash }, update: {}, create: { emailHash, ipHash, grantedAt: now } });
}

/** Champs du compte à créer selon la décision. */
export function trialUserFields(decision: TrialDecision, now: Date = new Date()): { trialEndsAt: Date | null; aiTrialUntil?: Date | null; trialDeniedAt: Date | null; trialDeniedReason: string | null } {
  return decision.granted
    ? { trialEndsAt: decision.trialEndsAt, trialDeniedAt: null, trialDeniedReason: null }
    : { trialEndsAt: null, trialDeniedAt: now, trialDeniedReason: decision.reason };
}

/** Registre gardé 12 mois (cron). */
export async function purgeOldTrialGrants(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.trialGrant.deleteMany({ where: { grantedAt: { lt: new Date(now.getTime() - TRIAL_GRANT_RETENTION_DAYS * DAY) } } });
  return count;
}
