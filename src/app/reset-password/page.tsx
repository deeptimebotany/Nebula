import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// Titre d'onglet et description propres à cette page (le gabarit
// "%s — Nebula" vient de src/app/layout.tsx).
export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  description: "Choisissez un nouveau mot de passe pour votre compte Nebula.",
  robots: { index: false, follow: false }
};

// CSP stricte (nonce différent à chaque requête, voir src/lib/csp.ts) :
// rendu à chaque visite, jamais pré-généré.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");
  return <ResetPasswordForm />;
}
