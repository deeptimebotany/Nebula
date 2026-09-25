import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/register-form";
import { getEnabledOAuthProviders } from "@/lib/oauth-providers";

// Titre d'onglet et description propres à cette page (le gabarit
// "%s — Nebula" vient de src/app/layout.tsx).
export const metadata: Metadata = {
  title: "Créer un compte",
  description: "Créez votre espace Nebula gratuitement : planification, publication multi-réseaux et analytics en un seul endroit."
};

// CSP stricte (nonce différent à chaque requête, voir src/lib/csp.ts) :
// rendu à chaque visite, jamais pré-généré.
export const dynamic = "force-dynamic";

// Composant serveur : si une session valide existe déjà, on saute
// directement au tableau de bord au lieu de réafficher l'inscription.
export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");
  return <RegisterForm oauth={getEnabledOAuthProviders()} />;
}
