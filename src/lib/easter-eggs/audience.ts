import { prisma } from "@/lib/prisma";
import { ownedBy } from "@/lib/brand-access";
import { markEasterEggFound } from "@/lib/easter-eggs/server";

// Succès d'audience (sixième vague, 24/09/2026) : débloquent les cadres
// animés de la page bio (voir src/lib/bio-frames.ts). Calculés UNIQUEMENT
// ici, côté serveur, depuis la base — jamais sur la parole du navigateur
// (ces clés sont refusées par POST /api/easter-eggs/found).
//
//   j'aime  : somme de PostMetric.likes (dernier relevé de chaque
//             publication) sur tous les comptes des marques dont le compte
//             est membre ;
//   abonnés : somme du DERNIER AnalyticsSnapshot.followers de chacun de
//             ces comptes.
//
// Appelée à chaque actualisation des statistiques (Analytics, Engagements),
// à chaque visite de la page Succès et de la Page bio : pas de tâche
// planifiée dédiée, les chiffres ne bougent de toute façon qu'à une
// actualisation.

export const LIKES_MILESTONES: { threshold: number; key: string }[] = [
  { threshold: 1_000, key: "frame-or-comete" },
  { threshold: 10_000, key: "frame-or-orbites" },
  { threshold: 100_000, key: "frame-or-metal" },
  { threshold: 1_000_000, key: "frame-ultime-nacre" }
];

export const FOLLOWERS_MILESTONES: { threshold: number; key: string }[] = [
  { threshold: 1_000, key: "frame-eclipse-comete" },
  { threshold: 10_000, key: "frame-eclipse-orbites" },
  { threshold: 100_000, key: "frame-eclipse-metal" },
  { threshold: 1_000_000, key: "frame-ultime-prisme" }
];

export async function getAudienceTotals(userId: string): Promise<{ likes: number; followers: number }> {
  const connectionWhere = { brand: ownedBy(userId) };
  const [likesAgg, latestSnapshots] = await Promise.all([
    prisma.postMetric.aggregate({ _sum: { likes: true }, where: { connection: connectionWhere } }),
    prisma.analyticsSnapshot.findMany({
      where: { connection: connectionWhere },
      orderBy: { capturedAt: "desc" },
      distinct: ["connectionId"],
      select: { followers: true }
    })
  ]);
  const likes = (likesAgg as { _sum: { likes: number | null } })._sum.likes ?? 0;
  const followers = (latestSnapshots as { followers: number }[]).reduce((sum, s) => sum + (s.followers ?? 0), 0);
  return { likes, followers };
}

/**
 * Débloque les succès d'audience atteints. Ne lève jamais : un succès est
 * un bonus, jamais une raison de faire échouer l'action qui l'appelle.
 * @returns les clés débloquées pour la toute première fois.
 */
export async function checkAudienceMilestones(userId: string, opts: { evaluate?: boolean } = {}): Promise<string[]> {
  try {
    const { likes, followers } = await getAudienceTotals(userId);
    const reached = [
      ...LIKES_MILESTONES.filter((m) => likes >= m.threshold),
      ...FOLLOWERS_MILESTONES.filter((m) => followers >= m.threshold)
    ];
    const fresh: string[] = [];
    for (const m of reached) {
      if (await markEasterEggFound(userId, m.key)) fresh.push(m.key);
    }
    // Réussites : les paliers d'abonnés et de j'aime cumulés sont aussi des
    // accomplissements (import dynamique : le moteur utilise ce fichier).
    if (opts.evaluate !== false) {
      const { refreshReussites } = await import("@/lib/reussites/engine");
      await refreshReussites(userId);
    }
    return fresh;
  } catch (err) {
    console.error("[easter-eggs] échec du calcul des succès d'audience :", err);
    return [];
  }
}
