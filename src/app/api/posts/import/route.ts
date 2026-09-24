import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBrandMembership } from "@/lib/brand-access";
import { assertBrandWritable } from "@/lib/billing/trial-expiry";
import { localInputToUtc } from "@/lib/timezone";
import { trackGrowth } from "@/lib/growth";
import { NETWORKS } from "@/lib/types";
import { isPastSchedule } from "@/lib/schedule-guard";

// POST /api/posts/import — import CSV de publications (brief growth, lot
// G6.a). Le CSV est analysé dans le navigateur (src/lib/import/csv.ts) ;
// ici arrivent des lignes déjà mappées. Chaque ligne devient UN brouillon
// avec sa date et son heure dans le fuseau de la marque — jamais programmé
// automatiquement : l'utilisateur vérifie puis programme. Le média distant
// est conservé en référence (Post.sourceMediaUrl) et rapatrié en tâche de
// fond (src/lib/import-media.ts). Récapitulatif avec la raison par ligne.
const rowSchema = z.object({
  index: z.number().int().min(1),
  title: z.string().max(500).default(""),
  caption: z.string().max(10000).default(""),
  firstComment: z.string().max(2200).optional(),
  mediaUrl: z.string().url().max(2000).optional(),
  networks: z.array(z.enum(NETWORKS)).default([]),
  wallClock: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().default(null)
});
const bodySchema = z.object({
  brandId: z.string(),
  /** Comptes cibles choisis par réseau (étape 3 de l'import). */
  targets: z.record(z.enum(NETWORKS), z.array(z.string()).default([])),
  /** Réseaux à utiliser quand la ligne n'en précise aucun. */
  defaultNetworks: z.array(z.enum(NETWORKS)).default([]),
  rows: z.array(rowSchema).min(1).max(2000)
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Import invalide.", details: parsed.error.flatten() }, { status: 400 });
  const { brandId, targets, defaultNetworks, rows } = parsed.data;

  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  const writable = await assertBrandWritable(brandId);
  if (!writable.ok) return NextResponse.json({ error: writable.message, reason: "second_brand" }, { status: 402 });

  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { timezone: true } });
  if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

  // Les comptes ciblés doivent appartenir à la marque (et être connectés).
  const wantedIds = Array.from(new Set(Object.values(targets).flat()));
  const connections = wantedIds.length
    ? await prisma.socialConnection.findMany({ where: { id: { in: wantedIds }, brandId, status: { not: "DISCONNECTED" } }, select: { id: true, network: true } })
    : [];
  const byId = new Map(connections.map((c) => [c.id, c.network]));

  let created = 0;
  const skipped: { index: number; reason: string }[] = [];
  const now = new Date();

  for (const row of rows) {
    if (!row.caption.trim() && !row.title.trim()) {
      skipped.push({ index: row.index, reason: "ni texte ni titre" });
      continue;
    }
    const networks = row.networks.length ? row.networks : defaultNetworks;
    const targetRows = networks.flatMap((n) => (targets[n] ?? []).filter((id) => byId.get(id) === n).map((connectionId) => ({ connectionId, network: n, status: "PENDING" })));
    if (targetRows.length === 0) {
      skipped.push({ index: row.index, reason: networks.length ? `aucun compte choisi pour ${networks.join(", ")}` : "aucun réseau indiqué" });
      continue;
    }
    let scheduledAt: Date | undefined;
    if (row.wallClock) {
      const d = localInputToUtc(row.wallClock, brand.timezone);
      if (!d) {
        skipped.push({ index: row.index, reason: "date illisible" });
        continue;
      }
      if (isPastSchedule(d)) {
        skipped.push({ index: row.index, reason: "date déjà passée" });
        continue;
      }
      scheduledAt = d;
    }
    await prisma.post.create({
      data: {
        brandId,
        createdById: userId,
        title: row.title.trim(),
        caption: row.caption.trim(),
        firstComment: row.firstComment?.trim() || null,
        status: "DRAFT",
        scheduledAt,
        sourceMediaUrl: row.mediaUrl ?? null,
        importedAt: now,
        targets: { create: targetRows }
      }
    });
    created += 1;
  }

  await trackGrowth("csv_import", { created, skipped: skipped.length }, userId);
  return NextResponse.json({ ok: true, created, skipped });
}
