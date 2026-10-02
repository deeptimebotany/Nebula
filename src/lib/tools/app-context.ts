// Outils dans l'application (02/10/2026) : les 7 outils de /outils existent
// aussi une fois connecté (menu « Outils », /tools/…), préremplis avec les
// données de la marque active. Ce module calcule ce préremplissage, côté
// serveur, à partir de ce que Nebula a déjà relevé : aucun appel aux réseaux,
// aucune IA.
//
//  - Taux d'engagement : abonnés du dernier relevé de chaque compte, et
//    j'aime / commentaires / partages des publications des 30 derniers jours
//    (à défaut, des 10 dernières) relevées dans Engagements.
//  - Meilleur moment : fuseau de la marque, et le même « meilleur créneau »
//    que la Vue d'ensemble (src/lib/best-hour.ts via getAnalyticsInsights).
//  - Bio et hashtags : l'accroche du media kit, sinon la bio de la Page bio.
//  - Testeur de titre : les derniers titres YouTube relevés.
//  - Audit : les @pseudos des comptes connectés et la Page bio publiée.
import { prisma } from "@/lib/prisma";
import { getAnalyticsInsights } from "@/lib/server-data/brand-data";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { SITE_URL } from "@/lib/site";
import { auditPrefill, engagementTotals, isToolNetwork, type ToolAccountDTO, type ToolBestTimeDTO, type ToolContextDTO, type ToolNetwork } from "@/lib/tools/app-context-shared";

export * from "@/lib/tools/app-context-shared";
const ABOUT_MAX = 200;

/** Préremplissage des outils pour une marque (l'appelant a vérifié l'appartenance). */
export async function getToolContext(brandId: string, now: Date = new Date()): Promise<ToolContextDTO> {
  const [brand, connections, insights] = await Promise.all([
    prisma.brand.findUnique({
      where: { id: brandId },
      select: { name: true, slug: true, timezone: true, mediaKit: { select: { headline: true, about: true } }, linkPage: { select: { bio: true, published: true } } }
    }),
    prisma.socialConnection.findMany({
      where: { brandId },
      orderBy: [{ connectedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        network: true,
        displayName: true,
        handle: true,
        analytics: { where: { followers: { gt: 0 } }, orderBy: { capturedAt: "desc" }, take: 1, select: { followers: true } },
        postMetrics: { orderBy: { publishedAt: "desc" }, take: 200, select: { publishedAt: true, likes: true, comments: true, shares: true, title: true, network: true } }
      }
    }),
    getAnalyticsInsights(brandId)
  ]);

  const accounts: ToolAccountDTO[] = connections
    .filter((c) => isToolNetwork(c.network))
    .map((c) => ({
      connectionId: c.id,
      network: c.network as ToolNetwork,
      displayName: c.displayName,
      handle: c.handle,
      followers: c.analytics[0]?.followers ?? null,
      engagement: engagementTotals(c.postMetrics, now)
    }));

  const youtubeTitles = connections
    .filter((c) => c.network === "YOUTUBE")
    .flatMap((c) => c.postMetrics)
    .filter((m): m is typeof m & { title: string } => Boolean(m.title?.trim()))
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .map((m) => m.title.trim())
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 5);

  const about = (brand?.mediaKit?.headline?.trim() || brand?.linkPage?.bio?.trim() || "").slice(0, ABOUT_MAX);
  const bioUrl = brand?.linkPage?.published && brand.slug ? `${SITE_URL}/l/${brand.slug}` : null;

  return {
    brand: { name: brand?.name ?? "", timezone: brand?.timezone || DEFAULT_TIMEZONE },
    about,
    accounts,
    bestTimes: insights.perNetwork.map((p: ToolBestTimeDTO) => ({ network: p.network, hasEnoughData: p.hasEnoughData, bestHour: p.bestHour, sampleSize: p.sampleSize })),
    minSnapshots: insights.minRequired.snapshots,
    youtubeTitles,
    audit: auditPrefill(connections, bioUrl)
  };
}
