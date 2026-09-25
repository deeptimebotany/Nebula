// Analytics — préparée côté serveur (lot 10) : relevés de statistiques,
// palier et présence de l'onglet Publicité lus en parallèle pour la marque
// active, HTML déjà rempli ; la partie interactive (analytics-client.tsx)
// reprend ces données sans les redemander.
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveBrand } from "@/lib/server-data/brands";
import { asJson, getAnalyticsList } from "@/lib/server-data/brand-data";
import { getBrandPlan } from "@/lib/billing/plan";
import { AD_PLATFORMS } from "@/lib/ads/types";
import { isAdPlatformConfigured } from "@/lib/ads/config";
import { analyticsKey } from "@/lib/data/keys";
import { SeededData } from "@/lib/data/swr-config";
import { AnalyticsClient } from "./analytics-client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { activeBrand } = await resolveActiveBrand((session.user as { id: string }).id);
  if (!activeBrand) return <AnalyticsClient initial={null} />;

  const brandId = activeBrand.id;
  const [analytics, { plan }] = await Promise.all([getAnalyticsList(brandId), getBrandPlan(brandId)]);
  return (
    <SeededData entries={{ [analyticsKey(brandId)]: asJson(analytics) }} at={Date.now()}>
      <AnalyticsClient initial={{ brandId, adsEnabled: AD_PLATFORMS.some(isAdPlatformConfigured), plan }} />
    </SeededData>
  );
}
