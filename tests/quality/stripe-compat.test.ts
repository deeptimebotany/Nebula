// Webhook Stripe (01/10/2026) : les événements arrivent dans la version de
// l'API choisie pour la destination ; ancienne (2024-06-20) et nouvelle forme
// (2025-03-31 « basil » et après, dont 2026-08-26 « dahlia ») sont lues.
import { describe, expect, it } from "vitest";
import { invoiceSubscriptionId, subscriptionPeriodEnd } from "@/lib/billing/stripe-compat";

describe("objets Stripe, toutes versions", () => {
  it("fin de période : sur l'abonnement (ancienne API) ou sur ses éléments (nouvelle)", () => {
    expect(subscriptionPeriodEnd({ current_period_end: 1800000000, items: { data: [] } })).toBe(1800000000);
    expect(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 1800000000 }, { current_period_end: 1800086400 }] } })).toBe(1800086400);
    expect(subscriptionPeriodEnd({ items: { data: [{}] } })).toBeNull();
  });

  it("abonnement d'une facture : champ direct (ancienne API) ou parent.subscription_details (nouvelle)", () => {
    expect(invoiceSubscriptionId({ subscription: "sub_1" })).toBe("sub_1");
    expect(invoiceSubscriptionId({ subscription: { id: "sub_2" } })).toBe("sub_2");
    expect(invoiceSubscriptionId({ parent: { type: "subscription_details", subscription_details: { subscription: "sub_3" } } })).toBe("sub_3");
    expect(invoiceSubscriptionId({ parent: null })).toBeNull();
  });
});
