import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { MessagesAdmin } from "./messages-admin";

// Page propriétaire : messages du formulaire de contact (29/09/2026).
// 404 pour tout autre compte, exclue des robots.
export const dynamic = "force-dynamic";
export const metadata = { title: "Messages — Nebula", robots: { index: false, follow: false } };

export default async function AdminMessagesPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  return <MessagesAdmin />;
}
