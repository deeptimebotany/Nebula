import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { ApiWatchAdmin } from "./api-watch-admin";

// Page propriétaire : veille des API (02/10/2026). 404 pour tout autre
// compte, exclue des robots.
export const dynamic = "force-dynamic";
export const metadata = { title: "Veille des API — Nebula", robots: { index: false, follow: false } };

export default async function AdminApiWatchPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  return <ApiWatchAdmin />;
}
