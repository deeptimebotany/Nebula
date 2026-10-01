// Lecture des objets Stripe quelle que soit la version de l'API (01/10/2026).
// Le SDK de Nebula appelle Stripe en 2024-06-20 (voir social/versions.ts),
// mais les événements de webhook arrivent dans la version choisie pour la
// destination dans le tableau de bord Stripe, souvent la plus récente. Depuis
// 2025-03-31 (« basil »), deux champs ont bougé :
//   - fin de période : `subscription.current_period_end` → sur chaque élément
//     (`subscription.items.data[].current_period_end`) ;
//   - abonnement d'une facture : `invoice.subscription` →
//     `invoice.parent.subscription_details.subscription`.
// Ces fonctions lisent l'ancien et le nouvel emplacement.

type Id = string | { id: string } | null | undefined;
const idOf = (v: Id): string | null => (typeof v === "string" ? v : v?.id ?? null);

/** Fin de la période en cours (secondes Unix), ou null. */
export function subscriptionPeriodEnd(sub: unknown): number | null {
  const s = sub as { current_period_end?: number | null; items?: { data?: { current_period_end?: number | null }[] } };
  if (typeof s.current_period_end === "number") return s.current_period_end;
  const ends = (s.items?.data ?? []).map((i) => i.current_period_end).filter((v): v is number => typeof v === "number");
  return ends.length ? Math.max(...ends) : null;
}

/** Identifiant de l'abonnement d'une facture, ou null (facture hors abonnement). */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  const inv = invoice as { subscription?: Id; parent?: { subscription_details?: { subscription?: Id } | null } | null };
  return idOf(inv.subscription) ?? idOf(inv.parent?.subscription_details?.subscription);
}
