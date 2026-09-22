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
const PLAN_PREVIEW_COOKIE = "nebula_dev_plan_preview";
const PLAN_VALUES: readonly string[] = ["FREE", "PRO", "AGENCY"];

export function readPlanPreviewCookie(): Plan | null {
  const value = cookies().get(PLAN_PREVIEW_COOKIE)?.value;
  return value && PLAN_VALUES.includes(value) ? (value as Plan) : null;
}

/** Palier à simuler pour CE compte, ou null (pas de compte propriétaire, ou aucun aperçu choisi — mode "tout déverrouillé"). */
export function resolvePreviewPlan(email: string | null | undefined): Plan | null {
  if (!isOwnerEmail(email)) return null;
  return readPlanPreviewCookie();
}

export { PLAN_PREVIEW_COOKIE };
