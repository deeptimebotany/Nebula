import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerUserId } from "@/lib/admin";
import { LIFECYCLE_KEYS } from "@/lib/emails/lifecycle-keys";

export const dynamic = "force-dynamic";

// GET /api/admin/acquisition — chiffres de la page propriétaire (brief
// growth, lot G0) : d'où viennent les inscrits et les payants, essais,
// offres, leads, listes d'attente, clics sur les surfaces publiques,
// emails de cycle de vie. Calculé à la demande, en base, sans outil tiers.
// 404 pour tout compte autre que le propriétaire.

type Row = { key: string; signups: number; paid: number };

function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Row[] {
  const map = new Map<string, Row>();
  for (const r of rows) {
    const key = keyOf(r) || "(direct)";
    const entry = map.get(key) ?? { key, signups: 0, paid: 0 };
    entry.signups += 1;
    if ((r as { firstPaidAt: Date | null }).firstPaidAt) entry.paid += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.signups - a.signups);
}

export async function GET() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const now = new Date();
  const since90 = windowStart(90);

  const [users, trials, offers, leads, leadEmails, waitlist, events, lifecycle, paidTotal, usersTotal] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: since90 } },
      select: { createdAt: true, firstPaidAt: true, acqSource: true, acqMedium: true, acqCampaign: true, acqVia: true, acqLanding: true, referredByCode: true, email: true }
    }),
    prisma.user.findMany({ where: { trialEndsAt: { not: null } }, select: { trialEndsAt: true, firstPaidAt: true, subscription: { select: { plan: true, status: true } } } }),
    prisma.user.findMany({ where: { offerExpiresAt: { not: null } }, select: { offerExpiresAt: true, offerUsedAt: true } }),
    prisma.toolLead.findMany({ where: { createdAt: { gte: since90 } }, select: { email: true, tool: true, consent: true, createdAt: true } }),
    prisma.toolLead.findMany({ select: { email: true }, distinct: ["email"] }),
    prisma.networkWaitlist.groupBy({ by: ["network"], _count: { _all: true } }),
    prisma.growthEvent.findMany({ where: { createdAt: { gte: since90 } }, select: { name: true, meta: true, createdAt: true } }),
    prisma.lifecycleEmail.groupBy({ by: ["key"], _count: { _all: true } }),
    prisma.user.count({ where: { firstPaidAt: { not: null } } }),
    prisma.user.count()
  ]);

  const inWindow = (days: number) => users.filter((u) => u.createdAt >= windowStart(days));
  const signups = { d7: inWindow(7).length, d30: inWindow(30).length, d90: users.length };
  const paidInWindow = { d7: inWindow(7).filter((u) => u.firstPaidAt).length, d30: inWindow(30).filter((u) => u.firstPaidAt).length, d90: users.filter((u) => u.firstPaidAt).length };

  // Leads devenus inscrits : adresse présente dans ToolLead ET dans User.
  const leadEmailSet = new Set(leadEmails.map((l) => l.email.toLowerCase()));
  const signupsFromLeads = users.filter((u) => leadEmailSet.has(u.email.toLowerCase())).length;

  const countEvents = (name: string, days: number) => events.filter((e) => e.name === name && e.createdAt >= windowStart(days)).length;
  const eventsBySurface = (name: string) => {
    const map = new Map<string, number>();
    for (const e of events) {
      if (e.name !== name) continue;
      const surface = String((e.meta as { surface?: string } | null)?.surface ?? "?");
      map.set(surface, (map.get(surface) ?? 0) + 1);
    }
    return [...map.entries()].map(([surface, count]) => ({ surface, count })).sort((a, b) => b.count - a.count);
  };
  const upgradeByReason = (name: string) => {
    const map = new Map<string, number>();
    for (const e of events) {
      if (e.name !== name) continue;
      const reason = String((e.meta as { reason?: string } | null)?.reason ?? "?");
      map.set(reason, (map.get(reason) ?? 0) + 1);
    }
    return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  };

  const trialActive = trials.filter((t) => t.trialEndsAt! > now && !t.firstPaidAt).length;
  const trialEnded = trials.filter((t) => t.trialEndsAt! <= now).length;
  const trialConverted = trials.filter((t) => t.firstPaidAt).length;

  return NextResponse.json({
    generatedAt: now.toISOString(),
    totals: { users: usersTotal, paid: paidTotal },
    signups,
    paidInWindow,
    bySource: groupBy(users, (u) => u.acqSource ?? ""),
    byMedium: groupBy(users, (u) => u.acqMedium ?? ""),
    byCampaign: groupBy(users, (u) => u.acqCampaign ?? ""),
    byVia: groupBy(users.filter((u) => u.acqVia), (u) => u.acqVia ?? ""),
    byLanding: groupBy(users, (u) => u.acqLanding ?? ""),
    referred: { signups: users.filter((u) => u.referredByCode).length, paid: users.filter((u) => u.referredByCode && u.firstPaidAt).length },
    trials: { active: trialActive, ended: trialEnded, converted: trialConverted },
    offers: { shown: offers.length, used: offers.filter((o) => o.offerUsedAt).length, active: offers.filter((o) => !o.offerUsedAt && o.offerExpiresAt! > now).length },
    leads: { total: leads.length, consented: leads.filter((l) => l.consent).length, signupsFromLeads, byTool: Object.entries(leads.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.tool]: (acc[l.tool] ?? 0) + 1 }), {})).map(([tool, count]) => ({ tool, count })) },
    waitlist: waitlist.map((w) => ({ network: w.network, count: w._count._all })),
    badges: { clicks7: countEvents("badge_click", 7), clicks30: countEvents("badge_click", 30), clicks90: countEvents("badge_click", 90), bySurface: eventsBySurface("badge_click") },
    conversionBlocks: { clicks30: countEvents("conversion_block_click", 30), clicks90: countEvents("conversion_block_click", 90), bySurface: eventsBySurface("conversion_block_click") },
    landings: { views30: countEvents("landing_view", 30), views90: countEvents("landing_view", 90) },
    tools: { ctaClicks30: countEvents("tool_cta_click", 30), ctaClicks90: countEvents("tool_cta_click", 90) },
    exitIntent: { shown30: countEvents("exit_intent_shown", 30), clicked30: countEvents("exit_intent_clicked", 30) },
    upgrade: { shown: upgradeByReason("upgrade_modal_shown"), clicked: upgradeByReason("upgrade_modal_clicked"), converted: upgradeByReason("paid") },
    referralPrompts: { shown30: countEvents("referral_prompt_shown", 30), copied30: countEvents("referral_link_copied", 30) },
    imports: { csv30: countEvents("csv_import", 30), linktree30: countEvents("linktree_import", 30), waitlist30: countEvents("waitlist_joined", 30) },
    lifecycle: LIFECYCLE_KEYS.map((key) => ({ key, sent: lifecycle.find((l) => l.key === key)?._count._all ?? 0 }))
  });
}
