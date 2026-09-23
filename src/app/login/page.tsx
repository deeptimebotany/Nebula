import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";
import { getEnabledOAuthProviders } from "@/lib/oauth-providers";

// Titre d'onglet et description propres à cette page (le gabarit
// "%s — Nebula" vient de src/app/layout.tsx).
export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre espace Nebula pour planifier, publier et analyser vos réseaux sociaux."
};

// Composant serveur : si une session valide existe déjà (cookie persistant,
// voir src/lib/auth.ts), on saute directement au tableau de bord au lieu de
// réafficher le formulaire de connexion à chaque ouverture du site.
export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");
  return <LoginForm oauth={getEnabledOAuthProviders()} />;
}
