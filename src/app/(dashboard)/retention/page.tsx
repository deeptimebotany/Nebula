import { redirect } from "next/navigation";

// Rétention IA → onglet d'Analytics (09/10/2026, demande de Lucas).
// L'adresse reste pour les liens déjà partagés, les notifications et le
// retour de Stripe après une recharge (?recharge=success, gardé).
export default function RetentionRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = new URLSearchParams({ tab: "retention" });
  const recharge = searchParams.recharge;
  if (typeof recharge === "string" && recharge) params.set("recharge", recharge);
  redirect(`/analytics?${params.toString()}`);
}
