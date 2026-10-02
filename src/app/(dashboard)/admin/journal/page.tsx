import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { JOURNAL_ENTRIES, JOURNAL_UPDATED_AT } from "@/lib/journal/journal";
import { JournalView } from "./journal-view";

// Page propriétaire : journal des mises à jour (02/10/2026). 404 pour tout
// autre compte, exclue des robots. Complété à chaque envoi du zip.
export const dynamic = "force-dynamic";
export const metadata = { title: "Journal des mises à jour — Nebula", robots: { index: false, follow: false } };

export default async function AdminJournalPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  return <JournalView entries={JOURNAL_ENTRIES} updatedAt={JOURNAL_UPDATED_AT} />;
}
