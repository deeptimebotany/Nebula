import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { dailyLimit, dueMonth } from "@/lib/monthly-summary/send";
import { monthKeyOf, monthLabel, previousMonth } from "@/lib/monthly-summary/period";
import { SEND_TZ } from "@/lib/monthly-summary/period-window";
import { SummaryPreview } from "./summary-preview";

// Page propriétaire « Bilans du mois » (03/10/2026) : inscrits, envois du
// dernier mois par statut, plafond du jour, et aperçu de l'e-mail de
// n'importe quelle marque. 404 pour tout autre compte.
export const dynamic = "force-dynamic";
export const metadata = { title: "Bilans du mois — Nebula", robots: { index: false, follow: false } };

const int = (v: number) => v.toLocaleString("fr-FR");

export default async function AdminSummariesPage() {
  if (!(await requireOwnerUserId())) notFound();
  const now = new Date();
  const month = dueMonth(now) ?? previousMonth(monthKeyOf(now, SEND_TZ));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [subscribers, byStatus, sentToday, brands] = await Promise.all([
    prisma.user.count({ where: { monthlySummaryAt: { not: null } } }),
    prisma.monthlySummary.groupBy({ by: ["status"], where: { month }, _count: { _all: true } }),
    prisma.monthlySummary.count({ where: { status: "SENT", sentAt: { gte: dayStart } } }),
    prisma.brand.findMany({
      where: { connections: { some: {} } },
      select: { id: true, name: true, memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 300
    })
  ]);
  const count = (s: string) => (byStatus as { status: string; _count: { _all: number } }[]).find((r) => r.status === s)?._count._all ?? 0;
  const limit = dailyLimit();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bilans du mois"
        description="E-mail mensuel envoyé le 3 du mois à partir de 9 h (heure de Paris) aux personnes qui l'ont activé, un par marque cochée."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">Inscrits</p>
          <p className="mt-1 font-display text-3xl text-white">{int(subscribers)}</p>
          <p className="mt-1 text-xs text-slate-500">comptes qui ont activé le bilan</p>
        </GlassCard>
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">Bilan {monthLabel(month)}</p>
          <p className="mt-1 font-display text-3xl text-white">{int(count("SENT"))}</p>
          <p className="mt-1 text-xs text-slate-500">
            envoyés · {int(count("SKIPPED"))} sans données · {int(count("FAILED"))} en échec · {int(count("SENDING"))} en cours
          </p>
        </GlassCard>
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">Aujourd&apos;hui</p>
          <p className="mt-1 font-display text-3xl text-white">
            {int(sentToday)} <span className="text-base text-slate-500">/ {Number.isFinite(limit) ? int(limit) : "∞"}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Plafond : MONTHLY_SUMMARY_DAILY_LIMIT dans Vercel (0 = sans plafond, avec Resend Pro).</p>
        </GlassCard>
      </div>
      <SummaryPreview
        month={month}
        brands={(brands as { id: string; name: string; memberships: { user: { email: string } }[] }[]).map((b) => ({ id: b.id, label: `${b.name}${b.memberships[0] ? ` · ${b.memberships[0].user.email}` : ""}` }))}
      />
    </div>
  );
}
