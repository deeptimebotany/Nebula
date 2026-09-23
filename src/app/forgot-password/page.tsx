import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

// Titre d'onglet et description propres à cette page (le gabarit
// "%s — Nebula" vient de src/app/layout.tsx).
export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Recevez un lien pour réinitialiser le mot de passe de votre compte Nebula.",
  robots: { index: false, follow: false }
};

// Composant serveur : si déjà connecté, inutile de repasser par ici.
export default async function ForgotPasswordPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");
  return <ForgotPasswordForm />;
}
