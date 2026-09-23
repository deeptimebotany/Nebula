"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { AuthShell } from "@/components/auth/auth-shell";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), turnstileToken })
    }).catch(() => null);
    setLoading(false);
    if (!res) {
      setError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Une erreur est survenue. Réessayez dans un instant.");
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Indiquez votre email : si un compte existe, vous recevrez un lien pour choisir un nouveau mot de passe."
    >
      {sent ? (
        <div role="status" className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-sm text-emerald-200">
          <p className="font-medium">Email envoyé, si un compte correspond.</p>
          <p className="mt-1 text-emerald-200/80">
            Le lien est valable une heure. Pensez à vérifier vos courriers indésirables si vous ne voyez rien d&apos;ici
            quelques minutes.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            name="email"
            id="forgot-email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@marque.com"
          />
          <TurnstileWidget onVerify={setTurnstileToken} />
          {error && (
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading || !email} className="w-full">
            {loading ? "Envoi..." : "Envoyer le lien"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-400">
        <Link href="/login" className="text-aurora-300 hover:underline">
          ← Retour à la connexion
        </Link>
      </p>
    </AuthShell>
  );
}
