// Messages envoyés à l'équipe Nebula (29/09/2026, puis 10/10/2026) : le
// formulaire public /contact et « Écrire à l'équipe » de la page Soutenir
// Nebula (personnes connectées). Le message est d'abord ENREGISTRÉ en base
// (ContactMessage, lu dans /admin/messages) et signalé dans la cloche du
// propriétaire ; la copie par e-mail (Resend, adresse de l'expéditeur en
// « Répondre à ») n'est qu'un plus : rien n'est perdu si elle échoue.
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { alertOwner } from "@/lib/owner-alerts";
import { OWNER_EMAIL } from "@/lib/owner";

export type DeliverResult = { ok: true } | { ok: false; status: number; error: string };

export async function deliverContactMessage(input: { name: string; email: string; subject: string; message: string; source?: string }): Promise<DeliverResult> {
  const { name, email, subject, message } = input;
  let saved: { id: string };
  try {
    saved = await prisma.contactMessage.create({ data: { name, email, subject, message }, select: { id: true } });
  } catch (err) {
    console.error("[contact] enregistrement impossible :", (err as Error).message);
    return { ok: false, status: 503, error: `Impossible d'enregistrer le message pour le moment. Écrivez-nous directement à ${SITE_CONTACT_EMAIL}.` };
  }

  await alertOwner({
    title: `Nouveau message : ${subject}`,
    body: `${name} (${email}) : ${message.length > 180 ? `${message.slice(0, 180)}…` : message}`,
    dedupeKey: `contact:${saved.id}`,
    href: "/admin/messages",
    actionLabel: "Lire le message"
  });

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
      <p><strong>Nouveau message ${escapeHtml(input.source ?? `depuis le formulaire de contact ${SITE_NAME}`)}</strong></p>
      <p><strong>De :</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;<br/>
         <strong>Sujet :</strong> ${escapeHtml(subject)}</p>
      <p style="white-space:pre-wrap;border-left:3px solid #8646ff;padding-left:12px">${escapeHtml(message)}</p>
    </div>`;

  // Copie par e-mail au propriétaire (CONTACT_INBOX_EMAIL si renseignée) :
  // l'adresse affichée sur le site peut ne pas avoir de boîte de réception,
  // et l'expéditeur de test de Resend n'écrit qu'au titulaire du compte.
  const result = await sendEmail({
    to: process.env.CONTACT_INBOX_EMAIL?.trim() || OWNER_EMAIL,
    subject: `[${SITE_NAME}] ${subject} — ${name}`,
    html,
    replyTo: email
  });
  if (result.ok) {
    await prisma.contactMessage.update({ where: { id: saved.id }, data: { emailSent: true } }).catch(() => undefined);
  } else {
    console.error("[contact] copie par e-mail impossible :", result.error);
  }
  return { ok: true };
}
