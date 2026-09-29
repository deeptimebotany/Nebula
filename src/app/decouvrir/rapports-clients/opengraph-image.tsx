import { OG_CONTENT_TYPE, OG_SIZE, renderPageOg } from "@/lib/og/page-card";
import { SEO_DISCOVER } from "@/lib/seo-pages";

// Image de partage de la page (générée au build, voir src/lib/og/page-card.tsx).
const PAGE = SEO_DISCOVER["rapports-clients"];
export const alt = PAGE.imageTitle ?? PAGE.title;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPageOg({ eyebrow: PAGE.eyebrow, title: PAGE.imageTitle ?? PAGE.title, subtitle: PAGE.imageSubtitle });
}
