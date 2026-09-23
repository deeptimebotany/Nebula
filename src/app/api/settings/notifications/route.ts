import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// PATCH /api/settings/notifications — préférences de notification du compte
// (User.notifyOnFailure : échecs de publication ; User.lifecycleEmails :
// emails de conseils du brief growth). Les valeurs courantes sont servies
// par /api/me.
const bodySchema = z.object({ notifyOnFailure: z.boolean().optional(), lifecycleEmails: z.boolean().optional() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const data: { notifyOnFailure?: boolean; lifecycleEmails?: boolean } = {};
  if (typeof parsed.data.notifyOnFailure === "boolean") data.notifyOnFailure = parsed.data.notifyOnFailure;
  if (typeof parsed.data.lifecycleEmails === "boolean") data.lifecycleEmails = parsed.data.lifecycleEmails;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true, ...data });
}
