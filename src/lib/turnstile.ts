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
export async function verifyTurnstileToken(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // non configuré : on n'empêche pas l'usage du site

  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
}
