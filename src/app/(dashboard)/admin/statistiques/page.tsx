import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { StatsAdmin } from "./stats-admin";

// Page propriétaire : statistiques de groupe anonymes (29/09/2026).
// 404 pour tout autre compte, exclue des robots.
export const dynamic = "force-dynamic";
export const metadata = { title: "Statistiques anonymes — Nebula", robots: { index: false, follow: false } };

export default async function AdminStatsPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  return <StatsAdmin />;
}
