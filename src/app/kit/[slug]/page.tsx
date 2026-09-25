import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedPublicKit } from "@/lib/media-kit/cache";
import { KitView } from "@/components/media-kit/kit-view";
import { KitActions, KitPageEffects } from "@/components/media-kit/kit-client";
import { PoweredByNebula } from "@/components/marketing/powered-by";
import { PublicConversionBlock } from "@/components/marketing/public-conversion-block";
import { formatCompact } from "@/lib/engagement-metrics";

// Media kit public d'une marque (produit n°10) : la page que le créateur
// envoie aux marques et aux sponsors. Rendue côté serveur (aperçus de
// partage, lecteurs d'écran, PDF), depuis le cache (src/lib/media-kit/cache.ts).
// Jamais indexée (choix de Lucas) mais pas bloquée dans robots.txt, pour que
// les aperçus de lien fonctionnent. CSP stricte : rendu à chaque visite.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const kit = await getCachedPublicKit(params.slug);
  if (!kit) return { title: "Media kit introuvable", robots: { index: false, follow: false } };
  const audience = kit.stats.totals.audience;
  const description =
    kit.headline ||
    (audience !== null ? `${formatCompact(audience)} abonnés sur ${kit.stats.totals.accounts} compte${kit.stats.totals.accounts > 1 ? "s" : ""}, chiffres relevés par Nebula.` : `Le media kit de ${kit.brandName}.`);
  return {
    title: `${kit.brandName} — Media kit`,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: `${kit.brandName} — Media kit`, description, type: "profile" },
    twitter: { card: "summary_large_image", title: `${kit.brandName} — Media kit`, description }
  };
}

export default async function PublicMediaKitPage({ params }: { params: { slug: string } }) {
  const kit = await getCachedPublicKit(params.slug);
  // Inconnu, non publié, ou palier sans media kit : vraie 404.
  if (!kit) notFound();
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh print:hidden" />
      <div className="noise-grid grain-overlay pointer-events-none absolute inset-x-0 top-0 h-[600px] print:hidden" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 print:max-w-none print:px-0 print:py-0">
        <KitPageEffects slug={kit.slug} />
        <KitView data={kit} actions={<KitActions contactEmail={kit.contactEmail} />} />
        <div className="mt-10 space-y-6 print:mt-6">
          <PublicConversionBlock surface="kit" brandName={kit.brandName} via={kit.slug} className="print:hidden" />
          <PoweredByNebula surface="kit" via={kit.slug} />
        </div>
      </div>
    </main>
  );
}
