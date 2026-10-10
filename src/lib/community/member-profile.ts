// Profil public d'un membre de la Communauté (10/10/2026, demande de Lucas) :
// la petite bulle (clic sur la photo) et la page de profil (clic sur le
// pseudo). Seulement ce qui est déjà public dans Nebula : pseudo, photo,
// rang, badges, vitrine, compteurs de Réussites, activité du forum, et la
// bio et les liens de sa Page bio SI elle est publiée. Jamais le nom du
// compte, l'adresse e-mail, le palier ni les chiffres des réseaux.
import { prisma } from "@/lib/prisma";
import { achievementUnlockDb } from "@/lib/prisma-extra";
import { ALL_TIERS, COLLECTION_EGG_KEYS, rankAt, ringFromCosmetics, type RankId, type RingStyle } from "@/lib/reussites/catalog";
import { ALL_STARS, MENTOR_STAR, showcaseBadge, type ShowcaseBadge } from "@/lib/reussites/skills";
import { NETWORKS, type Network } from "@/lib/types";
import { displayHandle, normalizeHandle } from "./handle-rules";

export interface ProfileLink {
  label: string;
  url: string;
  /** Réseau reconnu d'après l'adresse (logo), sinon null. */
  network: Network | null;
}

export interface MemberProfileDTO {
  id: string;
  handle: string | null;
  /** « @pseudo ». */
  name: string;
  avatarUrl: string | null;
  ring: RingStyle | null;
  level: number;
  levelName: string;
  rankId: RankId;
  rankName: string;
  founder: boolean;
  mentor: boolean;
  showcase: Pick<ShowcaseBadge, "key" | "emoji" | "label">[];
  /** « octobre 2026 ». */
  memberSince: string;
  stats: { threads: number; replies: number; accomplishments: number; accomplishmentsTotal: number; stars: number; starsTotal: number; eggs: number };
  /** Bio et liens de sa Page bio, seulement si elle est publiée. */
  bio: { text: string; links: ProfileLink[]; url: string } | null;
  recentThreads: { id: string; title: string; createdAt: string; replies: number }[];
}

const NETWORK_HOSTS: [RegExp, Network][] = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YOUTUBE"],
  [/(^|\.)instagram\.com$/, "INSTAGRAM"],
  [/(^|\.)tiktok\.com$/, "TIKTOK"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "FACEBOOK"],
  [/(^|\.)bsky\.app$/, "BLUESKY"],
  [/(^|\.)threads\.(net|com)$/, "THREADS" as Network],
  [/(^|\.)pinterest\.[a-z.]+$/, "PINTEREST" as Network],
  [/(^|\.)linkedin\.com$/, "LINKEDIN" as Network]
];

/** Réseau d'un lien d'après son adresse (logo dans la bulle), sinon null. */
export function networkOfUrl(url: string): Network | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [re, network] of NETWORK_HOSTS) if (re.test(host) && (NETWORKS as readonly string[]).includes(network)) return network;
  return null;
}

/** Seulement des liens web (jamais javascript:, data:…). */
function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Retrouve un membre par son pseudo (avec ou sans @), sinon par son identifiant. */
export async function loadMemberProfile(key: string): Promise<MemberProfileDTO | null> {
  const handle = normalizeHandle(decodeURIComponent(key));
  const select = {
    id: true,
    handle: true,
    avatarUrl: true,
    createdAt: true,
    creatorXp: true,
    creatorLevel: true,
    enabledCosmetics: true,
    showcase: true,
    founderSince: true
  };
  const user = ((handle ? await prisma.user.findUnique({ where: { handle }, select }) : null) ??
    (await prisma.user.findUnique({ where: { id: key }, select }).catch(() => null))) as {
    id: string;
    handle: string | null;
    avatarUrl: string | null;
    createdAt: Date;
    creatorXp: number | null;
    creatorLevel: number | null;
    enabledCosmetics: string[] | null;
    showcase: string[] | null;
    founderSince: Date | null;
  } | null;
  if (!user) return null;

  const [unlocks, threads, replies, eggs, recent, page] = await Promise.all([
    achievementUnlockDb.findMany({ where: { userId: user.id } }),
    prisma.forumThread.count({ where: { authorId: user.id } }),
    prisma.forumReply.count({ where: { authorId: user.id } }),
    prisma.easterEggFound.count({ where: { userId: user.id, key: { in: COLLECTION_EGG_KEYS } } }),
    prisma.forumThread.findMany({ where: { authorId: user.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, title: true, createdAt: true, _count: { select: { replies: true } } } }),
    // Page bio : la première marque dont la personne est propriétaire et dont la page est publiée.
    prisma.linkPage.findFirst({
      where: { published: true, brand: { memberships: { some: { userId: user.id, role: "OWNER" } } } },
      orderBy: { createdAt: "asc" },
      select: { bio: true, brand: { select: { slug: true } }, links: { where: { enabled: true }, orderBy: { order: "asc" }, take: 12, select: { label: true, url: true } } }
    })
  ]);
  const have = new Set(unlocks.map((u) => u.key));
  const lvl = rankAt(user.creatorXp ?? 0, user.creatorLevel ?? 1);
  const links = (page?.links ?? [])
    .map((l: { label: string; url: string }) => {
      const url = safeUrl(l.url);
      return url ? { label: l.label.slice(0, 80), url, network: networkOfUrl(url) } : null;
    })
    .filter((l: ProfileLink | null): l is ProfileLink => Boolean(l));
  return {
    id: user.id,
    handle: user.handle,
    name: displayHandle(user.handle),
    avatarUrl: user.avatarUrl,
    ring: ringFromCosmetics(user.enabledCosmetics ?? []),
    level: lvl.level,
    levelName: lvl.name,
    rankId: lvl.rankId,
    rankName: lvl.rankName,
    founder: Boolean(user.founderSince),
    mentor: have.has(MENTOR_STAR),
    showcase: (user.showcase ?? [])
      .map((k) => showcaseBadge(k))
      .filter((b): b is ShowcaseBadge => Boolean(b) && have.has((b as ShowcaseBadge).key))
      .map(({ key, emoji, label }) => ({ key, emoji, label })),
    memberSince: user.createdAt.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    stats: {
      threads,
      replies,
      accomplishments: ALL_TIERS.filter((t) => have.has(t.key)).length,
      accomplishmentsTotal: ALL_TIERS.length,
      stars: ALL_STARS.filter((s) => have.has(s.key)).length,
      starsTotal: ALL_STARS.length,
      eggs
    },
    bio: page ? { text: page.bio.slice(0, 280), links, url: `/l/${page.brand.slug}` } : null,
    recentThreads: recent.map((t: { id: string; title: string; createdAt: Date; _count: { replies: number } }) => ({ id: t.id, title: t.title, createdAt: t.createdAt.toISOString(), replies: t._count.replies }))
  };
}
