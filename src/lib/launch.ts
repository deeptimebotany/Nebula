// Pré-lancement (30/09/2026) : le site public reste visible (accueil, tarifs,
// outils gratuits), mais les inscriptions sont fermées et seules quelques
// adresses peuvent entrer dans l'application : le compte propriétaire,
// l'adresse de contact, les administrateurs (ADMIN_EMAILS) et la liste
// réglable PRELAUNCH_ALLOWED_EMAILS (testeurs Meta / TikTok, partenaires).
// Les visiteurs laissent leur adresse sur /bientot et reçoivent un seul
// e-mail le jour de l'ouverture (page propriétaire /admin/lancement).
//
// Ouvrir le site : NEXT_PUBLIC_SITE_OPEN=true dans Vercel, puis redéployer.
// Sans cette variable, le site reste en pré-lancement (fermé par défaut :
// un oubli ne laisse jamais entrer tout le monde par erreur).
//
// Module sans dépendance (ni base de données ni next/headers) : utilisé par
// le middleware (Edge), NextAuth, les routes API et les composants client.
// NEXT_PUBLIC_SITE_OPEN est lue au moment de la construction : les pages
// pré-générées et le navigateur voient donc la même valeur que le serveur.
import { isAdminEmail } from "@/lib/admin-emails";
import { cleanEnvValue } from "@/lib/env-value";
import { OWNER_EMAIL } from "@/lib/owner";

/** Adresse affichée sur /bientot pour écrire à l'équipe pendant le pré-lancement. */
export const PRELAUNCH_CONTACT_EMAIL = "contact.nebulahub@gmail.com";

/** Adresses toujours autorisées pendant le pré-lancement. */
export const PRELAUNCH_DEFAULT_EMAILS: readonly string[] = [OWNER_EMAIL, PRELAUNCH_CONTACT_EMAIL];

/** Liste d'attente « Prévenez-moi du lancement » (table NetworkWaitlist). */
export const LAUNCH_WAITLIST = "lancement";

/** Code d'erreur de connexion (NextAuth) : /login?error=Prelaunch. */
export const PRELAUNCH_ERROR = "Prelaunch";

/** Page publique du pré-lancement. */
export const PRELAUNCH_PAGE = "/bientot";

/** Paramètre de /register qui garde le formulaire pour les adresses invitées. */
export const EARLY_ACCESS_QUERY = { name: "acces", value: "anticipe" } as const;

export const PRELAUNCH_LOGIN_MESSAGE =
  "Nebula n'est pas encore ouvert : pendant le pré-lancement, seuls l'équipe et les partenaires invités peuvent se connecter. Laissez votre adresse sur la page « Bientôt » pour être prévenu de l'ouverture.";

export const PRELAUNCH_REGISTER_MESSAGE =
  "Les inscriptions ouvrent bientôt : pendant le pré-lancement, seules les adresses invitées peuvent créer un compte. Laissez votre adresse sur la page « Bientôt » pour être prévenu de l'ouverture.";

const OPEN_VALUES = new Set(["true", "1", "oui", "yes"]);

/** Vrai quand le site est officiellement ouvert à tous. */
export function isSiteOpen(): boolean {
  // Lecture directe (et non process.env[nom]) : Next.js remplace cette
  // expression par sa valeur au moment de la construction, y compris dans
  // le code envoyé au navigateur.
  return OPEN_VALUES.has(cleanEnvValue(process.env.NEXT_PUBLIC_SITE_OPEN).toLowerCase());
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Adresses de PRELAUNCH_ALLOWED_EMAILS (séparées par des virgules, des
 * points-virgules, des espaces ou des retours à la ligne ; guillemets et
 * espaces autour ignorés, comme pour les autres clés collées dans Vercel).
 */
export function extraAllowedEmails(raw: string | undefined = process.env.PRELAUNCH_ALLOWED_EMAILS): string[] {
  return cleanEnvValue(raw)
    .split(/[\s,;]+/)
    .map((e) => normalizeEmail(e.replace(/^["']|["']$/g, "")))
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

/** Adresses d'un texte collé (une par ligne, ou séparées par des virgules), sans doublon. */
export function parseEmailList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;<>()"']+/)
        .map((e) => normalizeEmail(e))
        .filter((e) => e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    )
  );
}

/** Toutes les adresses autorisées (sans doublon), pour la page propriétaire. */
export function prelaunchAllowedEmails(): string[] {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map(normalizeEmail).filter(Boolean);
  return Array.from(new Set([...PRELAUNCH_DEFAULT_EMAILS, ...extraAllowedEmails(), ...admins]));
}

/** Cette adresse peut-elle entrer pendant le pré-lancement ? */
export function isPrelaunchAllowed(email: string | null | undefined): boolean {
  if (typeof email !== "string" || !email.trim()) return false;
  const e = normalizeEmail(email);
  return PRELAUNCH_DEFAULT_EMAILS.includes(e) || extraAllowedEmails().includes(e) || isAdminEmail(e);
}

/** Cette adresse peut-elle se connecter ou créer un compte maintenant ? */
export function canEnterSite(email: string | null | undefined): boolean {
  return isSiteOpen() || isPrelaunchAllowed(email);
}

/**
 * Étapes affichées sur /bientot (barre de chargement et liste). « done » :
 * terminé ; « doing » : en cours (compte pour moitié dans la barre).
 */
export type LaunchStepState = "done" | "doing" | "todo";
export interface LaunchStep {
  label: string;
  detail: string;
  state: LaunchStepState;
}

export const LAUNCH_STEPS: LaunchStep[] = [
  { label: "Le studio de publication", detail: "Programmer, prévisualiser et publier sur chaque réseau.", state: "done" },
  { label: "Les outils gratuits", detail: "Déjà ouverts à tous, sans compte.", state: "done" },
  { label: "L'assistant IA et l'éditeur vidéo", detail: "Idées, textes, montage rapide dans le navigateur.", state: "done" },
  { label: "La validation des réseaux sociaux", detail: "Meta, TikTok et les autres vérifient nos accès officiels.", state: "doing" },
  { label: "Les démonstrations partenaires", detail: "Premiers essais en conditions réelles.", state: "doing" },
  { label: "L'ouverture officielle", detail: "Un e-mail part à toute la liste ce jour-là.", state: "todo" }
];

/** Avancement affiché (pour cent, arrondi) : terminé = 1, en cours = 0,5. */
export function launchProgress(steps: LaunchStep[] = LAUNCH_STEPS): number {
  if (steps.length === 0) return 0;
  const score = steps.reduce((sum, s) => sum + (s.state === "done" ? 1 : s.state === "doing" ? 0.5 : 0), 0);
  return Math.round((score / steps.length) * 100);
}
