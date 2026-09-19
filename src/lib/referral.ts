import { prisma } from "@/lib/prisma";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I, ambigus à recopier
const CODE_LENGTH = 8;
export const REFERRAL_TRIAL_DAYS = 14;

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Génère un code de parrainage garanti unique en base. */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const exists = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!exists) return code;
  }
  // Filet de sécurité si (très improbable) 10 collisions de suite.
  return `${randomCode()}${Date.now().toString(36).toUpperCase()}`;
}

/** true si ce compte a l'IA offerte via un parrainage encore actif. */
export function hasActiveReferralTrial(aiTrialUntil: Date | null | undefined): boolean {
  return Boolean(aiTrialUntil && aiTrialUntil.getTime() > Date.now());
}
