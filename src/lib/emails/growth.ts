// Emails ponctuels du brief growth (hors cycle de vie) : récompense « un
// mois de Pro offert ». Même habillage que src/lib/email.ts.
import { sendEmail, escapeHtml } from "@/lib/email";
import { emailLayout } from "@/lib/emails/layout";

export async function sendRewardEmail(input: { to: string; firstName: string; reason: "badge" | "referral"; fromName?: string; mode: "credit" | "coupon" | "bonus" }) {
  const who = input.fromName ? escapeHtml(input.fromName) : "Quelqu'un";
  const cause = input.reason === "badge" ? "après avoir visité votre page bio" : "grâce à votre lien de parrainage";
  const how =
    input.mode === "credit" || input.mode === "coupon"
      ? "Il est déjà crédité sur votre compte : il sera déduit automatiquement de votre prochaine facture."
      : "Il sera automatiquement déduit de votre prochaine souscription Pro (visible dans Facturation et dans votre profil).";
  const appUrl = process.env.NEXTAUTH_URL || "https://nebulahub.space";
  return sendEmail({
    to: input.to,
    subject: `${who} est abonné ${cause} : un mois de Pro vous est offert`,
    html: emailLayout({
      title: `Un mois de Pro offert, ${escapeHtml(input.firstName)}`,
      paragraphs: [`${who} s'est abonné à Nebula ${cause}, et l'est toujours un mois plus tard.`, how, "Merci de faire connaître Nebula."],
      cta: { label: "Voir ma facturation", url: `${appUrl}/billing` },
      signature: true
    })
  });
}
