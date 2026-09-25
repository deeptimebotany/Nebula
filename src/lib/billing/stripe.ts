import Stripe from "stripe";
import { API_VERSIONS } from "@/lib/social/versions";

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
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: API_VERSIONS.STRIPE.version,
      // Lot 9 : 20 s au plus par appel (défaut du SDK : 80 s, plus que la
      // limite de 60 s d'une fonction Vercel), et 2 nouvelles tentatives
      // sur une panne réseau — sans risque de double paiement : le SDK
      // pose une clé d'idempotence sur chaque requête relancée.
      timeout: 20_000,
      maxNetworkRetries: 2
    });
  }
  return _stripe;
}
