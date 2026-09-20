import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { z } from "zod";

// GET /api/community/polls — liste des sondages avec résultats agrégés (les
// résultats restent visibles par tous, même les comptes Gratuit — seul le
// VOTE est réservé Premium, voir .../[id]/vote) et le choix déjà fait par
// l'utilisateur connecté le cas échéant.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const polls = await prisma.poll.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      options: {
        orderBy: { order: "asc" },
        include: { _count: { select: { votes: true } } }
      },
      votes: { where: { userId }, select: { optionId: true } }
    }
  });

  interface PollWithCounts {
    id: string;
    question: string;
    createdAt: Date;
    closesAt: Date | null;
    votes: { optionId: string }[];
    options: { id: string; label: string; _count: { votes: number } }[];
  }

  const shaped = (polls as PollWithCounts[]).map((p) => ({
    id: p.id,
    question: p.question,
    createdAt: p.createdAt,
    closesAt: p.closesAt,
    myVoteOptionId: p.votes[0]?.optionId ?? null,
    options: p.options.map((o) => ({ id: o.id, label: o.label, votes: o._count.votes }))
  }));

  return NextResponse.json({ polls: shaped });
}

const createSchema = z.object({
  question: z.string().min(3).max(200),
  options: z.array(z.string().min(1).max(80)).min(2).max(8)
});

// POST /api/community/polls — création réservée à l'admin (ADMIN_EMAILS,
// voir src/lib/admin.ts) : les sondages sont un contenu éditorial, pas une
// fonctionnalité ouverte à tout utilisateur.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = (session?.user as { email?: string } | undefined)?.email;
  if (!session?.user || !isAdminEmail(email)) {
    return NextResponse.json({ error: "Réservé à l'administrateur de la plateforme." }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { question, options } = parsed.data;

  const poll = await prisma.poll.create({
    data: {
      question: question.trim(),
      options: { create: options.map((label, i) => ({ label: label.trim(), order: i })) }
    },
    include: { options: true }
  });

  return NextResponse.json({ ok: true, poll });
}
