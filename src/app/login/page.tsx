import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";
import { getEnabledOAuthProviders } from "@/lib/oauth-providers";
import { safeRelativePath } from "@/lib/safe-redirect";

// Titre d'onglet et description propres à cette page (le gabarit
// "%s — Nebula" vient de src/app/layout.tsx).
export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre espace Nebula pour planifier, publier et analyser vos réseaux sociaux."
};

// Composant serveur : si une session valide existe déjà (cookie persistant,
// voir src/lib/auth.ts), on saute directement au tableau de bord au lieu de
// réafficher le formulaire de connexion à chaque ouverture du site.
// Messages des erreurs de connexion Google/Apple/Meta (?error=…, voir
// resolveOAuthSignIn dans src/lib/auth.ts) et des redirections (?info=…).
const ERRORS: Record<string, string> = {
  AccountExists:
    "Un compte Nebula existe déjà avec cette adresse. Connectez-vous avec votre méthode habituelle (mot de passe ou Google), puis réessayez depuis votre compte.",
  EmailReserved: "Cette adresse ne peut pas être utilisée avec ce mode de connexion : utilisez « Continuer avec Google ».",
  AccessDenied: "Connexion refusée. Réessayez ou utilisez un autre moyen de connexion.",
  OAuthCallback: "La connexion a échoué. Réessayez dans un instant.",
  OAuthSignin: "La connexion a échoué. Réessayez dans un instant.",
  Callback: "La connexion a échoué. Réessayez dans un instant."
};
const INFOS: Record<string, string> = {
  "confirmer-email": "Connectez-vous pour confirmer votre adresse e-mail."
};

// CSP stricte (nonce différent à chaque requête, voir src/lib/csp.ts) :
// rendu à chaque visite, jamais pré-généré.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { callbackUrl?: string; error?: string; info?: string } }) {
  const callbackUrl = safeRelativePath(searchParams.callbackUrl, "/dashboard");
  const session = await getServerSession(authOptions);
  if (session?.user) redirect(callbackUrl);
  const error = searchParams.error ? ERRORS[searchParams.error] ?? ERRORS.OAuthCallback : null;
  const info = searchParams.info ? INFOS[searchParams.info] ?? null : null;
  return <LoginForm oauth={getEnabledOAuthProviders()} callbackUrl={callbackUrl} initialError={error} info={info} />;
}
