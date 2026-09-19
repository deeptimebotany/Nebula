"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { TurnstileWidget } from "@/components/turnstile-widget";

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
      body: JSON.stringify({ email, turnstileToken })
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh opacity-70" />
      <GlassCard className="relative z-10 w-full max-w-sm p-8" hover={false}>
        <h1 className="font-display text-2xl font-semibold text-white">Mot de passe oublié</h1>
        <p className="mt-1 text-sm text-slate-400">
          Entrez votre email : si un compte existe, vous recevrez un lien pour choisir un nouveau mot de passe.
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-sm text-emerald-200">
            Si un compte existe avec cet email, un lien de réinitialisation vient d&apos;être envoyé. Pensez à
            vérifier vos spams.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
                placeholder="vous@marque.com"
              />
            </div>
            <TurnstileWidget onVerify={setTurnstileToken} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Envoi..." : "Envoyer le lien de réinitialisation"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-400">
          <Link href="/login" className="text-aurora-300 hover:underline">
            ← Retour à la connexion
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
