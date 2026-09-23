// Accès offerts — partenaires, streamers, créateurs, testeurs (décision du
// 24/09/2026, section IV de la note de Lucas). Deux briques :
//   1. les CODES PROMO Stripe (créés dans Stripe, saisis par la personne
//      sur la page de paiement — voir allow_promotion_codes dans
//      /api/billing/checkout) : pour les remises, y compris -100 % ;
//   2. les ACCÈS OFFERTS de ce fichier : le propriétaire attribue Pro ou
//      Agence à un email depuis /admin/partenaires, sans carte ni Stripe,
//      pour N mois ou sans limite. L'accès s'applique tout de suite si le
//      compte existe, sinon à l'inscription (applyPendingPartnerGrant).
// getUserPlan() lit User.compPlan/compUntil juste après l'abonnement payant :
// un partenaire qui finit par s'abonner garde simplement son abonnement.
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type Plan } from "@/lib/plans";
import { sendEmail, escapeHtml } from "@/lib/email";
import { emailLayout, emailPlainText } from "@/lib/emails/layout";
import { trackGrowth } from "@/lib/growth";

export type CompPlan = Extract<Plan, "PRO" | "AGENCY">;

export interface GrantInput {
  email: string;
  plan: CompPlan;
  maxBrands: number;
  /** Durée en mois ; null = sans limite. */
  months: number | null;
  note?: string;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

function validTier(plan: CompPlan, maxBrands: number): number {
  const tiers = PLAN_LIMITS[plan].tiers;
  return tiers.some((t) => t.maxBrands === maxBrands) ? maxBrands : tiers[0].maxBrands;
}

/** Crée l'attribution et l'applique si le compte existe déjà. */
export async function grantPartnerAccess(input: GrantInput): Promise<{ grantId: string; applied: boolean }> {
  const email = input.email.trim().toLowerCase();
  const maxBrands = validTier(input.plan, input.maxBrands);
  const grant = await prisma.partnerGrant.create({ data: { email, plan: input.plan, maxBrands, months: input.months, note: input.note?.trim() || null } });
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { grantId: grant.id, applied: false };
  await applyGrant(grant.id, user.id);
  return { grantId: grant.id, applied: true };
}

async function applyGrant(grantId: string, userId: string): Promise<void> {
  const grant = await prisma.partnerGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.revokedAt) return;
  const now = new Date();
  const expiresAt = grant.months ? addMonths(now, grant.months) : null;
  await prisma.$transaction([
    prisma.partnerGrant.update({ where: { id: grantId }, data: { appliedAt: now, expiresAt, userId } }),
    prisma.user.update({ where: { id: userId }, data: { compPlan: grant.plan, compMaxBrands: grant.maxBrands, compUntil: expiresAt, compNote: grant.note } })
  ]);
  await trackGrowth("partner_grant_applied", { plan: grant.plan, months: grant.months ?? 0 }, userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (user) await sendPartnerEmail({ to: user.email, firstName: user.name.split(/\s+/)[0] ?? "", plan: grant.plan as CompPlan, expiresAt }).catch(() => undefined);
}

/** À l'inscription (formulaire et OAuth) : applique l'accès offert en attente pour cet email, s'il y en a un. */
export async function applyPendingPartnerGrant(userId: string, email: string): Promise<boolean> {
  const pending = await prisma.partnerGrant.findFirst({ where: { email: email.toLowerCase(), appliedAt: null, revokedAt: null }, orderBy: { createdAt: "desc" } });
  if (!pending) return false;
  await applyGrant(pending.id, userId);
  return true;
}

/** Révoque : l'accès s'arrête immédiatement, l'historique est conservé. */
export async function revokePartnerAccess(grantId: string): Promise<void> {
  const grant = await prisma.partnerGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.revokedAt) return;
  const now = new Date();
  await prisma.partnerGrant.update({ where: { id: grantId }, data: { revokedAt: now } });
  if (grant.userId) {
    // Ne retire le palier offert que si cette attribution est celle en vigueur.
    const other = await prisma.partnerGrant.findFirst({ where: { userId: grant.userId, revokedAt: null, appliedAt: { not: null }, id: { not: grantId } }, orderBy: { appliedAt: "desc" } });
    if (other) {
      await prisma.user.update({ where: { id: grant.userId }, data: { compPlan: other.plan, compMaxBrands: other.maxBrands, compUntil: other.expiresAt, compNote: other.note } });
    } else {
      await prisma.user.update({ where: { id: grant.userId }, data: { compPlan: null, compMaxBrands: null, compUntil: null, compNote: null } });
    }
  }
}

export interface PartnerGrantRow {
  id: string;
  email: string;
  plan: string;
  maxBrands: number;
  months: number | null;
  note: string | null;
  createdAt: string;
  appliedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  userName: string | null;
  status: "pending" | "active" | "expired" | "revoked";
}

export async function listPartnerGrants(): Promise<PartnerGrantRow[]> {
  const rows = await prisma.partnerGrant.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } }, take: 500 });
  const now = Date.now();
  return rows.map((g) => ({
    id: g.id,
    email: g.email,
    plan: g.plan,
    maxBrands: g.maxBrands,
    months: g.months,
    note: g.note,
    createdAt: g.createdAt.toISOString(),
    appliedAt: g.appliedAt?.toISOString() ?? null,
    expiresAt: g.expiresAt?.toISOString() ?? null,
    revokedAt: g.revokedAt?.toISOString() ?? null,
    userName: g.user?.name ?? null,
    status: g.revokedAt ? "revoked" : !g.appliedAt ? "pending" : g.expiresAt && g.expiresAt.getTime() < now ? "expired" : "active"
  }));
}

async function sendPartnerEmail(input: { to: string; firstName: string; plan: CompPlan; expiresAt: Date | null }) {
  const appUrl = process.env.NEXTAUTH_URL || "https://nebulahub.space";
  const label = PLAN_LIMITS[input.plan].label;
  const until = input.expiresAt ? `jusqu'au ${input.expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : "sans limite de durée";
  const layout = {
    title: `Votre accès ${label} est actif${input.firstName ? `, ${escapeHtml(input.firstName)}` : ""}`,
    paragraphs: [
      `Nebula vous offre le palier <strong>${label}</strong>, ${until} — sans carte bancaire, rien à faire de votre côté.`,
      "Assistant IA, rapports clients, calendrier partagé, page bio étendue : tout est débloqué dès maintenant dans votre espace.",
      "Une question, une idée, un bug ? Répondez simplement à cet email."
    ],
    cta: { label: "Ouvrir mon espace", url: `${appUrl}/dashboard` },
    signature: true
  };
  await sendEmail({ to: input.to, subject: `Votre accès ${label} Nebula est actif`, html: emailLayout(layout), text: emailPlainText(layout) });
}
