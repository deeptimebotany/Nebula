import { SocialApiError, fetchJson } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { soft, textSchema, z } from "@/lib/social/contract";
import { alertOwner, alertOwnerFormatChange } from "@/lib/owner-alerts";

/**
 * Vérification Cloudflare Turnstile (protection anti-robot façon captcha,
 * mais sans les grilles d'images à résoudre — la plupart des visiteurs
 * humains passent sans aucune interaction visible).
 *
 * Configuration (voir .env.example) : créez un site gratuit sur
 * https://dash.cloudflare.com/?to=/:account/turnstile, puis renseignez
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY (clé publique, widget) et
 * TURNSTILE_SECRET_KEY (clé secrète, vérification serveur).
 *
 * Tant que TURNSTILE_SECRET_KEY est absent, la vérification est ignorée
 * (retourne toujours vrai) pour ne jamais bloquer l'inscription avant que
 * ce soit configuré — le widget ne s'affiche de toute façon que si la clé
 * publique est présente (voir src/components/turnstile-widget.tsx).
 */
// Contrat de la réponse (lot 9) — doc : https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
// Réponses types : tests/contracts/fixtures/turnstile.
const verifySchema = z.object({ success: z.boolean(), "error-codes": soft(z.array(z.string())), hostname: textSchema, action: textSchema });

/** Codes qui signalent une MAUVAISE CONFIGURATION : tout le monde serait refusé. */
const CONFIG_ERRORS = new Set(["missing-input-secret", "invalid-input-secret"]);

export async function verifyTurnstileToken(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // non configuré : on n'empêche pas l'usage du site

  if (!token) return false;

  try {
    // Porte commune (lot 9) : 8 s au plus (avant : aucun délai, l'inscription
    // pouvait rester bloquée), réponse vérifiée.
    const data = await fetchJson("TURNSTILE", "https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
      timeoutMs: 8_000,
      schema: verifySchema
    });
    const codes = data["error-codes"] ?? [];
    if (!data.success && codes.some((c) => CONFIG_ERRORS.has(c))) {
      void alertOwner({
        title: "Anti-robot mal configuré : inscriptions bloquées",
        body: `Cloudflare Turnstile refuse la clé secrète (${codes.join(", ")}) : plus personne ne peut s'inscrire ni utiliser les outils protégés. Vérifiez TURNSTILE_SECRET_KEY sur Vercel (dash.cloudflare.com → Turnstile).`,
        dedupeKey: "turnstile-config"
      });
    }
    return data.success;
  } catch (err) {
    // Panne ou délai dépassé : refus prudent (pas d'inscription sans
    // vérification), mais journalisé pour le diagnostic.
    console.warn("[turnstile] vérification impossible :", (err as Error).message);
    if (err instanceof SocialApiError && classifyProviderError(err).category === "UNEXPECTED_RESPONSE") {
      void alertOwnerFormatChange("Cloudflare Turnstile", "format:turnstile", err.message, { where: "src/lib/turnstile.ts" });
    }
    return false;
  }
}
