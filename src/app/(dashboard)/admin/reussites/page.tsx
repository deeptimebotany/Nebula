import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { ReussitesAdmin } from "./reussites-admin";

// Page propriétaire (Réussites v2, lot C) : objectif du défi collectif du
// mois et vidéos à la une. 404 pour tout autre compte, exclue des robots.
export const dynamic = "force-dynamic";
export const metadata = { title: "Réussites (admin) — Nebula", robots: { index: false, follow: false } };

export default async function AdminReussitesPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  return <ReussitesAdmin />;
}
