"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { IconGoogle, IconApple } from "@/components/dashboard/icons";
import { NebulaBrandMark } from "@/components/dashboard/nebula-brandmark";

interface LoginFormProps {
  oauth?: { google: boolean; apple: boolean };
}

export function LoginForm({ oauth }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh opacity-70" />
      <GlassCard className="relative z-10 w-full max-w-sm p-8" hover={false}>
        <NebulaBrandMark className="mb-5" />
        <h1 className="font-display text-2xl font-semibold text-white">Bon retour</h1>
        <p className="mt-1 text-sm text-slate-400">Connectez-vous à votre cockpit social.</p>

        {(oauth?.google || oauth?.apple) && (
          <div className="mt-6 space-y-2">
            {oauth.google && (
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                <IconGoogle className="h-4 w-4" /> Continuer avec Google
              </button>
            )}
            {oauth.apple && (
              <button
                type="button"
                onClick={() => signIn("apple", { callbackUrl: "/dashboard" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                <IconApple className="h-4 w-4" /> Continuer avec Apple
              </button>
            )}
            <div className="flex items-center gap-3 pt-2">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-slate-500">ou avec votre email</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
            <input
              type="email"
              name="email"
              id="login-email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
              placeholder="vous@marque.com"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-400">Mot de passe</label>
              <Link href="/forgot-password" className="text-xs text-aurora-300 hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>
            <input
              type="password"
              name="password"
              id="login-password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Connexion..." : "Se connecter"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Pas encore de compte ?{" "}
          <Link href="/register" className="text-aurora-300 hover:underline">
            Créer un espace
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
