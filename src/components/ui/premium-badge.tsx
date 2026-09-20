import { clsx } from "@/lib/clsx";
import type { TenureTier } from "@/lib/premium";

const TIER_ICON: Record<TenureTier, string> = {
  mois: "✨",
  semestre: "⭐",
  an: "👑"
};

const TIER_STYLE: Record<TenureTier, string> = {
  mois: "border-amber-400/30 bg-amber-500/10 text-amber-400",
  semestre: "border-amber-400/45 bg-amber-500/15 text-amber-300",
  an: "border-amber-300/60 bg-gradient-to-r from-amber-500/25 to-yellow-300/25 text-amber-200 shadow-[0_0_10px_rgba(234,179,8,0.35)]"
};

/**
 * Badge Premium évolutif — affiché à côté du pseudo d'un membre PRO/AGENCE
 * dans la communauté (voir PremiumName + computePremiumInfo). L'icône et
 * l'intensité du halo montent avec l'ancienneté réelle de l'abonnement :
 * ✨ 1 mois → ⭐ 6 mois → 👑 1 an et plus.
 */
export function PremiumBadge({ tier, label }: { tier: TenureTier; label: string }) {
  return (
    <span
      title={`Membre Premium depuis ${label}`}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        TIER_STYLE[tier]
      )}
    >
      <span aria-hidden>{TIER_ICON[tier]}</span>
      {label}
    </span>
  );
}
