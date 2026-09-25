// Vue d'ensemble — préparée côté serveur (lot 10).
//
// Avant : page entièrement dans le navigateur. Au premier affichage, il
// fallait attendre le JavaScript, puis /api/brands, puis six appels
// (statistiques, publications, créneaux, page bio, niveau…) avant de voir un
// chiffre. Maintenant, le serveur lit tout en parallèle pour la marque
// active (cookie, voir lib/active-brand.ts) et le HTML arrive rempli ; la
// partie interactive (dashboard-client.tsx) reprend ces données sans les
// redemander.
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveBrand } from "@/lib/server-data/brands";
import { asJson, getAnalyticsInsights, getAnalyticsList, getLinkPagePublished } from "@/lib/server-data/brand-data";
import { MAX_POSTS_PER_REQUEST, listBrandPosts } from "@/lib/posts/list-posts";
import { buildSummary } from "@/lib/reussites/view";
import { analyticsKey } from "@/lib/data/keys";
import { SeededData } from "@/lib/data/swr-config";
import { GREETING_VARIANTS } from "@/lib/dashboard-greetings";
import { DashboardClient, type DashboardInitial } from "./dashboard-client";

export const dynamic = "force-dynamic";

/** Publications lues pour la traînée « Momentum » (104 semaines) et les widgets. */
const POSTS_WINDOW_MS = 105 * 7 * 86_400_000;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const userId = (session.user as { id: string }).id;
  const { activeBrand } = await resolveActiveBrand(userId);
  if (!activeBrand) return <DashboardClient initial={null} />;

  const brandId = activeBrand.id;
  const [analytics, posts, insights, linkPagePublished, reussites] = await Promise.all([
    getAnalyticsList(brandId),
    listBrandPosts(brandId, { from: new Date(Date.now() - POSTS_WINDOW_MS), to: null, view: "light", limit: MAX_POSTS_PER_REQUEST }),
    getAnalyticsInsights(brandId),
    getLinkPagePublished(brandId),
    buildSummary(userId).catch(() => null)
  ]);

  const initial = asJson({
    brandId,
    posts: posts.posts,
    insights,
    linkPagePublished,
    reussites,
    greetingIndex: Math.floor(Math.random() * GREETING_VARIANTS.length)
  }) as unknown as DashboardInitial;

  return (
    <SeededData entries={{ [analyticsKey(brandId)]: asJson(analytics) }} at={Date.now()}>
      <DashboardClient initial={initial} />
    </SeededData>
  );
}
