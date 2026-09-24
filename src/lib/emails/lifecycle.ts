// Emails de cycle de vie (brief growth, lot G3).
//
// Principe : chaque CLÉ (voir lifecycle-keys.ts) a une condition
// d'éligibilité évaluée EN BASE et un template. runLifecycleEmails(),
// appelée chaque heure par /api/cron et le worker, parcourt les clés, envoie
// l'email si la condition est vraie et que la clé n'a jamais été envoyée à
// cette adresse (unicité LifecycleEmail(email, key)). Garde-fous :
//   - au plus UN email de cycle de vie par personne et par 24 h ;
//   - fenêtre d'envoi 8 h–20 h dans le fuseau de la marque principale
//     (Europe/Paris par défaut) ;
//   - les emails de CONSEIL respectent User.lifecycleEmails ; les emails de
//     SERVICE (essai) partent toujours.
// Séquence leads (outils gratuits, table ToolLead) : s'arrête dès qu'un
// User existe avec la même adresse.
//
// Templates : même habillage que les emails existants (emailLayout), UN
// seul appel à l'action, signature « Lucas, Nebula ». Tout texte variable
// passe par escapeHtml.

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, escapeHtml } from "@/lib/email";
import { emailLayout, emailPlainText, type EmailLayoutInput } from "@/lib/emails/layout";
import { LIFECYCLE_KEYS, SERVICE_KEYS, type LifecycleKey } from "@/lib/emails/lifecycle-keys";
import { PLAN_LIMITS, annualFreeMonths } from "@/lib/plans";
import { TRIAL_DAYS, isTrialActive } from "@/lib/trial";
import { computeTrialSummary } from "@/lib/billing/trial-summary";
import { getUserPlan } from "@/lib/billing/plan";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function appUrl(): string {
  return process.env.NEXTAUTH_URL || "https://nebulahub.space";
}

// ---------------------------------------------------------------------------
// Désinscription : jeton signé (HMAC-SHA256, NEXTAUTH_SECRET) contenant
// l'email — vérifié par /api/email/unsubscribe.
// ---------------------------------------------------------------------------
function secret(): string {
  return process.env.NEXTAUTH_SECRET || "nebula-dev-secret";
}

export function unsubscribeToken(email: string): string {
  const payload = Buffer.from(email.toLowerCase()).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function unsubscribeUrl(email: string): string {
  return `${appUrl()}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(email))}`;
}

// ---------------------------------------------------------------------------
// Fenêtre d'envoi : 8 h – 20 h dans le fuseau de la marque principale.
// ---------------------------------------------------------------------------
function localHour(timezone: string, at = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: timezone }).formatToParts(at);
    return Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  } catch {
    return at.getUTCHours();
  }
}

