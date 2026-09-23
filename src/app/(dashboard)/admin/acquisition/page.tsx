import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { AcquisitionDashboard } from "./acquisition-dashboard";

// Page propriétaire (brief growth, lot G0) : d'où viennent les inscrits et
// les payants. Réservée au compte propriétaire (même garde que le message
// Stripe de Facturation) — 404 pour les autres, exclue des robots.
export const dynamic = "force-dynamic";
export const metadata = { title: "Acquisition — Nebula", robots: { index: false, follow: false } };

export default async function AdminAcquisitionPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  return <AcquisitionDashboard />;
}
