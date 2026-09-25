import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { NetworksAdmin } from "./networks-admin";

// Page propriétaire : interrupteurs par réseau et disjoncteur (lot 5).
// 404 pour tout autre compte, exclue des robots.
export const dynamic = "force-dynamic";
export const metadata = { title: "Réseaux — Nebula", robots: { index: false, follow: false } };

export default async function AdminNetworksPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  return <NetworksAdmin />;
}
