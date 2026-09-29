import { OG_CONTENT_TYPE, OG_SIZE, renderPageOg } from "@/lib/og/page-card";
import { COMPETITOR_SLUGS, getCompetitor } from "@/data/competitors";
import { PLAN_LIMITS } from "@/lib/plans";

// Image de partage de chaque page « Alternative à … » (générée au build pour chaque
// concurrent, voir src/lib/og/page-card.tsx).
export const alt = "Comparatif Nebula";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return COMPETITOR_SLUGS.map((slug) => ({ slug }));
}

export default function Image({ params }: { params: { slug: string } }) {
  const c = getCompetitor(params.slug);
  const name = c?.name ?? "votre outil actuel";
  return renderPageOg({ eyebrow: "Comparatif", title: `Alternative à ${name}`, subtitle: `Nebula, dès ${PLAN_LIMITS.PRO.tiers[0].priceMonthly} € par mois` });
}
