import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";

// Vrai multi-compte façon Google : plusieurs comptes Nebula (chacun connecté
// via Google/Apple/Meta ou email+mot de passe) accessibles dans le même
// navigateur, avec bascule instantanée entre eux — SANS repasser par une
// reconnexion complète à chaque fois. Rien de tout ça n'est stocké en base :
// exactement comme le sélecteur de comptes Google, c'est propre à CE
// navigateur (un cookie httpOnly par compte déjà connecté ici).
//
// Principe : la session NextAuth "active" vit dans un seul cookie standard
// (voir sessionCookieName). Dès qu'une connexion réussit, on copie ce même
// jeton chiffré dans un second cookie dédié à ce compte (nebula-session.<id
// utilisateur>) qui, lui, reste en place même après avoir basculé vers un
// autre compte. Changer de compte actif ne fait alors que RECOPIER le jeton
// déjà valide d'un slot vers l'autre (voir switchToAccount) — aucun aller-
// retour OAuth nécessaire, donc instantané.
const LINKED_COOKIE_PREFIX = "nebula-session.";
const MAX_LINKED_ACCOUNTS = 5;

function shouldUseSecureCookies(): boolean {
  return (process.env.NEXTAUTH_URL || "").startsWith("https://");
}

// Doit correspondre exactement au cookie que NextAuth pose lui-même pour la
// session JWT (voir sa logique interne : préfixe "__Secure-" uniquement
// quand servi en HTTPS). Non configurable ailleurs dans ce projet — on le
// recalcule ici plutôt que de dupliquer une constante.
export function sessionCookieName(): string {
  return shouldUseSecureCookies() ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

function linkedCookieName(uid: string): string {
  return `${LINKED_COOKIE_PREFIX}${uid}`;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 60 // 60 jours, aligné sur authOptions.session.maxAge
  };
}

export interface LinkedAccount {
  uid: string;
  name: string | null;
  email: string | null;
  image: string | null;
  active: boolean;
}

// Appelé juste après un login réussi (voir /api/accounts/link) : mémorise la
// session qui vient d'être posée par NextAuth dans un slot dédié à ce
// compte, pour pouvoir y revenir plus tard sans repasser par le
// fournisseur. Idempotent (rappeler avec le même compte ne fait que
// rafraîchir son cookie).
export function rememberCurrentSession(uid: string) {
  const store = cookies();
  const current = store.get(sessionCookieName())?.value;
  if (!current) return;
  store.set(linkedCookieName(uid), current, cookieOptions());
}

// Liste les comptes déjà connectés dans ce navigateur, avec lequel est
// actif — sert à afficher le sélecteur (voir account-switcher.tsx). Chaque
// jeton est validé (decode vérifie signature ET expiration) : un cookie
// périmé ou corrompu est simplement ignoré plutôt que d'afficher un compte
// cassé.
export async function listLinkedAccounts(): Promise<LinkedAccount[]> {
  const store = cookies();
  const secret = process.env.NEXTAUTH_SECRET;
  const activeRaw = store.get(sessionCookieName())?.value;
  const active = activeRaw && secret ? await decode({ token: activeRaw, secret }).catch(() => null) : null;
  const activeUid = (active as Record<string, unknown> | null)?.uid as string | undefined;

  const results: LinkedAccount[] = [];
  if (!secret) return results;

  for (const c of store.getAll()) {
    if (!c.name.startsWith(LINKED_COOKIE_PREFIX)) continue;
    const uid = c.name.slice(LINKED_COOKIE_PREFIX.length);
    const payload = await decode({ token: c.value, secret }).catch(() => null);
    if (!payload) continue;
    results.push({
      uid,
      name: (payload as Record<string, unknown>).name as string | null,
      email: (payload as Record<string, unknown>).email as string | null,
      image: (payload as Record<string, unknown>).picture as string | null,
      active: uid === activeUid
    });
  }
  return results.slice(0, MAX_LINKED_ACCOUNTS);
}

// Bascule le compte actif : recopie le jeton déjà validé du slot demandé
// vers le cookie de session principal. Renvoie false si ce compte n'a pas
// (ou plus) de session valide mémorisée dans ce navigateur — dans ce cas
// l'appelant doit proposer une reconnexion normale plutôt qu'une bascule.
export async function switchToAccount(uid: string): Promise<boolean> {
  const store = cookies();
  const secret = process.env.NEXTAUTH_SECRET;
  const target = store.get(linkedCookieName(uid))?.value;
  if (!target || !secret) return false;
  const payload = await decode({ token: target, secret }).catch(() => null);
  if (!payload) {
    store.delete(linkedCookieName(uid));
    return false;
  }
  store.set(sessionCookieName(), target, cookieOptions());
  return true;
}

// Retire un compte de la liste mémorisée dans ce navigateur (n'affecte pas
// sa session ailleurs) — si c'était le compte actif, sa session en cours
// reste valide jusqu'à une déconnexion explicite ou son expiration
// naturelle, elle disparaît juste du sélecteur pour la prochaine fois.
export function forgetAccount(uid: string) {
  cookies().delete(linkedCookieName(uid));
}
