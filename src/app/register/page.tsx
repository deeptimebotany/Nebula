import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/register-form";

// Composant serveur : si une session valide existe déjà, on saute
// directement au tableau de bord au lieu de réafficher l'inscription.
export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");
  return <RegisterForm />;
}
