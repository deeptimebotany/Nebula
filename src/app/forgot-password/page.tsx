import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

// Composant serveur : si déjà connecté, inutile de repasser par ici.
export default async function ForgotPasswordPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");
  return <ForgotPasswordForm />;
}
