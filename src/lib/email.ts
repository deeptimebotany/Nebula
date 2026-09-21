/**
 * Envoi d'emails transactionnels (réinitialisation de mot de passe, etc.)
 * via l'API REST de Resend (https://resend.com) — pas de dépendance npm
 * supplémentaire, un simple appel fetch.
 *
 * Configuration nécessaire (voir .env.example) :
 *   RESEND_API_KEY   — créez un compte gratuit sur resend.com, générez une
 *                       clé API (Dashboard → API Keys).
 *   EMAIL_FROM        — adresse d'expédition. Sans domaine vérifié, utilisez
 *                       "Nebula <onboarding@resend.dev>" (fonctionne
 *                       immédiatement, sans configuration DNS, jusqu'à
 *                       ~100 emails/jour — largement suffisant pour des
 *                       emails de réinitialisation de mot de passe).
 *
 * Tant que RESEND_API_KEY est absent, les emails ne partent pas : on le
 * signale clairement plutôt que d'échouer silencieusement.
 */
export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY absent : configurez l'envoi d'email (voir .env.example)." };
  }
  const from = process.env.EMAIL_FROM || "Nebula <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend a refusé l'envoi (${res.status}): ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<{ ok: boolean; error?: string }> {
  return sendEmail({
    to,
    subject: "Réinitialisez votre mot de passe Nebula",
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="margin-bottom: 4px;">Réinitialisation de mot de passe</h2>
        <p>Vous avez demandé à réinitialiser votre mot de passe Nebula. Cliquez sur le bouton ci-dessous — ce lien expire dans 1 heure.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background: #2955c4; color: #fff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 600;">
            Choisir un nouveau mot de passe
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe ne changera pas.</p>
        <p style="color: #999; font-size: 12px; word-break: break-all;">Lien direct : ${resetUrl}</p>
      </div>
    `
  });
}

/**
 * Notification périodique (voir BrandReport/runDueReports dans
 * src/lib/reports.ts — produit n°6 de la feuille de route : rapports clients
 * automatiques) envoyée au destinataire configuré par l'agence pour une
 * marque. Contient un résumé chiffré + un lien vers le rapport public
 * complet (toujours à jour, recalculé à la volée) — jamais les chiffres
 * eux-mêmes présentés comme figés dans le temps.
 */
export async function sendReportEmail(params: {
  to: string;
  brandName: string;
  reportUrl: string;
  periodLabel: string;
  followers: number;
  followersDelta: number;
}): Promise<{ ok: boolean; error?: string }> {
  const sign = params.followersDelta >= 0 ? "+" : "";
  return sendEmail({
    to: params.to,
    subject: `Rapport ${params.periodLabel} — ${params.brandName}`,
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="margin-bottom: 4px;">Rapport ${escapeHtml(params.periodLabel)} — ${escapeHtml(params.brandName)}</h2>
        <p>Abonnés actuels : <strong>${params.followers.toLocaleString("fr-FR")}</strong> (${sign}${params.followersDelta.toLocaleString("fr-FR")} sur la période)</p>
        <p style="margin: 24px 0;">
          <a href="${params.reportUrl}" style="background: #2955c4; color: #fff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 600;">
            Voir le rapport complet
          </a>
        </p>
        <p style="color: #999; font-size: 12px; word-break: break-all;">Lien direct : ${params.reportUrl}</p>
      </div>
    `
  });
}
