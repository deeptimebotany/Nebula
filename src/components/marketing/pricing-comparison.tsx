// Tableau comparatif des paliers, construit à partir de PLAN_LIMITS
// (src/lib/plans.ts) — la même source que la page Facturation et la grille
// tarifaire, pour que les trois ne puissent jamais se contredire.
import { PLAN_LIMITS, PUBLIC_PLANS as PLANS, RETENTION_PACK, formatEuroCents, isUnlimitedPlan, type AiMonthlyLimits, type PublicPlan as Plan } from "@/lib/plans";
import { IconCheck } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";

type Cell = string | boolean;

function brandsLabel(plan: Plan): string {
  const tiers = PLAN_LIMITS[plan].tiers.map((t) => t.maxBrands);
  return tiers.length === 1 ? String(tiers[0]) : `${tiers[0]}, ${tiers.slice(1, -1).join(", ")}${tiers.length > 2 ? " ou " : ""}${tiers[tiers.length - 1]} au choix`;
}

function limitLabel(plan: Plan, value: number, unit: string): string {
  return isUnlimitedPlan(plan) ? "Illimité" : `${value} ${unit}`.trim();
}

/** Quota d'IA du mois (30/09/2026) : « 15 par mois », ou — si le palier n'en a pas. */
function monthly(key: keyof AiMonthlyLimits): Record<Plan, Cell> {
  const cell = (plan: Plan): Cell => (PLAN_LIMITS[plan].aiMonthly[key] > 0 ? `${PLAN_LIMITS[plan].aiMonthly[key]} par mois` : false);
  return { FREE: cell("FREE"), PRO: cell("PRO"), AGENCY: cell("AGENCY") };
}

const ROWS: { label: string; cells: Record<Plan, Cell>; hint?: string }[] = [
  { label: "Marques", cells: { FREE: brandsLabel("FREE"), PRO: brandsLabel("PRO"), AGENCY: brandsLabel("AGENCY") }, hint: "Le prix des paliers payants dépend du nombre choisi." },
  {
    label: "Comptes connectés par marque",
    cells: {
      FREE: limitLabel("FREE", PLAN_LIMITS.FREE.maxConnections, "comptes"),
      PRO: limitLabel("PRO", PLAN_LIMITS.PRO.maxConnections, "comptes"),
      AGENCY: limitLabel("AGENCY", PLAN_LIMITS.AGENCY.maxConnections, "comptes")
    },
    hint: "Plusieurs comptes possibles sur un même réseau."
  },
  {
    label: "Publications programmées par mois et par marque",
    cells: {
      FREE: limitLabel("FREE", PLAN_LIMITS.FREE.maxPostsPerMonth, ""),
      PRO: limitLabel("PRO", PLAN_LIMITS.PRO.maxPostsPerMonth, ""),
      AGENCY: limitLabel("AGENCY", PLAN_LIMITS.AGENCY.maxPostsPerMonth, "")
    }
  },
  {
    label: "Liens sur la page « link in bio »",
    cells: {
      FREE: limitLabel("FREE", PLAN_LIMITS.FREE.maxBioLinks, ""),
      PRO: limitLabel("PRO", PLAN_LIMITS.PRO.maxBioLinks, ""),
      AGENCY: limitLabel("AGENCY", PLAN_LIMITS.AGENCY.maxBioLinks, "")
    }
  },
  { label: "Calendrier éditorial et analytics", cells: { FREE: true, PRO: true, AGENCY: true } },
  { label: "Publier une même vidéo sur plusieurs réseaux", cells: { FREE: true, PRO: true, AGENCY: true } },
  { label: "Titres et légendes par IA", cells: { FREE: PLAN_LIMITS.FREE.aiEnabled, PRO: PLAN_LIMITS.PRO.aiEnabled, AGENCY: PLAN_LIMITS.AGENCY.aiEnabled } },
  { label: "Rétention IA : l'IA regarde vos vidéos YouTube", cells: monthly("retention"), hint: "Les moments où les spectateurs partent, et pourquoi. Analyses remises à zéro le 1er du mois." },
  {
    label: "Recharges Rétention",
    cells: { FREE: PLAN_LIMITS.FREE.retentionPacks, PRO: PLAN_LIMITS.PRO.retentionPacks ? `+${RETENTION_PACK.credits} pour ${formatEuroCents(RETENTION_PACK.priceCents)}` : false, AGENCY: PLAN_LIMITS.AGENCY.retentionPacks ? `+${RETENTION_PACK.credits} pour ${formatEuroCents(RETENTION_PACK.priceCents)}` : false },
    hint: "Paiement unique, sans date limite, utilisées après le quota du mois."
  },
  { label: "Miniatures générées par IA", cells: monthly("image") },
  { label: "Studio IA (idées, scripts, séries)", cells: monthly("studio") },
  { label: "Messages à l'assistant IA", cells: monthly("assistant") },
  { label: "Rapports clients automatiques", cells: { FREE: PLAN_LIMITS.FREE.reportsEnabled, PRO: PLAN_LIMITS.PRO.reportsEnabled, AGENCY: PLAN_LIMITS.AGENCY.reportsEnabled } },
  { label: "Calendrier client en lecture seule", cells: { FREE: PLAN_LIMITS.FREE.calendarShareEnabled, PRO: PLAN_LIMITS.PRO.calendarShareEnabled, AGENCY: PLAN_LIMITS.AGENCY.calendarShareEnabled } },
  { label: "Media kit public pour les sponsors", cells: { FREE: PLAN_LIMITS.FREE.mediaKitEnabled, PRO: PLAN_LIMITS.PRO.mediaKitEnabled, AGENCY: PLAN_LIMITS.AGENCY.mediaKitEnabled }, hint: "Vos vrais chiffres, relevés par Nebula, avec PDF et image de partage. Aperçu gratuit." },
  { label: "Publication en masse (1 vidéo → tous les comptes)", cells: { FREE: PLAN_LIMITS.FREE.massPublishEnabled, PRO: PLAN_LIMITS.PRO.massPublishEnabled, AGENCY: PLAN_LIMITS.AGENCY.massPublishEnabled } },
  { label: "Liens d'approbation client", cells: { FREE: false, PRO: false, AGENCY: true }, hint: "Vos clients valident ou commentent les publications à venir, sans compte." },
  { label: "Marque blanche (votre logo, votre nom dans l'application)", cells: { FREE: false, PRO: false, AGENCY: true } },
  { label: "Support prioritaire", cells: { FREE: false, PRO: false, AGENCY: true } }
];

