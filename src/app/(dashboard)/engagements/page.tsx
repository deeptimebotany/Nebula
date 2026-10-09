import { redirect } from "next/navigation";

// Engagements → Interactions › Engagement (09/10/2026, demande de Lucas :
// Commentaires et Engagements réunis). L'adresse reste pour les liens déjà
// partagés ; le filtre de compte (?connectionId=) est gardé.
export default function EngagementsRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = new URLSearchParams({ vue: "engagement" });
  const connectionId = searchParams.connectionId;
  if (typeof connectionId === "string" && connectionId) params.set("connectionId", connectionId);
  redirect(`/interactions?${params.toString()}`);
}
