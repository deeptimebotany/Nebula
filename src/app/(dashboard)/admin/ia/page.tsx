import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { loadAiCostReport } from "@/lib/ai/cost-report";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { PLAN_LIMITS, PLANS, type Plan } from "@/lib/plans";

// Page propriétaire « Coûts de l'IA » (lot E5, brief « Essai 14 jours ») :
// ce que l'IA coûte chaque jour, par palier, pour ajuster les limites sur
// des chiffres réels. Tout est estimé (jetons × prix de pricing.ts). 404
// pour tout autre compte, exclue des robots. Page serveur, sans JavaScript.
export const dynamic = "force-dynamic";
export const metadata = { title: "Coûts de l'IA — Nebula", robots: { index: false, follow: false } };

const usd = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 3 : 2 })} $`;
const int = (v: number) => v.toLocaleString("fr-FR");
const KIND_LABEL: Record<string, string> = { text: "Textes", image: "Images", studio: "Studio", assistant: "Assistant", retention: "Rétention" };

function planLabel(plan: string): string {
  if ((PLANS as readonly string[]).includes(plan)) return PLAN_LIMITS[plan as Plan].label;
  return plan === "PUBLIC" ? "Sans compte (audit)" : plan === "ADMIN" ? "Propriétaire" : plan;
}

export default async function AdminAiCostsPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  const r = await loadAiCostReport();
  const maxDay = Math.max(0.0001, ...r.last30.byDay.map((d) => d.costUsd));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coûts de l'IA"
        description={`Estimations : jetons × prix de Gemini vérifiés le ${new Date(r.pricingVerifiedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} (src/lib/ai/pricing.ts). Les montants facturés font foi dans Google Cloud → Facturation.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">Aujourd&apos;hui (estimé)</p>
          <p className="mt-1 font-display text-3xl text-white">{usd(r.today.costUsd)}</p>
          <p className="mt-1 text-xs text-slate-500">Alerte dans la cloche au-delà de {usd(r.alertUsd)} (AI_DAILY_COST_ALERT_USD).</p>
        </GlassCard>
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">30 derniers jours</p>
          <p className="mt-1 font-display text-3xl text-white">{usd(r.last30.totalUsd)}</p>
          <p className="mt-1 text-xs text-slate-500">Tous paliers et types confondus.</p>
        </GlassCard>
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">Essai → payant</p>
          <p className="mt-1 font-display text-3xl text-white">{r.conversion.rate === null ? "—" : `${(r.conversion.rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}</p>
          <p className="mt-1 text-xs text-slate-500">
            {int(r.conversion.trialsConverted)} payants sur {int(r.conversion.trialsEnded)} essais terminés (lot G0).
          </p>
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <h2 className="font-display text-base font-medium text-white">Budgets globaux du jour</h2>
        <p className="mt-1 text-sm text-slate-400">Essai et Gratuit, compteurs séparés ; les comptes payants ne sont jamais comptés. Réglage : variables TRIAL_AI_DAILY_* et FREE_AI_DAILY_* sur Vercel.</p>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {r.budgets.map((b) => {
            const pct = b.limit > 0 ? Math.min(100, Math.round((b.used / b.limit) * 100)) : 100;
            return (
              <li key={`${b.bucket}-${b.type}`} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <p className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-300">
                    {b.bucket === "trial" ? "Essai" : "Gratuit"} · {b.type === "image" ? "images" : "appels texte"}
                  </span>
                  <span className="tabular-nums text-white">
                    {int(b.used)} / {int(b.limit)}
                  </span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${pct} % du budget utilisé`}>
                  <div className={pct >= 90 ? "h-full rounded-full bg-amber-400" : "h-full rounded-full bg-aurora-400"} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </GlassCard>

      <GlassCard hover={false}>
        <h2 className="font-display text-base font-medium text-white">Coût estimé par jour (30 jours)</h2>
        <div className="mt-4 flex h-32 items-end gap-[2px]" role="img" aria-label="Coût estimé de l'IA par jour sur 30 jours (détail dans le tableau ci-dessous)">
          {r.last30.byDay.map((d) => (
            <div key={d.day} className="flex h-full flex-1 items-end" title={`${new Date(d.day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} : ${usd(d.costUsd)}`}>
              <div className="w-full rounded-t bg-aurora-400/80" style={{ height: `${Math.max(d.costUsd > 0 ? 2 : 0, (d.costUsd / maxDay) * 100)}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-2 flex justify-between text-[11px] text-slate-500">
          <span>{new Date(r.last30.byDay[0].day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
          <span>max {usd(maxDay)}</span>
          <span>aujourd&apos;hui</span>
        </p>
      </GlassCard>

      <GlassCard hover={false}>
        <h2 className="font-display text-base font-medium text-white">Par palier et par type (30 jours)</h2>
        {r.last30.rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Aucun appel mesuré sur la période.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-medium">Palier</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Appels</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Jetons entrée</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Jetons sortie</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Images</th>
                  <th scope="col" className="py-2 text-right font-medium">Coût estimé</th>
                </tr>
              </thead>
              <tbody>
                {r.last30.rows.map((row) => (
                  <tr key={`${row.plan}-${row.kind}`} className="border-t border-white/[0.06]">
                    <td className="py-2 pr-3 text-slate-200">{planLabel(row.plan)}</td>
                    <td className="py-2 pr-3 text-slate-300">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{int(row.calls)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{int(row.inputTokens)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{int(row.outputTokens)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{int(row.images)}</td>
                    <td className="py-2 text-right tabular-nums text-white">{usd(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard hover={false}>
          <h2 className="font-display text-base font-medium text-white">Les 20 comptes les plus coûteux (7 jours)</h2>
          <p className="mt-1 text-xs text-slate-500">Identifiant et palier seulement. Estimation à partir des compteurs par compte (outils, assistant, Rétention ; tout l&apos;usage en Gratuit et en Essai) et du Studio.</p>
          {r.topAccounts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Aucun usage compté cette semaine.</p>
          ) : (
            <ol className="mt-3 space-y-1.5 text-sm">
              {r.topAccounts.map((a, i) => (
                <li key={a.userId} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-1.5">
                  <span className="min-w-0 truncate font-mono text-xs text-slate-300">
                    {i + 1}. {a.userId}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{planLabel(a.plan)}</span>
                  <span className="shrink-0 tabular-nums text-white">{usd(a.costUsd)}</span>
                </li>
              ))}
            </ol>
          )}
        </GlassCard>
        <GlassCard hover={false}>
          <h2 className="font-display text-base font-medium text-white">Coût des essais par abonné gagné</h2>
          <p className="mt-1 text-xs text-slate-500">Coût IA des essais du mois ÷ nombre d&apos;abonnés gagnés ce mois-là : le chiffre qui dit si l&apos;essai se rembourse.</p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th scope="col" className="py-2 pr-3 font-medium">Mois</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">IA des essais</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Nouveaux abonnés</th>
                <th scope="col" className="py-2 text-right font-medium">Par abonné</th>
              </tr>
            </thead>
            <tbody>
              {r.conversion.months.map((m) => (
                <tr key={m.month} className="border-t border-white/[0.06]">
                  <td className="py-2 pr-3 text-slate-200">{new Date(`${m.month}-15`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{usd(m.trialAiCostUsd)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{int(m.newSubscribers)}</td>
                  <td className="py-2 text-right tabular-nums text-white">{m.costPerSubscriber === null ? "—" : usd(m.costPerSubscriber)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      </div>
    </div>
  );
}
