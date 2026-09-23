// Mesure d'acquisition INTERNE (brief growth du 23/09/2026, lot G0) — sans
// pixel ni service tiers : un cookie d'attribution « premier contact », des
// champs acq* sur User, et une table d'événements légers (GrowthEvent) lue
// par la page propriétaire /admin/acquisition.
//
// Ce fichier est importable côté serveur uniquement (Prisma). Le pendant
// navigateur, pour les pages publiques, est growth-client.ts.

import { prisma } from "@/lib/prisma";

export * from "./growth-attribution";

/** Noms d'événements que les PAGES PUBLIQUES peuvent envoyer via
 *  POST /api/growth (liste blanche : tout autre nom est ignoré). Les
 *  événements serveur (paid, offer_started…) ne passent pas par là. */
export const PUBLIC_GROWTH_EVENTS = [
  "badge_click",
  "landing_view",
  "conversion_block_click",
  "tool_cta_click",
  "exit_intent_shown",
  "exit_intent_clicked",
  "upgrade_modal_shown",
  "upgrade_modal_clicked",
  "referral_prompt_shown",
  "referral_link_copied"
] as const;

export type PublicGrowthEvent = (typeof PUBLIC_GROWTH_EVENTS)[number];

export function isPublicGrowthEvent(name: unknown): name is PublicGrowthEvent {
  return typeof name === "string" && (PUBLIC_GROWTH_EVENTS as readonly string[]).includes(name);
}

/** Métadonnées bornées : clés courtes, valeurs scalaires courtes. */
export function sanitizeMeta(meta: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!meta || typeof meta !== "object") return out;
  let n = 0;
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (n >= 12) break;
    if (!/^[a-zA-Z][\w]{0,30}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else continue;
    n++;
  }
  return out;
}

/** Enregistre un événement côté serveur. Ne lève jamais : la mesure ne doit
 *  jamais faire échouer l'action qu'elle mesure. */
export async function trackGrowth(name: string, meta?: Record<string, unknown> | null, userId?: string | null): Promise<void> {
  try {
    await prisma.growthEvent.create({ data: { name, meta: meta ? sanitizeMeta(meta) : undefined, userId: userId ?? undefined } });
  } catch (err) {
    console.error("[growth] événement non enregistré :", name, (err as Error).message);
  }
}

/** Purge des événements de plus de 180 jours (appelée par /api/cron). */
export async function purgeOldGrowthEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.growthEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
