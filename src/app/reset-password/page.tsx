import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");
  return <ResetPasswordForm />;
}
