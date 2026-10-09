import { redirect } from "next/navigation";

// Commentaires → Interactions (09/10/2026, demande de Lucas : Commentaires et
// Engagements réunis). L'adresse reste pour les liens déjà partagés et les
// notifications ; les filtres (?connectionId=, ?post=) sont gardés.
export default function CommentsRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = new URLSearchParams();
  for (const key of ["connectionId", "post"]) {
    const v = searchParams[key];
    if (typeof v === "string" && v) params.set(key, v);
  }
  const query = params.toString();
  redirect(`/interactions${query ? `?${query}` : ""}`);
}
