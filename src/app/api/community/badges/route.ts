import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeBadges } from "@/lib/badges";

// GET /api/community/badges — badges de L'UTILISATEUR CONNECTÉ, calculés à
// partir de sa vraie activité communautaire (voir src/lib/badges.ts).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const [threadCount, replyCount, videoCount] = await Promise.all([
    prisma.forumThread.count({ where: { authorId: userId } }),
    prisma.forumReply.count({ where: { authorId: userId } }),
    prisma.sharedVideo.count({ where: { authorId: userId } })
  ]);

  const badges = computeBadges({ threads: threadCount, replies: replyCount, videos: videoCount });
  return NextResponse.json({ badges });
}
