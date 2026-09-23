// Tableau comparatif d'une page « alternative à » (brief growth, lot G5.a) :
// généré depuis plans.ts (Nebula) et src/data/competitors.ts (concurrent).
// Composant serveur, aucun état.
import { FEATURE_LABELS, featureText, formatPrice, formatEur, nebulaEstimate, REFERENCE_SCENARIO, toEur, type Competitor } from "@/data/competitors";
import { PLAN_LIMITS } from "@/lib/plans";
import { NETWORKS, NETWORK_META } from "@/lib/types";

export function CompetitorTable({ competitor }: { competitor: Competitor }) {
  const pro = PLAN_LIMITS.PRO;
  const tier0 = pro.tiers[0];
  const ref = competitor.estimate(REFERENCE_SCENARIO);
  const refEur = toEur(ref.monthly, competitor.currency);
  const nebulaRef = nebulaEstimate(REFERENCE_SCENARIO);
  const nebulaNetworks = NETWORKS.map((n) => NETWORK_META[n].label).join(", ");

  const rows: { label: string; them: string; us: string }[] = [
    { label: "Prix d'entrée (par mois, annuel)", them: competitor.entryMonthly === null ? "non publié" : `${formatPrice(competitor.entryMonthly, competitor.currency)}${competitor.currency === "USD" ? ` (≈ ${formatEur(toEur(competitor.entryMonthly, competitor.currency) ?? 0)})` : ""}`, us: `${formatEur(tier0.priceYearly / 12, 2)} (${tier0.priceMonthly} € en mensuel)` },
    { label: "3 marques, 8 comptes, 1 utilisateur", them: refEur === null ? "non publié" : `≈ ${formatEur(refEur)} / mois`, us: `${formatEur(nebulaRef.monthlyAnnual, 2)} / mois` },
    { label: "Plan gratuit", them: competitor.freePlan ?? "Non (essai limité)", us: `Oui : ${PLAN_LIMITS.FREE.features[0]}, ${PLAN_LIMITS.FREE.features[1].toLowerCase()}, ${PLAN_LIMITS.FREE.features[2].toLowerCase()}` },
    { label: "Utilisateurs", them: /utilisateur/i.test(competitor.entryLabel) ? "Facturés en plus" : "Selon le palier", us: "Illimités, sans supplément" },
    { label: "Réseaux", them: competitor.networks.join(", "), us: nebulaNetworks },
    ...(Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[]).map((k) => ({
      label: FEATURE_LABELS[k],
      them: featureText(competitor.features[k]),
      us: k === "calendar" || k === "analytics" ? "Oui, dès le Gratuit" : k === "linkInBio" ? `Oui, dès le Gratuit (${PLAN_LIMITS.FREE.maxBioLinks} liens) — ${pro.maxBioLinks} en Pro` : "Oui, en Pro"
    })),
    { label: "Langue", them: competitor.language, us: "Interface et support en français" },
    { label: "Devise", them: competitor.currency === "EUR" ? "Euros" : "Dollars", us: "Euros" }
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-3 font-semibold">&nbsp;</th>
            <th scope="col" className="px-4 py-3 font-semibold text-slate-300">{competitor.name}</th>
            <th scope="col" className="px-4 py-3 font-semibold text-aurora-200">Nebula</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="px-4 py-3 text-left font-medium text-white">{r.label}</th>
              <td className="px-4 py-3 text-slate-400">{r.them}</td>
              <td className="px-4 py-3 text-slate-200">{r.us}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
