import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

// Composant serveur : si une session valide existe déjà (cookie persistant,
// voir src/lib/auth.ts), on saute directement au tableau de bord au lieu de
// réafficher le formulaire de connexion à chaque ouverture du site.
export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");
  return <LoginForm />;
}
