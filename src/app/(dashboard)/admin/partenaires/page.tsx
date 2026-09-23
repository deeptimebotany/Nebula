import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { PartnersAdmin } from "./partners-admin";

// Page propriétaire : accès offerts aux partenaires (section IV de la note
// du 24/09/2026). 404 pour tout autre compte, exclue des robots.
export const dynamic = "force-dynamic";
export const metadata = { title: "Partenaires — Nebula", robots: { index: false, follow: false } };

export default async function AdminPartnersPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  return <PartnersAdmin />;
}
