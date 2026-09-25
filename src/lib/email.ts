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
import { createHash } from "crypto";
import { EMAIL_COLORS, emailButton, emailFrame, emailLink } from "@/lib/emails/brand";
import { SocialApiError, fetchJson } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { textSchema, z } from "@/lib/social/contract";
import { alertOwner, alertOwnerFormatChange } from "@/lib/owner-alerts";

// Contrat de la réponse de Resend (lot 9) — doc : https://resend.com/docs/api-reference/emails/send-email.
// Réponses types : tests/contracts/fixtures/resend.
const sentSchema = z.object({ id: z.string().min(1) });
const errorSchema = z.object({ name: textSchema, message: textSchema });

/**
 * Clé d'idempotence (lot 9) : avec la même clé, Resend n'envoie le même
 * e-mail qu'UNE fois pendant 24 h, même si Nebula réessaie après un délai
 * dépassé (l'e-mail était peut-être parti). Le destinataire est haché : il
 * n'apparaît pas en clair dans l'en-tête.
 */
export function emailIdempotencyKey(kind: string, recipient: string, discriminator = ""): string {
  const hash = createHash("sha256").update(recipient.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `${kind}:${discriminator}:${hash}`.slice(0, 256);
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  /** Version texte brut (clients sans HTML, accessibilité) — facultative. */
  text?: string;
  /** Adresse à laquelle « Répondre » répondra (ex. formulaire de contact). */
  replyTo?: string;
  /**
   * Pour les envois automatiques qui peuvent être retentés (cron) : voir
   * emailIdempotencyKey. Sans clé, chaque appel est un nouvel envoi.
   */
  idempotencyKey?: string;
}): Promise<{ ok: boolean; error?: string; retryable?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY absent : configurez l'envoi d'email (voir .env.example)." };
  }
  const from = process.env.EMAIL_FROM || "Nebula <onboarding@resend.dev>";

  try {
    // Porte commune (lot 9) : délai garanti (avant : aucun), panne classée.
    await fetchJson("RESEND", "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {})
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
        ...(params.replyTo ? { reply_to: params.replyTo } : {})
      }),
      cache: "no-store",
      timeoutMs: 15_000,
      schema: sentSchema
    });
    return { ok: true };
  } catch (err) {
    if (!(err instanceof SocialApiError)) return { ok: false, error: (err as Error).message };
    return resendFailure(err);
  }
}

/**
 * Refus de Resend : message clair, et le propriétaire prévenu quand c'est la
 * configuration qui bloque TOUS les envois (clé refusée, domaine non
 * vérifié, quota du jour ou du mois atteint) — avant le lot 9, les e-mails
 * de réinitialisation de mot de passe pouvaient échouer en silence.
 */
