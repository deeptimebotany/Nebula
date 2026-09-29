import { NextRequest, NextResponse } from "next/server";
import { requireOwnerUserId } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { ANON_MIN_ACCOUNTS, FEATURE_LABELS, METRIC_LABELS, type AnonFeature } from "@/lib/anon-stats/aggregate";
import { computeAnonStats, periodOf } from "@/lib/anon-stats/load";

// /api/admin/stats — statistiques de groupe anonymes (29/09/2026), compte
// propriétaire uniquement (404 sinon).
//   GET  ?period=AAAA-MM[&format=csv] → valeurs du mois (seulement celles qui
//        passent le seuil de 20 comptes : les autres ne sont jamais stockées)
//   POST { period? } → recalcule un mois tout de suite
// Rien n'est vendu ni envoyé à qui que ce soit d'ici : l'export sert à
// préparer, plus tard et après validation par un juriste, des rapports de
// tendances.
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

function dimensionLabel(metric: string, dimension: string): string {
  if (metric === "fonctions.adoption") return FEATURE_LABELS[dimension as AnonFeature] ?? dimension;
  return dimension.replace("|", " · ") || "Tous";
}

export async function GET(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const period = req.nextUrl.searchParams.get("period") ?? periodOf(new Date());
  if (!PERIOD.test(period)) return NextResponse.json({ error: "Mois invalide." }, { status: 400 });
  const [rows, periods, consenting] = await Promise.all([
    prisma.anonStat.findMany({ where: { period }, orderBy: [{ metric: "asc" }, { value: "desc" }] }),
    prisma.anonStat.findMany({ distinct: ["period"], select: { period: true }, orderBy: { period: "desc" }, take: 24 }),
    prisma.user.count({ where: { statsConsent: true } })
  ]);
  const cells = rows.map((r) => ({
    metric: r.metric,
    metricLabel: METRIC_LABELS[r.metric] ?? r.metric,
    dimension: r.dimension,
    dimensionLabel: dimensionLabel(r.metric, r.dimension),
    value: r.value,
    sampleAccounts: r.sampleAccounts,
    sampleItems: r.sampleItems,
    computedAt: r.computedAt.toISOString()
  }));
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ["mois;indicateur;detail;valeur;comptes;elements", ...cells.map((c) => [period, c.metricLabel, c.dimensionLabel, c.value, c.sampleAccounts, c.sampleItems].map(esc).join(";"))].join("\n");
    return new NextResponse(`﻿${csv}\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nebula-statistiques-anonymes-${period}.csv"` } });
  }
  return NextResponse.json({ period, periods: periods.map((p) => p.period), consenting, threshold: ANON_MIN_ACCOUNTS, cells });
}

export async function POST(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { period?: unknown };
  const period = typeof body.period === "string" && PERIOD.test(body.period) ? body.period : periodOf(new Date());
  const result = await computeAnonStats(period);
  return NextResponse.json({ ok: true, period, ...result });
}
