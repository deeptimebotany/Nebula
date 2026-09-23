import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Anti-abus pour les outils IA gratuits et sans compte de /outils (voir
// PublicToolUsage dans prisma/schema.prisma). Ces routes n'ont aucune
// authentification par nature — c'est tout l'intérêt en tant qu'aimant à
// visiteurs — donc la seule protection possible contre un usage massif
// (script, scraping) est un plafond par IP et par jour, par outil.

function getClientIp(req: NextRequest): string {
  // Sur Vercel (et la plupart des proxys), l'IP réelle du visiteur est le
  // premier élément de x-forwarded-for ; NextRequest.ip n'est plus fiable
  // sur toutes les versions/runtimes, d'où ce repli manuel.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function hashIp(ip: string): string {
  // On ne stocke jamais l'IP en clair, seulement son empreinte — suffisant
  // pour du rate-limiting, inutile de conserver une donnée personnelle.
  return createHash("sha256").update(ip).digest("hex");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
}

export interface QuotaResult {
  ok: boolean;
  remaining: number;
  limit: number;
  /** Générations déjà faites aujourd'hui (sert au formulaire de capture
   *  d'email des outils, après la 2e — brief growth lot G4.b). */
  used: number;
}

/** Générations bonus accordées pour la journée à une IP (capture d'email,
 *  lot G4.b) — stockées dans la même table, sous l'outil « lead-bonus ». */
export const LEAD_BONUS_TOOL = "lead-bonus";
export const LEAD_BONUS_GENERATIONS = 5;

export function ipHashFromRequest(req: NextRequest): string {
  return hashIp(getClientIp(req));
}

export async function grantLeadBonus(req: NextRequest): Promise<void> {
  const ipHash = hashIp(getClientIp(req));
  const day = todayUtc();
  await prisma.publicToolUsage.upsert({
    where: { ipHash_tool_day: { ipHash, tool: LEAD_BONUS_TOOL, day } },
    // Une seule fois par IP et par jour : pas d'incrément cumulatif.
    update: { count: LEAD_BONUS_GENERATIONS },
    create: { ipHash, tool: LEAD_BONUS_TOOL, day, count: LEAD_BONUS_GENERATIONS }
  });
}

/**
 * Incrémente et vérifie le quota du jour pour cette IP + cet outil. Renvoie
 * ok=false SANS incrémenter davantage si la limite est déjà atteinte (un
 * visiteur qui insiste ne consomme pas de quota "en négatif"). La limite
 * effective = limite de base + bonus lead du jour (le refus du formulaire
 * laisse le quota de base ; on ne bloque jamais complètement).
 */
export async function consumePublicQuota(req: NextRequest, tool: string, dailyLimit: number): Promise<QuotaResult> {
  const ipHash = hashIp(getClientIp(req));
  const day = todayUtc();

  const [existing, bonus] = await Promise.all([
    prisma.publicToolUsage.findUnique({ where: { ipHash_tool_day: { ipHash, tool, day } } }),
    prisma.publicToolUsage.findUnique({ where: { ipHash_tool_day: { ipHash, tool: LEAD_BONUS_TOOL, day } } })
  ]);
  const limit = dailyLimit + (bonus?.count ?? 0);

  if (existing && existing.count >= limit) {
    return { ok: false, remaining: 0, limit, used: existing.count };
  }

  const updated = await prisma.publicToolUsage.upsert({
    where: { ipHash_tool_day: { ipHash, tool, day } },
    update: { count: { increment: 1 } },
    create: { ipHash, tool, day, count: 1 }
  });

  return { ok: true, remaining: Math.max(0, limit - updated.count), limit, used: updated.count };
}
