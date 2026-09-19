import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function isBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Client Stripe paresseux : n'échoue que si on essaie réellement de
 * l'utiliser sans clé configurée, pour ne jamais bloquer le reste de l'app. */
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY manquant. Créez un compte sur dashboard.stripe.com et renseignez .env (voir .env.example) pour activer les abonnements payants."
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  }
  return _stripe;
}