function resendFailure(err: SocialApiError): { ok: boolean; error?: string; retryable?: boolean } {
  const body = errorSchema.safeParse(err.raw);
  const name = body.success ? body.data.name ?? "" : "";
  const detail = (body.success ? body.data.message : undefined) || err.message.replace(/^\[RESEND\] /, "");
  const { category } = classifyProviderError(err);

  // Même clé, contenu légèrement différent : l'e-mail est déjà parti avec cette clé.
  if (name === "invalid_idempotent_request") return { ok: true };
  if (name === "concurrent_idempotent_requests") return { ok: false, error: "Envoi déjà en cours : nouvel essai plus tard.", retryable: true };

  if (category === "UNEXPECTED_RESPONSE") {
    void alertOwnerFormatChange("Resend", "format:resend", err.message, { where: "src/lib/email.ts" });
    return { ok: false, error: "Resend a répondu dans un format inattendu.", retryable: false };
  }
  if (category === "TIMEOUT") {
    // L'e-mail est peut-être parti : un nouvel essai AVEC la même clé
    // d'idempotence ne l'enverra pas deux fois.
    return { ok: false, error: "Resend n'a pas répondu à temps (l'e-mail est peut-être parti).", retryable: true };
  }
  const blocking =
    err.status === 401 ||
    name === "missing_api_key" ||
    name === "invalid_api_key" ||
    name === "restricted_api_key" ||
    name === "daily_quota_exceeded" ||
    name === "monthly_quota_exceeded" ||
    /verify a domain|testing emails to your own email address/i.test(detail);
  if (blocking) {
    void alertOwner({
      title: "E-mails bloqués chez Resend",
      // Conséquence d'abord : la cloche coupe les messages trop longs.
      body: `Aucun e-mail ne part (réinitialisations de mot de passe comprises) tant que ce n'est pas réglé : clé RESEND_API_KEY, domaine vérifié ou quota. Resend : ${name || `erreur ${err.status}`} — ${detail}`,
      dedupeKey: `resend:${name || err.status}`
    });
  }
  return {
    ok: false,
    error: `Resend a refusé l'envoi (${err.status ?? "?"}${name ? ` ${name}` : ""}) : ${detail}`,
    retryable: category === "RATE_LIMITED" || category === "TRANSIENT"
  };
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<{ ok: boolean; error?: string }> {
  return sendEmail({
    to,
    subject: "Réinitialisez votre mot de passe Nebula",
    html: emailFrame(`
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827">Réinitialisation de mot de passe</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55">Vous avez demandé à réinitialiser votre mot de passe Nebula. Cliquez sur le bouton ci-dessous — ce lien expire dans 1 heure.</p>
      <p style="margin:22px 0">${emailButton("Choisir un nouveau mot de passe", resetUrl)}</p>
      <p style="margin:0 0 8px;color:${EMAIL_COLORS.muted};font-size:13px;line-height:1.5">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe ne changera pas.</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;word-break:break-all">Lien direct : ${resetUrl}</p>
    `)
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
  /** Slug de la marque : alimente le lien « Créez le vôtre » du pied de
   *  page (attribution `via`, brief growth lot G1.c). */
  brandSlug?: string | null;
  /** Envoi automatique : voir emailIdempotencyKey (lot 9). */
  idempotencyKey?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sign = params.followersDelta >= 0 ? "+" : "";
  const appUrl = process.env.NEXTAUTH_URL || "https://nebulahub.space";
  const discoverUrl = `${appUrl}/decouvrir/rapports-clients?${new URLSearchParams({
    ...(params.brandSlug ? { via: params.brandSlug } : {}),
    utm_source: "email",
    utm_medium: "rapport",
    utm_campaign: "footer"
  }).toString()}`;
  const text = [
    `Rapport ${params.periodLabel} — ${params.brandName}`,
    "",
    `Abonnés actuels : ${params.followers.toLocaleString("fr-FR")} (${sign}${params.followersDelta.toLocaleString("fr-FR")} sur la période)`,
    "",
    `Voir le rapport complet : ${params.reportUrl}`,
    "",
    `Rapport généré par Nebula — Créez le vôtre en 2 minutes : ${discoverUrl}`
  ].join("\n");
  return sendEmail({
    to: params.to,
    subject: `Rapport ${params.periodLabel} — ${params.brandName}`,
    text,
    html: emailFrame(`
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827">Rapport ${escapeHtml(params.periodLabel)} — ${escapeHtml(params.brandName)}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55">Abonnés actuels : <strong>${params.followers.toLocaleString("fr-FR")}</strong> (${sign}${params.followersDelta.toLocaleString("fr-FR")} sur la période)</p>
      <p style="margin:22px 0">${emailButton("Voir le rapport complet", params.reportUrl)}</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;word-break:break-all">Lien direct : ${params.reportUrl}</p>
      <p style="margin:26px 0 0;padding-top:14px;border-top:1px solid ${EMAIL_COLORS.border};color:${EMAIL_COLORS.muted};font-size:12px">
        Rapport généré par Nebula — ${emailLink("Créez le vôtre en 2 minutes", discoverUrl)}
      </p>
    `),
    idempotencyKey: params.idempotencyKey
  });
}

/**
 * Email envoyé à l'auteur d'une publication PROGRAMMÉE quand son envoi
 * échoue (totalement ou sur une partie des comptes) — voir runDuePosts dans
 * src/lib/publish.ts, et la préférence User.notifyOnFailure (Paramètres →
 * Compte). Le lien mène à la fiche de la publication, où l'on peut lire
 * l'erreur exacte par compte et retenter l'envoi.
 */
export async function sendPublishFailureEmail(params: {
  to: string;
  brandName: string;
  postTitle: string;
  postUrl: string;
  failures: { network: string; message: string }[];
  partial: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const rows = params.failures
    .map(
      (f) =>
        `<li style="margin: 4px 0;"><strong>${escapeHtml(f.network)}</strong> — ${escapeHtml(f.message || "erreur inconnue")}</li>`
    )
    .join("");
  const title = params.postTitle.trim() || "(sans titre)";
  return sendEmail({
    to: params.to,
    subject: params.partial
      ? `Publication partiellement envoyée — ${params.brandName}`
      : `Échec d'une publication programmée — ${params.brandName}`,
    html: emailFrame(`
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827">${params.partial ? "Publication partiellement envoyée" : "Une publication programmée a échoué"}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55">Marque : <strong>${escapeHtml(params.brandName)}</strong><br>Publication : <strong>${escapeHtml(title)}</strong></p>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.55">${params.partial ? "Certains comptes n'ont pas pu recevoir la publication :" : "Aucun des comptes ciblés n'a pu recevoir la publication :"}</p>
      <ul style="padding-left:18px;margin:0 0 8px;font-size:14px;line-height:1.5">${rows}</ul>
      <p style="margin:22px 0">${emailButton("Voir la publication et réessayer", params.postUrl)}</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5">Le plus souvent, il suffit de reconnecter le compte concerné depuis la page Comptes connectés, puis de relancer l'envoi. Vous pouvez désactiver ces emails dans Paramètres → Compte.</p>
    `)
  });
}