function CellValue({ value }: { value: Cell }) {
  if (value === true) return <IconCheck className="mx-auto h-4 w-4 text-aurora-300" aria-label="Inclus" />;
  if (value === false) return <span className="text-slate-600" aria-label="Non inclus">—</span>;
  return <span className="text-slate-200">{value}</span>;
}

export function PricingComparison() {
  return (
    <>
      {/* Écrans larges : un vrai tableau, lisible d'un coup d'œil. */}
      <div className="hidden overflow-hidden border-y border-[color:var(--nb-sep)] md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--nb-sep)] text-left">
              <th scope="col" className="px-5 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                Fonctionnalité
              </th>
              {PLANS.map((plan) => (
                <th
                  key={plan}
                  scope="col"
                  className={clsx("w-[19%] px-4 py-4 text-center font-display text-base font-semibold", plan === "PRO" ? "text-aurora-300" : "text-white")}
                >
                  {PLAN_LIMITS[plan].label}
                  <span className="block text-xs font-normal text-slate-500">
                    {plan === "FREE" ? "0 €" : `dès ${PLAN_LIMITS[plan].tiers[0].priceMonthly} €/mois`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--nb-sep)]">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-5 py-3 text-left font-normal text-slate-300">
                  {row.label}
                  {row.hint && <span className="block text-xs text-slate-500">{row.hint}</span>}
                </th>
                {PLANS.map((plan) => (
                  <td key={plan} className={clsx("px-4 py-3 text-center", plan === "PRO" && "bg-aurora-400/[0.04]")}>
                    <CellValue value={row.cells[plan]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : une carte par fonctionnalité, les trois paliers côte à côte
          — pas de tableau à faire défiler horizontalement. */}
      <ul className="divide-y divide-[color:var(--nb-sep)] border-y border-[color:var(--nb-sep)] md:hidden" aria-label="Comparatif des paliers">
        {ROWS.map((row) => (
          <li key={row.label} className="py-4">
            <p className="text-sm text-slate-200">{row.label}</p>
            {row.hint && <p className="mt-0.5 text-xs text-slate-500">{row.hint}</p>}
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {PLANS.map((plan) => (
                <div key={plan} className={clsx("rounded-xl px-2 py-2 text-center", plan === "PRO" ? "bg-aurora-400/[0.08]" : "bg-[color:var(--nb-hover)]")}>
                  <dt className={clsx("text-[11px] font-semibold uppercase tracking-wider", plan === "PRO" ? "text-aurora-300" : "text-slate-500")}>
                    {PLAN_LIMITS[plan].label}
                  </dt>
                  <dd className="mt-1 text-sm">
                    <CellValue value={row.cells[plan]} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
