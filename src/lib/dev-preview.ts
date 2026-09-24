// Seule source de vérité pour "qui est le compte propriétaire du site" —
// utilisé pour réserver l'onglet privé /dev-preview (voir sidebar.tsx et
// dev-preview/page.tsx) ET pour laisser ce compte activer/prévisualiser
// n'importe quel cosmétique ou fond d'écran verrouillé sans avoir à le
// débloquer réellement (voir /api/settings/cosmetics et
// /api/settings/background). Un seul email en dur plutôt qu'un champ en
// base : ce n'est pas un vrai rôle "admin" multi-comptes, juste un accès
// personnel pour tester les mises à jour plus vite.
import { cookies } from "next/headers";
import type { Plan } from "./plans";

const OWNER_EMAIL = "nommelucas@gmail.com";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase() === OWNER_EMAIL;
}

// "Aperçu de palier" (voir /dev-preview et le bouton dans Paramètres) :
// permet au compte propriétaire de voir le site EXACTEMENT comme un compte
// Gratuit/Pro/Agence le verrait — cosmétiques/fonds/thèmes verrouillés
// affichés comme tels, plutôt que le mode par défaut (aucun aperçu choisi)
// où tout reste déverrouillé pour tester le rendu de ce qui est débloqué.
//
// Volontairement un simple cookie plutôt qu'un champ en base : c'est un
// réglage de session de test, jamais une donnée qui doit survivre ou être
// synchronisée entre appareils. Et volontairement PAS branché dans
// getUserPlan()/getBrandPlan() (src/lib/billing/plan.ts) : ces fonctions
// sont aussi appelées hors contexte de requête HTTP (worker planifié,
// scripts) où `cookies()` n'est pas disponible et lèverait une erreur, et
// elles gouvernent aussi les quotas réels (marques, comptes connectés,
// publications/mois) — un simple aperçu visuel ne doit jamais les
// perturber. Cet aperçu ne s'applique donc qu'aux quatre endroits qui
// affichent explicitement des paliers verrouillés dans Paramètres :
// cosmétiques, fonds d'écran, thèmes de couleurs, thème étoilé.
//
// Mode « Mon compte réel » (24/09/2026, demande de Lucas : « pouvoir quitter
// n'importe quel aperçu en un clic et retrouver l'état réel du compte ») :
// c'est désormais le mode PAR DÉFAUT, sans cookie. Le compte propriétaire y
// est traité comme n'importe quel compte (son palier réel, ses easter eggs
// et réussites réellement obtenus) — avant, l'absence de cookie voulait dire
// « tout déverrouillé », d'où un cadre et un thème Prisme qui semblaient
// accessibles à tout le monde. « Tout déverrouillé » devient un choix
// explicite (valeur ALL du cookie).
const PLAN_PREVIEW_COOKIE = "nebula_dev_plan_preview";
const PLAN_VALUES: readonly string[] = ["FREE", "PRO", "AGENCY"];

/** Mode de test du compte propriétaire : réel (défaut), tout déverrouillé, ou aperçu d'un palier. */
export type OwnerMode = "REAL" | "ALL" | Plan;

export function readOwnerModeCookie(): OwnerMode {
  const value = cookies().get(PLAN_PREVIEW_COOKIE)?.value;
  if (value === "ALL") return "ALL";
  return value && PLAN_VALUES.includes(value) ? (value as Plan) : "REAL";
}

export function readPlanPreviewCookie(): Plan | null {
  const mode = readOwnerModeCookie();
  return mode === "REAL" || mode === "ALL" ? null : mode;
}

/** Mode de test de CE compte : null pour tout compte autre que le propriétaire. */
export function resolveOwnerMode(email: string | null | undefined): OwnerMode | null {
  if (!isOwnerEmail(email)) return null;
  try {
    return readOwnerModeCookie();
  } catch {
    return "REAL"; // hors requête HTTP (worker, scripts) : pas de cookie
  }
}

/** Palier à simuler pour CE compte (aperçu Gratuit/Pro/Agence), ou null. */
export function resolvePreviewPlan(email: string | null | undefined): Plan | null {
  const mode = resolveOwnerMode(email);
  return mode === null || mode === "REAL" || mode === "ALL" ? null : mode;
}

/** true seulement pour le compte propriétaire en mode « Tout déverrouillé ». */
export function ownerUnlocksAll(email: string | null | undefined): boolean {
  return resolveOwnerMode(email) === "ALL";
}

export { PLAN_PREVIEW_COOKIE };
