import { prisma } from "@/lib/prisma";

// Calendrier client en lecture seule (produit n°7 de la feuille de route) —
// voir CalendarShare dans prisma/schema.prisma. Une marque n'a jamais plus
// d'un CalendarShare (relation 1-1) : créé à la volée au premier accès
// (depuis l'éditeur dans /calendar-share), exactement comme
// getOrCreateLinkPage()/getOrCreateBrandReport().
export async function getOrCreateCalendarShare(brandId: string) {
  const existing = await prisma.calendarShare.findUnique({ where: { brandId } });
  if (existing) return existing;
  return prisma.calendarShare.create({ data: { brandId } });
}

export interface UpcomingPost {
  id: string;
  title: string;
  scheduledAt: string;
  thumbnailUrl: string | null;
  networks: string[];
}

// Ne renvoie que les publications déjà engagées côté planification
// (SCHEDULED/PUBLISHING) — jamais un brouillon (DRAFT), qui n'a rien d'un
// engagement envers le client et pourrait changer ou disparaître avant
// publication. "networks" dé-doublonne les réseaux visés par la publication
// (plusieurs PostTarget peuvent partager un même réseau si plusieurs comptes
// sont ciblés).
export async function computeUpcomingPosts(brandId: string, windowDays: number): Promise<UpcomingPost[]> {
  const now = new Date();
  const until = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const posts = await prisma.post.findMany({
    where: {
      brandId,
      status: { in: ["SCHEDULED", "PUBLISHING"] },
      scheduledAt: { gte: now, lte: until }
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      targets: { select: { network: true } },
      media: {
        take: 1,
        orderBy: { order: "asc" },
        select: { mediaAsset: { select: { thumbnailUrl: true, url: true, type: true } } }
      }
    }
  });

  return posts.map(
    (p: {
      id: string;
      title: string;
      scheduledAt: Date | null;
      targets: { network: string }[];
      media: { mediaAsset: { thumbnailUrl: string | null; url: string; type: string } }[];
    }) => {
      const firstMedia = p.media[0]?.mediaAsset;
      const thumbnailUrl = firstMedia ? firstMedia.thumbnailUrl || firstMedia.url : null;
      const networks = Array.from(new Set(p.targets.map((t) => t.network)));
      return {
        id: p.id,
        title: p.title || "(sans titre)",
        scheduledAt: (p.scheduledAt as Date).toISOString(),
        thumbnailUrl,
        networks
      };
    }
  );
}