export function inSendWindow(timezone: string, at = new Date()): boolean {
  const h = localHour(timezone, at);
  return h >= 8 && h < 20;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export interface LifecycleContext {
  firstName: string;
  email: string;
  brandName: string;
  network: string | null;
  trialEndsAt: Date | null;
  summary?: Awaited<ReturnType<typeof computeTrialSummary>> | null;
  annualMonths?: number;
  /** Lien de la page d'outil pour les leads. */
  toolPath?: string;
}

interface Rendered {
  subject: string;
  layout: EmailLayoutInput;
}

const NETWORK_FORMATS: Record<string, string[]> = {
  YOUTUBE: ["Une vidéo « 3 erreurs que je faisais » (8–12 min)", "Un Short qui reprend le meilleur moment d'une vidéo longue", "Une vidéo réponse aux commentaires reçus"],
  INSTAGRAM: ["Un carrousel « avant / après » en 5 diapositives", "Un Reel de 15 s avec un texte à l'écran dès la première seconde", "Une story sondage pour relancer la conversation"],
  TIKTOK: ["Un POV de 10 s avec accroche écrite", "Une réponse vidéo à un commentaire", "Un « jour dans ma vie » monté serré"],
  FACEBOOK: ["Une question courte à votre communauté", "Une photo coulisses avec une légende personnelle", "Un lien vers votre dernière vidéo avec 2 lignes de contexte"],
  BLUESKY: ["Un fil de 3 posts qui raconte une coulisse", "Une question ouverte à votre communauté", "Une image avec une astuce en une phrase"],
  THREADS: ["Une opinion tranchée sur votre domaine, en 2 phrases", "Un « ce que j'aurais aimé savoir » en carrousel", "Une question à laquelle on répond en un mot"],
  PINTEREST: ["Une épingle verticale « 5 idées pour… »", "Un tutoriel en étapes sur une seule image", "Une épingle qui renvoie vers votre dernier article ou votre page bio"],
  LINKEDIN: ["Un retour d'expérience avec un chiffre concret", "Les coulisses d'un projet terminé, en photo", "Une leçon apprise cette semaine, en 5 lignes"]
};

export function renderLifecycleEmail(key: LifecycleKey, ctx: LifecycleContext): Rendered {
  const name = escapeHtml(ctx.firstName);
  const brand = escapeHtml(ctx.brandName);
  const base = appUrl();
  const pro = PLAN_LIMITS.PRO.tiers[0];
  const sig = true;

  switch (key) {
    case "welcome":
      return {
        subject: `Bienvenue sur Nebula, ${ctx.firstName} — votre essai Pro a commencé`,
        layout: {
          title: `Bienvenue, ${name}`,
          paragraphs: [
            `Votre espace <strong>${brand}</strong> est prêt, et votre essai Pro de ${TRIAL_DAYS} jours a commencé : plusieurs marques, rapports clients, assistant IA, tout est ouvert, sans carte bancaire.`,
            "Une seule chose à faire pour démarrer : connecter un premier compte (YouTube, Instagram, Facebook ou TikTok). Deux minutes, et vous pouvez programmer votre première publication."
          ],
          cta: { label: "Connecter mon premier compte", url: `${base}/accounts` },
          footnotes: [`Nebula ne voit jamais vos mots de passe de réseaux : la connexion passe par l'autorisation officielle de chaque plateforme. <a href="${base}/securite" style="color:#6a2fe0">Comment vos données sont protégées</a>.`],
          signature: sig
        }
      };
    case "no_connection_48h":
      return {
        subject: "Il manque une étape pour publier avec Nebula",
        layout: {
          title: "Il manque une étape",
          paragraphs: [
            `Votre espace <strong>${brand}</strong> attend encore un compte connecté. C'est l'étape qui débloque tout le reste : programmation, statistiques, rapports.`,
            "Trois choses à savoir : Nebula ne voit jamais les mots de passe de vos réseaux (autorisation officielle de chaque plateforme) ; les jetons d'accès sont chiffrés côté serveur ; vous pouvez déconnecter un compte en un clic, à tout moment."
          ],
          cta: { label: "Connecter un compte", url: `${base}/accounts` },
          signature: sig
        }
      };
    case "first_post_scheduled":
      return {
        subject: "C'est programmé — et ensuite ?",
        layout: {
          title: "C'est programmé",
          paragraphs: [
            `Votre première publication pour <strong>${brand}</strong> partira à l'heure de votre marque, sans que vous ayez à y penser. Si un réseau la refuse, vous recevrez un email avec l'erreur exacte et un bouton pour réessayer.`,
            "Envie d'aller plus loin ? Un rapport automatique pour cette marque met vos résultats sous les yeux de votre client (ou les vôtres) chaque semaine, sans effort."
          ],
          cta: { label: "Activer un rapport automatique", url: `${base}/reports` },
          signature: sig
        }
      };
    case "unused_features_d7":
      return {
        subject: "Deux choses que vous n'avez pas encore essayées",
        layout: {
          title: "Deux choses à essayer cette semaine",
          paragraphs: [
            `<strong>Les rapports clients</strong> — une page de reporting pour ${brand}, toujours à jour, partageable par lien ou envoyée par email chaque semaine. <a href="${base}/reports" style="color:#6a2fe0">Ouvrir Rapports</a>.`,
            `<strong>La page bio</strong> — vos liens importants sur une page élégante, à mettre dans vos profils. <a href="${base}/link-in-bio" style="color:#6a2fe0">Créer ma page bio</a>.`
          ],
          cta: { label: "Ouvrir Nebula", url: `${base}/dashboard` },
          signature: sig
        }
      };
    case "trial_ends_48h": {
      const used: string[] = [];
      const u = ctx.summary?.used;
      if (u) {
        if (u.scheduledPosts) used.push(`${u.scheduledPosts} publication(s) programmée(s)`);
        if (u.reportsPublished) used.push(`${u.reportsPublished} rapport(s) client publié(s)`);
        if (u.bioLinksBeyondFree) used.push(`${u.bioLinksBeyondFree} lien(s) de page bio au-delà de ${PLAN_LIMITS.FREE.maxBioLinks}`);
        if (u.retentionAnalyses) used.push(`${u.retentionAnalyses} analyse(s) de rétention`);
        if (u.brandsBeyondFree) used.push(`${u.brandsBeyondFree} marque(s) supplémentaire(s)`);
      }
      return {
        subject: "Votre essai Pro se termine dans 48 h",
        layout: {
          title: "Plus que 48 heures de Pro",
          paragraphs: [
            used.length
              ? `Pendant votre essai, vous avez utilisé : ${escapeHtml(used.join(", "))}.`
              : "Votre essai Pro touche à sa fin. Vous n'avez pas encore utilisé les fonctions Pro : c'est le moment de les tester.",
            `Pour garder tout cela : Pro à ${pro.priceMonthly} €/mois (jusqu'à ${pro.maxBrands} marques), sans engagement, résiliable ou mis en pause à tout moment. Sinon, vous repassez en Gratuit sans rien perdre.`
          ],
          cta: { label: "Garder Pro", url: `${base}/billing` },
          signature: sig
        }
      };
    }
    case "trial_ended":
      return {
        subject: "Vous êtes passé en Gratuit — voici ce qui change",
        layout: {
          title: "Votre essai Pro est terminé",
          paragraphs: [
            `Rien n'a été supprimé. En Gratuit : ${PLAN_LIMITS.FREE.maxBioLinks} liens actifs sur la page bio (les autres sont conservés, désactivés), ${PLAN_LIMITS.FREE.tiers[0].maxBrands} marque active (les autres en lecture seule), rapports et calendrier client dépubliés, assistant IA et Rétention IA en pause. Vos publications déjà programmées partiront normalement.`,
            `Pour reprendre là où vous en étiez : <strong>-50 % sur votre premier mois Pro</strong>, valable 48 heures depuis la page Facturation (mensuel uniquement).`
          ],
          cta: { label: "Profiter de l'offre", url: `${base}/billing` },
          signature: sig
        }
      };
    case "inactive_14d": {
      const formats = NETWORK_FORMATS[ctx.network ?? ""] ?? NETWORK_FORMATS.INSTAGRAM;
      return {
        subject: "Reprendre en 5 minutes",
        layout: {
          title: "Reprendre en 5 minutes",
          paragraphs: [
            `Aucune publication depuis deux semaines pour <strong>${brand}</strong> — ça arrive. Trois formats qui marchent bien en ce moment sur votre réseau principal :`,
            `1. ${escapeHtml(formats[0])}<br/>2. ${escapeHtml(formats[1])}<br/>3. ${escapeHtml(formats[2])}`
          ],
          cta: { label: "Programmer une publication", url: `${base}/composer` },
          signature: sig
        }
      };
    }
    case "trial_gift":
      return {
        subject: `${TRIAL_DAYS} jours de Pro offerts sur votre compte Nebula`,
        layout: {
          title: `${TRIAL_DAYS} jours de Pro offerts`,
          paragraphs: [
            `Bonne nouvelle, ${name} : votre compte Nebula passe en Pro pendant ${TRIAL_DAYS} jours, sans rien faire et sans carte bancaire.`,
            `Ce que ça débloque : jusqu'à ${pro.maxBrands} marques, rapports clients automatiques, calendrier partagé, assistant IA, analyse de rétention, ${PLAN_LIMITS.PRO.maxBioLinks} liens sur la page bio. À la fin, vous repassez en Gratuit sans rien perdre.`
          ],
          cta: { label: "Découvrir les fonctions Pro", url: `${base}/dashboard` },
          signature: sig
        }
      };
    case "annual_nudge":
      return {
        subject: `Passez à l'annuel : ${ctx.annualMonths ?? annualFreeMonths(pro)} mois offerts`,
        layout: {
          title: `${ctx.annualMonths ?? annualFreeMonths(pro)} mois offerts avec l'annuel`,
          paragraphs: [
            "Vous utilisez Nebula depuis trois mois — merci. En passant à la facturation annuelle, vous payez dix mois au lieu de douze, en une fois, et vous n'y pensez plus.",
            "Le changement se fait depuis Facturation : basculez sur « Annuel », choisissez votre palier, Stripe fait le reste."
          ],
          cta: { label: "Passer à l'annuel", url: `${base}/billing` },
          signature: sig
        }
      };
    case "lead_t0":
      return {
        subject: "Vos générations bonus sont actives",
        layout: {
          title: "Vos 5 générations bonus sont actives",
          paragraphs: [
            "Merci ! Vous avez 5 générations de plus aujourd'hui sur l'outil gratuit.",
            "Et si vous pouviez programmer directement ce que vous générez ? Le bouton « Programmer avec Nebula » sous chaque résultat crée un brouillon prêt à partir sur vos réseaux."
          ],
          cta: { label: "Retour à l'outil", url: `${base}${ctx.toolPath ?? "/outils"}` },
          signature: sig
        }
      };
    case "lead_t2":
      return {
        subject: "Arrêtez le copier-coller",
        layout: {
          title: "Générez, programmez, publiez au même endroit",
          paragraphs: [
            "Aujourd'hui vous générez une légende ici, vous la collez là, vous programmez ailleurs. Nebula fait les trois d'un coup : l'IA propose, vous validez, la publication part à l'heure sur tous vos réseaux.",
            `Le compte est gratuit, et tout nouveau compte reçoit ${TRIAL_DAYS} jours de Pro.`
          ],
          cta: { label: "Créer mon compte", url: `${base}/register?utm_source=email&utm_medium=lead&utm_campaign=lead-outils` },
          signature: sig
        }
      };
    case "lead_t5":
      return {
        subject: "Ce que Nebula fait gratuitement",
        layout: {
          title: "Ce que Nebula fait gratuitement",
          paragraphs: [
            `Une page bio avec ${PLAN_LIMITS.FREE.maxBioLinks} liens, la publication sur YouTube, Instagram, Facebook et TikTok, un calendrier, vos statistiques — sans carte bancaire.`,
            `Et pour commencer, ${TRIAL_DAYS} jours de Pro offerts : rapports clients, assistant IA, plusieurs marques.`
          ],
          cta: { label: "Créer mon compte gratuit", url: `${base}/register?utm_source=email&utm_medium=lead&utm_campaign=lead-outils` },
          signature: sig
        }
      };
  }
}

// ---------------------------------------------------------------------------
// Envoi d'une clé à une adresse (avec unicité) — partagé par le runner et
// les aperçus du propriétaire.
// ---------------------------------------------------------------------------
export async function sendLifecycleEmail(key: LifecycleKey, ctx: LifecycleContext, options?: { userId?: string | null; record?: boolean; preview?: boolean }) {
  const rendered = renderLifecycleEmail(key, ctx);
  const advice = !SERVICE_KEYS.includes(key);
  const layout: EmailLayoutInput = { ...rendered.layout, unsubscribeUrl: advice && !options?.preview ? unsubscribeUrl(ctx.email) : null };
  const result = await sendEmail({
    to: ctx.email,
    subject: options?.preview ? `[Aperçu] ${rendered.subject}` : rendered.subject,
    html: emailLayout(layout),
    text: emailPlainText(layout)
  });
  if (result.ok && options?.record !== false && !options?.preview) {
    await prisma.lifecycleEmail.create({ data: { email: ctx.email.toLowerCase(), key, userId: options?.userId ?? undefined } }).catch(() => undefined);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Runner horaire
// ---------------------------------------------------------------------------
interface Candidate {
  key: LifecycleKey;
  userId: string | null;
  email: string;
  ctx: LifecycleContext;
  timezone: string;
}

async function alreadySent(email: string, key: LifecycleKey): Promise<boolean> {
  const row = await prisma.lifecycleEmail.findUnique({ where: { email_key: { email: email.toLowerCase(), key } } });
  return Boolean(row);
}

async function sentWithin24h(email: string): Promise<boolean> {
  const since = new Date(Date.now() - DAY_MS);
  const row = await prisma.lifecycleEmail.findFirst({ where: { email: email.toLowerCase(), sentAt: { gte: since } } });
  return Boolean(row);
}

async function userContext(user: { id: string; name: string; email: string; trialEndsAt: Date | null; memberships: { brand: { name: string; timezone: string; connections: { network: string }[] } }[] }): Promise<{ ctx: LifecycleContext; timezone: string }> {
  const main = user.memberships[0]?.brand;
  return {
    ctx: {
      firstName: user.name.split(" ")[0] || "vous",
      email: user.email,
      brandName: main?.name ?? "votre marque",
      network: main?.connections[0]?.network ?? null,
      trialEndsAt: user.trialEndsAt
    },
    timezone: main?.timezone || DEFAULT_TIMEZONE
  };
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  trialEndsAt: true,
  lifecycleEmails: true,
  paidInvoices: true,
  memberships: {
    where: { role: "OWNER" },
    orderBy: { id: "asc" as const },
    take: 1,
    select: { brand: { select: { id: true, name: true, timezone: true, connections: { where: { status: "CONNECTED" }, take: 1, select: { network: true } } } } }
  }
} as const;

/** Conditions d'éligibilité, clé par clé (voir brief §5). */
async function collectCandidates(now: Date): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const h48 = new Date(now.getTime() - 48 * HOUR_MS);
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const d14 = new Date(now.getTime() - 14 * DAY_MS);
  const recent = new Date(now.getTime() - 60 * DAY_MS);

  // Comptes récents (60 j) : la plupart des clés les concernent.
  const users = await prisma.user.findMany({ where: { createdAt: { gte: recent } }, select: USER_SELECT, take: 2000 });
  for (const u of users) {
    const { ctx, timezone } = await userContext(u);
    const brandId = u.memberships[0]?.brand.id;
    const push = (key: LifecycleKey, extra?: Partial<LifecycleContext>) => out.push({ key, userId: u.id, email: u.email, ctx: { ...ctx, ...extra }, timezone });

    // welcome — immédiat après inscription (le cron passe dans l'heure).
    push("welcome");

    // no_connection_48h — inscrit ≥ 48 h, aucune connexion.
    if (u.createdAt <= h48 && brandId) {
      const connections = await prisma.socialConnection.count({ where: { brand: { memberships: { some: { userId: u.id, role: "OWNER" } } } } });
      if (connections === 0) push("no_connection_48h");
    }

    // first_post_scheduled — première publication programmée, dans l'heure.
    const firstScheduled = await prisma.post.findFirst({ where: { createdById: u.id, status: { in: ["SCHEDULED", "PUBLISHING", "PUBLISHED"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    if (firstScheduled && now.getTime() - firstScheduled.createdAt.getTime() <= 6 * HOUR_MS) push("first_post_scheduled");

    // unused_features_d7 — J+7, ≥ 1 connexion, ni rapport ni page bio publiés.
    if (u.createdAt <= d7 && brandId) {
      const [connections, reports, bio] = await Promise.all([
        prisma.socialConnection.count({ where: { brand: { memberships: { some: { userId: u.id, role: "OWNER" } } } } }),
        prisma.brandReport.count({ where: { enabled: true, brand: { memberships: { some: { userId: u.id, role: "OWNER" } } } } }),
        prisma.linkPage.count({ where: { published: true, brand: { memberships: { some: { userId: u.id, role: "OWNER" } } } } })
      ]);
      if (connections >= 1 && reports === 0 && bio === 0) push("unused_features_d7");
    }

    // trial_gift — comptes existants migrés (essai posé par le cron, pas à
    // l'inscription) : trialEndsAt posé APRÈS la création du compte + 1 h.
    if (u.trialEndsAt && u.trialEndsAt.getTime() - u.createdAt.getTime() > (TRIAL_DAYS * DAY_MS + HOUR_MS)) push("trial_gift");
  }

  // trial_ends_48h / trial_ended — tous les comptes avec un essai.
  const trialUsers = await prisma.user.findMany({
    where: { trialEndsAt: { not: null, gte: new Date(now.getTime() - 3 * DAY_MS), lte: new Date(now.getTime() + 48 * HOUR_MS) } },
    select: USER_SELECT,
    take: 2000
  });
  for (const u of trialUsers) {
    const info = await getUserPlan(u.id);
    if (info.paid || info.comp) continue;
    const { ctx, timezone } = await userContext(u);
    if (isTrialActive(u.trialEndsAt, now) && u.trialEndsAt!.getTime() - now.getTime() <= 48 * HOUR_MS) {
      const summary = await computeTrialSummary(u.id);
      out.push({ key: "trial_ends_48h", userId: u.id, email: u.email, ctx: { ...ctx, summary }, timezone });
    }
    if (!isTrialActive(u.trialEndsAt, now)) {
      out.push({ key: "trial_ended", userId: u.id, email: u.email, ctx, timezone });
    }
  }

  // inactive_14d — dernière publication > 14 j, au moins un compte connecté.
  const inactive = await prisma.user.findMany({
    where: { memberships: { some: { role: "OWNER", brand: { connections: { some: { status: "CONNECTED" } } } } }, posts: { none: { createdAt: { gte: d14 } } }, createdAt: { lte: d14 } },
    select: USER_SELECT,
    take: 1000
  });
  for (const u of inactive) {
    const { ctx, timezone } = await userContext(u);
    out.push({ key: "inactive_14d", userId: u.id, email: u.email, ctx, timezone });
  }

  // annual_nudge — 3 factures mensuelles payées, abonnement mensuel.
  const nudge = await prisma.user.findMany({ where: { paidInvoices: { gte: 3 }, subscription: { interval: "month", plan: { not: "FREE" } } }, select: USER_SELECT, take: 500 });
  for (const u of nudge) {
    const { ctx, timezone } = await userContext(u);
    out.push({ key: "annual_nudge", userId: u.id, email: u.email, ctx: { ...ctx, annualMonths: annualFreeMonths(PLAN_LIMITS.PRO.tiers[0]) }, timezone });
  }

  // Leads des outils gratuits : lead_t0 (immédiat), lead_t2 (J+2), lead_t5
  // (J+5) — arrêt dès qu'un compte existe avec la même adresse.
  const leads = await prisma.toolLead.findMany({ where: { consent: true, createdAt: { gte: new Date(now.getTime() - 10 * DAY_MS) } }, orderBy: { createdAt: "asc" }, take: 2000 });
  const seen = new Set<string>();
  for (const lead of leads) {
    const email = lead.email.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const hasAccount = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (hasAccount) continue;
    const age = now.getTime() - lead.createdAt.getTime();
    const ctx: LifecycleContext = { firstName: "vous", email, brandName: "votre marque", network: null, trialEndsAt: null, toolPath: `/outils/${lead.tool}` };
    out.push({ key: "lead_t0", userId: null, email, ctx, timezone: DEFAULT_TIMEZONE });
    if (age >= 2 * DAY_MS) out.push({ key: "lead_t2", userId: null, email, ctx, timezone: DEFAULT_TIMEZONE });
    if (age >= 5 * DAY_MS) out.push({ key: "lead_t5", userId: null, email, ctx, timezone: DEFAULT_TIMEZONE });
  }

  return out;
}

export async function runLifecycleEmails(): Promise<{ sent: number; skipped: number; failed: number }> {
  if (!process.env.RESEND_API_KEY) return { sent: 0, skipped: 0, failed: 0 };
  const now = new Date();
  const candidates = await collectCandidates(now);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const sentThisRun = new Set<string>();

  // Ordre des clés = priorité quand plusieurs sont éligibles le même jour
  // (les emails de service d'abord).
  const priority = (k: LifecycleKey) => (SERVICE_KEYS.includes(k) ? 0 : 1) * 100 + LIFECYCLE_KEYS.indexOf(k);
  candidates.sort((a, b) => priority(a.key) - priority(b.key));

  for (const c of candidates) {
    const email = c.email.toLowerCase();
    if (sentThisRun.has(email)) {
      skipped += 1;
      continue;
    }
    if (await alreadySent(email, c.key)) continue;
    const isService = SERVICE_KEYS.includes(c.key);
    if (!isService) {
      if (c.userId) {
        const pref = await prisma.user.findUnique({ where: { id: c.userId }, select: { lifecycleEmails: true } });
        if (pref && pref.lifecycleEmails === false) {
          skipped += 1;
          continue;
        }
      }
      if (!inSendWindow(c.timezone, now)) {
        skipped += 1;
        continue;
      }
    }
    if (await sentWithin24h(email)) {
      skipped += 1;
      continue;
    }
    try {
      const result = await sendLifecycleEmail(c.key, c.ctx, { userId: c.userId });
      if (result.ok) {
        sent += 1;
        sentThisRun.add(email);
      } else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, skipped, failed };
}

/** Aperçu envoyé au propriétaire avec des données factices (page /admin). */
export async function sendLifecyclePreview(key: LifecycleKey, to: string) {
  const ctx: LifecycleContext = {
    firstName: "Lucas",
    email: to,
    brandName: "Ma marque de démonstration",
    network: "YOUTUBE",
    trialEndsAt: new Date(Date.now() + 2 * DAY_MS),
    summary: {
      onTrial: true,
      paid: false,
      trialEndsAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
      used: { scheduledPosts: 6, reportsPublished: 1, calendarSharesPublished: 1, bioLinks: 5, bioLinksBeyondFree: 2, retentionAnalyses: 2, brands: 2, brandsBeyondFree: 1 },
      locked: { reports: true, calendarShare: true, ai: true, bioLinksLimit: PLAN_LIMITS.FREE.maxBioLinks, maxBrands: 1 }
    },
    annualMonths: annualFreeMonths(PLAN_LIMITS.PRO.tiers[0]),
    toolPath: "/outils/legendes"
  };
  return sendLifecycleEmail(key, ctx, { preview: true, record: false });
}
