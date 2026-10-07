import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { loadAiCostReport } from "@/lib/ai/cost-report";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { PLAN_LIMITS, PLANS, type Plan } from "@/lib/plans";
import { GeminiDiagnosticCard } from "./gemini-diagnostic";

// Page propriétaire « Coûts de l'IA » (lot E5, brief « Essai 14 jours » ;
// palier payant de Gemini le 30/09/2026) : modèles et prix en vigueur, ce que
// l'IA coûte chaque jour, par palier, et en moyenne PAR ACTION, pour ajuster
// les quotas sur des chiffres réels. Tout est estimé (jetons × prix de
// pricing.ts). 404 pour tout autre compte, exclue des robots. Page serveur ;
// seul le bouton « Tester la connexion à Gemini » (07/10/2026) est un
// composant client.
export const dynamic = "force-dynamic";
export const metadata = { title: "Coûts de l'IA — Nebula", robots: { index: false, follow: false } };

const usd = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 3 : 2 })} $`;
const int = (v: number) => v.toLocaleString("fr-FR");
const KIND_LABEL: Record<string, string> = { text: "Textes", image: "Images", studio: "Studio", assistant: "Assistant", retention: "Rétention" };
const ACTION_LABEL: Record<string, string> = { text: "par texte", image: "par image", studio: "par génération", assistant: "par message", retention: "par analyse" };
/** Prix au million de jetons : « 0,75 $ ». */
const perM = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} $`;
const dateFr = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

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

      <GeminiDiagnosticCard />

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard hover={false}>
          <h2 className="font-display text-base font-medium text-white">Modèles et prix en vigueur</h2>
          <p className="mt-1 text-xs text-slate-500">Palier payant de l&apos;API Gemini. Réglage : GEMINI_MODEL, GEMINI_RETENTION_MODEL, GEMINI_IMAGE_MODEL sur Vercel. Jetons de vidéo comptés en entrée.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {r.models.map((m) => (
              <li key={m.model} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-white">{m.model}</span>
                  <span className="text-xs text-slate-400">{m.roles.join(" · ")}</span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-slate-300">
                  {perM(m.price.inputPerMillion)} entrée · {perM(m.price.outputPerMillion)} sortie (par million de jetons)
                  {m.price.perImage > 0 && <> · {usd(m.price.perImage)} par image 1K</>}
                </p>
                {m.next && (
                  <p className="mt-1 text-xs text-amber-200">
                    À partir du {dateFr(m.next.from)} : {perM(m.next.inputPerMillion)} entrée · {perM(m.next.outputPerMillion)} sortie
                  </p>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  30 jours : {int(m.calls30)} appel{m.calls30 > 1 ? "s" : ""} · {usd(m.costUsd30)}
                </p>
              </li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard hover={false}>
          <h2 className="font-display text-base font-medium text-white">Coût moyen par action (30 jours)</h2>
          <p className="mt-1 text-xs text-slate-500">Coût estimé ÷ actions abouties (une analyse, une image, un message, une génération). Sans mesure : estimation de départ, en gris.</p>
          <ul className="mt-3 divide-y divide-white/[0.06] text-sm">
            {r.last30.byKind.map((k) => (
              <li key={k.kind} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-slate-300">{KIND_LABEL[k.kind] ?? k.kind}</span>
                <span className={k.measured ? "tabular-nums text-white" : "tabular-nums text-slate-500"}>
                  {usd(k.perActionUsd)} {ACTION_LABEL[k.kind] ?? ""}
                  <span className="ml-2 text-xs text-slate-500">{k.measured ? `${int(k.actions)} action${k.actions > 1 ? "s" : ""}` : "estimation"}</span>
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <h2 className="font-display text-base font-medium text-white">Budgets globaux du jour</h2>
        <p className="mt-1 text-sm text-slate-400">Essai et Gratuit, compteurs séparés ; les comptes payants n&apos;y sont pas comptés (ils ont leurs quotas du mois). Réglage : variables TRIAL_AI_DAILY_* et FREE_AI_DAILY_* sur Vercel.</p>
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
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-medium">Palier</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Actions</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Appels</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Jetons entrée</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Dont vidéo</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Jetons sortie</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Images</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Coût estimé</th>
                  <th scope="col" className="py-2 text-right font-medium">Par action</th>
                </tr>
              </thead>
              <tbody>
                {r.last30.rows.map((row) => (
                  <tr key={`${row.plan}-${row.kind}`} className="border-t border-white/[0.06]">
                    <td className="py-2 pr-3 text-slate-200">{planLabel(row.plan)}</td>
                    <td className="py-2 pr-3 text-slate-300">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{int(row.actions)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{int(row.calls)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{int(row.inputTokens)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{row.videoTokens > 0 ? int(row.videoTokens) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{int(row.outputTokens)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{int(row.images)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white">{usd(row.costUsd)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-300">{row.perActionUsd === null ? "—" : usd(row.perActionUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard hover={false}>
          <h2 className="font-display text-base font-medium text-white">Les 20 comptes les plus coûteux (ce mois-ci)</h2>
          <p className="mt-1 text-xs text-slate-500">Identifiant et palier seulement. Quotas du mois de chaque compte (Rétention, images, Studio, assistant ; essais : depuis leur début) et textes des 7 derniers jours, × coût moyen par action. Les analyses achetées ne sont pas comptées ici.</p>
          {r.topAccounts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Aucun usage compté ce mois-ci.</p>
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
